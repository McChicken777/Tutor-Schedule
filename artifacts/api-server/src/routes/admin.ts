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
  complaintsTable,
} from "@workspace/db";
import {
  CreateTestimonialBody,
  UpdateTestimonialBody,
  CreateFaqBody,
  UpdateFaqBody,
  UpdateComplaintParams,
  UpdateComplaintBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

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

  const [{ count: openComplaintsCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(complaintsTable)
    .where(eq(complaintsTable.status, "open"));

  res.json({
    totalTeachers,
    totalStudents,
    totalBookingsThisWeek,
    totalPendingHomework,
    openComplaintsCount,
  });
});

// ─── Complaints ───────────────────────────────────────────────────────────────

router.get("/admin/complaints", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ complaint: complaintsTable, teacher: teachersTable })
    .from(complaintsTable)
    .innerJoin(teachersTable, eq(complaintsTable.teacherId, teachersTable.id))
    .orderBy(desc(complaintsTable.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.complaint.id,
      teacherId: r.complaint.teacherId,
      teacherName: r.teacher.displayName,
      body: r.complaint.body,
      status: r.complaint.status,
      createdAt: r.complaint.createdAt,
    })),
  );
});

router.patch("/admin/complaints/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsedParams = UpdateComplaintParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ complaint: complaintsTable, teacher: teachersTable })
    .from(complaintsTable)
    .innerJoin(teachersTable, eq(complaintsTable.teacherId, teachersTable.id))
    .where(eq(complaintsTable.id, parsedParams.data.id));
  if (!existing) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }

  const [updated] = await db
    .update(complaintsTable)
    .set({ status: parsed.data.status })
    .where(eq(complaintsTable.id, parsedParams.data.id))
    .returning();

  res.json({
    id: updated.id,
    teacherId: updated.teacherId,
    teacherName: existing.teacher.displayName,
    body: updated.body,
    status: updated.status,
    createdAt: updated.createdAt,
  });
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
