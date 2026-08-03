import { Router, type IRouter } from "express";
import { eq, and, desc, asc, gte, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  homeworkTable,
  teachersTable,
  testimonialsTable,
  faqsTable,
  reportsTable,
  messagesTable,
  homeworkFilesTable,
} from "@workspace/db";
import {
  CreateTestimonialBody,
  UpdateTestimonialBody,
  CreateFaqBody,
  UpdateFaqBody,
  UpdateReportParams,
  UpdateReportBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { mapReportRow } from "../lib/reportMapper";

const router: IRouter = Router();

// A banned admin can never unban anyone (requireTeacher rejects banned users
// before requireAdmin even runs), so banning yourself or emptying the pool of
// unbanned admins would permanently lock the whole platform out of moderation.
async function assertTeacherBannable(targetId: number, actingTeacherId: number): Promise<string | null> {
  if (targetId === actingTeacherId) {
    return "You cannot ban your own account";
  }
  const [target] = await db.select().from(teachersTable).where(eq(teachersTable.id, targetId));
  if (target?.isAdmin && !target.isBanned) {
    const [{ count: otherActiveAdmins }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(teachersTable)
      .where(and(eq(teachersTable.isAdmin, true), eq(teachersTable.isBanned, false), sql`${teachersTable.id} != ${targetId}`));
    if (otherActiveAdmins === 0) {
      return "Cannot ban the last remaining active admin";
    }
  }
  return null;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
// Platform-wide, unscoped by teacherId — the admin sees the whole business,
// not just their own teaching load (that view lives at /teacher/dashboard).

router.get("/admin/dashboard", requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [{ count: totalTeachers }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teachersTable);

  const [{ count: totalStudents }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const [{ count: totalBookingsThisWeek }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "upcoming"),
        gte(bookingsTable.startTime, now),
        lt(bookingsTable.startTime, weekEnd),
      ),
    );

  const [{ count: totalPendingHomework }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(homeworkTable)
    .where(
      and(
        sql`${homeworkTable.submittedAt} IS NOT NULL`,
        sql`${homeworkTable.reviewedAt} IS NULL`,
      ),
    );

  const [{ count: openReportsCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(eq(reportsTable.status, "open"));

  res.json({
    totalTeachers,
    totalStudents,
    totalBookingsThisWeek,
    totalPendingHomework,
    openReportsCount,
  });
});

// ─── Reports ──────────────────────────────────────────────────────────────────

async function resolveAccountName(
  role: "student" | "teacher",
  studentId: number | null,
  teacherId: number | null,
): Promise<string> {
  if (role === "student" && studentId != null) {
    const [u] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, studentId));
    return u?.displayName ?? "Unknown";
  }
  if (role === "teacher" && teacherId != null) {
    const [t] = await db.select({ displayName: teachersTable.displayName }).from(teachersTable).where(eq(teachersTable.id, teacherId));
    return t?.displayName ?? "Unknown";
  }
  return "Unknown";
}

async function resolveTargetPreview(targetType: string, targetId: number | null): Promise<string | null> {
  if (targetId == null) return null;
  if (targetType === "message") {
    const [m] = await db.select({ body: messagesTable.body }).from(messagesTable).where(eq(messagesTable.id, targetId));
    return m ? m.body.slice(0, 140) : null;
  }
  if (targetType === "homework_file") {
    const [f] = await db.select({ name: homeworkFilesTable.name }).from(homeworkFilesTable).where(eq(homeworkFilesTable.id, targetId));
    return f ? f.name : null;
  }
  return null;
}

async function buildReportResponse(report: typeof reportsTable.$inferSelect) {
  const reporterName = await resolveAccountName(
    report.reporterRole as "student" | "teacher",
    report.reporterStudentId,
    report.reporterTeacherId,
  );
  const targetPreview = await resolveTargetPreview(report.targetType, report.targetId);
  const reportedUserName = report.reportedUserRole
    ? await resolveAccountName(report.reportedUserRole as "student" | "teacher", report.reportedStudentId, report.reportedTeacherId)
    : null;
  return mapReportRow(report, reporterName, targetPreview, reportedUserName);
}

router.get("/admin/reports", requireAdmin, async (req, res): Promise<void> => {
  const { status } = req.query;
  const rows =
    status === "open" || status === "resolved" || status === "actioned"
      ? await db.select().from(reportsTable).where(eq(reportsTable.status, status)).orderBy(desc(reportsTable.createdAt))
      : await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));

  res.json(await Promise.all(rows.map(buildReportResponse)));
});

router.patch("/admin/reports/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsedParams = UpdateReportParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(reportsTable).where(eq(reportsTable.id, parsedParams.data.id));
  if (!existing) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const [updated] = await db
    .update(reportsTable)
    .set({ status: parsed.data.status })
    .where(eq(reportsTable.id, parsedParams.data.id))
    .returning();

  res.json(await buildReportResponse(updated));
});

router.post("/admin/reports/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  if (!existing.reportedUserRole) {
    res.status(400).json({ error: "This report has no reported user to ban" });
    return;
  }

  if (existing.reportedUserRole === "teacher" && existing.reportedTeacherId != null) {
    const denyReason = await assertTeacherBannable(existing.reportedTeacherId, (req as any).teacherId as number);
    if (denyReason) {
      res.status(400).json({ error: denyReason });
      return;
    }
    await db
      .update(teachersTable)
      .set({ isBanned: true, bannedAt: new Date() })
      .where(eq(teachersTable.id, existing.reportedTeacherId));
  } else if (existing.reportedUserRole === "student" && existing.reportedStudentId != null) {
    await db
      .update(usersTable)
      .set({ isBanned: true, bannedAt: new Date() })
      .where(eq(usersTable.id, existing.reportedStudentId));
  }

  const [updated] = await db
    .update(reportsTable)
    .set({ status: "actioned", actionedAt: new Date() })
    .where(eq(reportsTable.id, id))
    .returning();

  res.json(await buildReportResponse(updated));
});

// ─── Accounts (ban / unban) ───────────────────────────────────────────────────
// The report-detail "Ban this user" action above and the standalone Accounts
// page below both terminate here — one shared ban/unban path per role, no
// duplicated moderation logic.

router.get("/admin/teachers", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(teachersTable).orderBy(asc(teachersTable.id));
  res.json(
    rows.map((t) => ({
      id: t.id,
      role: "teacher" as const,
      name: t.displayName,
      email: t.email,
      isAdmin: t.isAdmin,
      isBanned: t.isBanned,
    })),
  );
});

router.post("/admin/teachers/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const denyReason = await assertTeacherBannable(id, (req as any).teacherId as number);
  if (denyReason) {
    res.status(400).json({ error: denyReason });
    return;
  }

  const [updated] = await db
    .update(teachersTable)
    .set({ isBanned: true, bannedAt: new Date() })
    .where(eq(teachersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json({ id: updated.id, role: "teacher", name: updated.displayName, email: updated.email, isAdmin: updated.isAdmin, isBanned: updated.isBanned });
});

router.delete("/admin/teachers/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [updated] = await db
    .update(teachersTable)
    .set({ isBanned: false, bannedAt: null })
    .where(eq(teachersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json({ id: updated.id, role: "teacher", name: updated.displayName, email: updated.email, isAdmin: updated.isAdmin, isBanned: updated.isBanned });
});

router.get("/admin/students", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(asc(usersTable.id));
  res.json(
    rows.map((u) => ({
      id: u.id,
      role: "student" as const,
      name: u.displayName,
      email: u.email,
      isAdmin: false,
      isBanned: u.isBanned,
    })),
  );
});

router.post("/admin/students/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [updated] = await db
    .update(usersTable)
    .set({ isBanned: true, bannedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ id: updated.id, role: "student", name: updated.displayName, email: updated.email, isAdmin: false, isBanned: updated.isBanned });
});

router.delete("/admin/students/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [updated] = await db
    .update(usersTable)
    .set({ isBanned: false, bannedAt: null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ id: updated.id, role: "student", name: updated.displayName, email: updated.email, isAdmin: false, isBanned: updated.isBanned });
});

// ─── Testimonials ─────────────────────────────────────────────────────────────
// Deliberately left unscoped by teacher — a single global testimonials list,
// admin-managed platform-wide content.

router.get("/admin/testimonials", requireAdmin, async (_req, res): Promise<void> => {
  const items = await db.select().from(testimonialsTable).orderBy(desc(testimonialsTable.createdAt));
  res.json(items);
});

router.post("/admin/testimonials", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTestimonialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(testimonialsTable)
    .values({
      studentName: parsed.data.studentName,
      text: parsed.data.text,
      rating: parsed.data.rating,
      isVisible: parsed.data.isVisible ?? true,
    })
    .returning();

  res.status(201).json(item);
});

router.patch("/admin/testimonials/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateTestimonialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(testimonialsTable).where(eq(testimonialsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Testimonial not found" });
    return;
  }

  const updateData: any = {};
  if (parsed.data.studentName != null) updateData.studentName = parsed.data.studentName;
  if (parsed.data.text != null) updateData.text = parsed.data.text;
  if (parsed.data.rating != null) updateData.rating = parsed.data.rating;
  if (parsed.data.isVisible != null) updateData.isVisible = parsed.data.isVisible;

  const [updated] = await db
    .update(testimonialsTable)
    .set(updateData)
    .where(eq(testimonialsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/admin/testimonials/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(testimonialsTable).where(eq(testimonialsTable.id, id));
  res.sendStatus(204);
});

// ─── FAQs ─────────────────────────────────────────────────────────────────────
// Deliberately left unscoped — see Testimonials note above.

router.get("/admin/faqs", requireAdmin, async (_req, res): Promise<void> => {
  const items = await db.select().from(faqsTable).orderBy(asc(faqsTable.displayOrder));
  res.json(items);
});

router.post("/admin/faqs", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateFaqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(faqsTable)
    .values({
      question: parsed.data.question,
      answer: parsed.data.answer,
      displayOrder: parsed.data.displayOrder ?? 0,
      isVisible: parsed.data.isVisible ?? true,
    })
    .returning();

  res.status(201).json(item);
});

router.patch("/admin/faqs/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateFaqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(faqsTable).where(eq(faqsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "FAQ not found" });
    return;
  }

  const updateData: any = {};
  if (parsed.data.question != null) updateData.question = parsed.data.question;
  if (parsed.data.answer != null) updateData.answer = parsed.data.answer;
  if (parsed.data.displayOrder != null) updateData.displayOrder = parsed.data.displayOrder;
  if (parsed.data.isVisible != null) updateData.isVisible = parsed.data.isVisible;

  const [updated] = await db
    .update(faqsTable)
    .set(updateData)
    .where(eq(faqsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/admin/faqs/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(faqsTable).where(eq(faqsTable.id, id));
  res.sendStatus(204);
});

export default router;
