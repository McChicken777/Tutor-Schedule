import { Router, type IRouter } from "express";
import { eq, ne, and, desc, asc, gte, lt, gt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  lessonTypesTable,
  lessonPackagesTable,
  creditBundlesTable,
  homeworkTable,
  reviewsTable,
  testimonialsTable,
  faqsTable,
  siteSettingsTable,
  messagesTable,
  availabilityOverridesTable,
} from "@workspace/db";
import {
  AdminLoginBody,
  UpdateAdminBookingBody,
  UpdateAdminBookingParams,
  CompleteBookingBody,
  CreateLessonTypeBody,
  UpdateLessonTypeBody,
  UpdateLessonTypeParams,
  DeleteLessonTypeParams,
  CreateCreditBundleBody,
  UpdateCreditBundleBody,
  UpdateCreditBundleParams,
  DeleteCreditBundleParams,
  UpdateHomeworkBody,
  UpdateHomeworkParams,
  GetAdminStudentParams,
  GrantPackageBody,
  CreateTestimonialBody,
  UpdateTestimonialBody,
  UpdateTestimonialParams,
  DeleteTestimonialParams,
  CreateFaqBody,
  UpdateFaqBody,
  UpdateFaqParams,
  DeleteFaqParams,
  UpdateSiteSettingsBody,
  SendAdminMessageBody,
  SetDayAvailabilityOverridesBody,
  DeleteAvailabilityOverrideParams,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { requireAdmin } from "../middlewares/requireAdmin";
import { isCalendarConnected, getCalendarEmail, deleteCalendarEvent, createOAuth2Client, getFreeBusySlots, zonedDayRange } from "../lib/calendar";
import { google } from "googleapis";
import { calendarTokensTable } from "@workspace/db";
import { mapHomeworkRow } from "../lib/homeworkMapper";

const router: IRouter = Router();

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post("/admin/login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || parsed.data.password !== adminPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  (req.session as any).isAdmin = true;
  res.json({ success: true });
});

router.post("/admin/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/admin/dashboard", requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const todayRows = await db
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(
      and(
        eq(bookingsTable.status, "upcoming"),
        gte(bookingsTable.startTime, todayStart),
        lt(bookingsTable.startTime, todayEnd),
      ),
    )
    .orderBy(asc(bookingsTable.startTime));

  const [{ count: upcomingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(eq(bookingsTable.status, "upcoming"));

  const [{ count: studentCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const [{ count: pendingHwCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(homeworkTable)
    .where(
      and(
        sql`${homeworkTable.submittedAt} IS NOT NULL`,
        sql`${homeworkTable.reviewedAt} IS NULL`,
      ),
    );

  const [{ count: weekCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "upcoming"),
        gte(bookingsTable.startTime, now),
        lt(bookingsTable.startTime, weekEnd),
      ),
    );

  const [{ count: pendingTestCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(testimonialsTable)
    .where(eq(testimonialsTable.isVisible, false));

  res.json({
    todayBookings: todayRows.map((r) => ({
      id: r.booking.id,
      studentId: r.booking.studentId,
      studentName: r.user.displayName,
      studentEmail: r.user.email,
      lessonTypeId: r.booking.lessonTypeId,
      lessonTypeName: r.lessonType.name,
      startTime: r.booking.startTime,
      endTime: r.booking.endTime,
      status: r.booking.status,
      meetLink: r.booking.meetLink ?? null,
      notes: r.booking.notes ?? null,
      createdAt: r.booking.createdAt,
    })),
    upcomingBookingsCount: upcomingCount,
    totalStudents: studentCount,
    pendingHomeworkCount: pendingHwCount,
    pendingTestimonialsCount: pendingTestCount,
    thisWeekBookings: weekCount,
  });
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

router.get("/admin/bookings", requireAdmin, async (req, res): Promise<void> => {
  const { status, date } = req.query;
  const conditions: any[] = [];

  if (status && typeof status === "string") {
    conditions.push(eq(bookingsTable.status, status));
  }

  if (date && typeof date === "string") {
    const d = new Date(date);
    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);
    conditions.push(gte(bookingsTable.startTime, d));
    conditions.push(lt(bookingsTable.startTime, dEnd));
  }

  const rows = await db
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookingsTable.startTime));

  res.json(
    rows.map((r) => ({
      id: r.booking.id,
      studentId: r.booking.studentId,
      studentName: r.user.displayName,
      studentEmail: r.user.email,
      lessonTypeId: r.booking.lessonTypeId,
      lessonTypeName: r.lessonType.name,
      startTime: r.booking.startTime,
      endTime: r.booking.endTime,
      status: r.booking.status,
      meetLink: r.booking.meetLink ?? null,
      notes: r.booking.notes ?? null,
      createdAt: r.booking.createdAt,
    })),
  );
});

router.patch("/admin/bookings/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateAdminBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(bookingsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  if (parsed.data.status === "cancelled" && row.booking.calendarEventId) {
    await deleteCalendarEvent(row.booking.calendarEventId);
  }

  const updateData: any = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.notes != null) updateData.notes = parsed.data.notes;

  const [updated] = await db
    .update(bookingsTable)
    .set(updateData)
    .where(eq(bookingsTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    studentId: updated.studentId,
    studentName: row.user.displayName,
    studentEmail: row.user.email,
    lessonTypeId: updated.lessonTypeId,
    lessonTypeName: row.lessonType.name,
    startTime: updated.startTime,
    endTime: updated.endTime,
    status: updated.status,
    meetLink: updated.meetLink ?? null,
    notes: updated.notes ?? null,
    createdAt: updated.createdAt,
  });
});

// A booking can only ever reach "completed" through here — the generic update
// above no longer accepts that status — so it always carries a recap, and
// optionally an assigned-homework note, rather than being a bare status flip.
router.patch("/admin/bookings/:id/complete", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = CompleteBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(bookingsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "completed", notes: parsed.data.notes })
    .where(eq(bookingsTable.id, id))
    .returning();

  if (
    parsed.data.homeworkAssignedText != null ||
    parsed.data.homeworkAssignedFileUrl != null ||
    parsed.data.homeworkAssignedFileKey != null
  ) {
    const assignment = {
      assignedText: parsed.data.homeworkAssignedText ?? null,
      assignedFileUrl: parsed.data.homeworkAssignedFileUrl ?? null,
      assignedFileKey: parsed.data.homeworkAssignedFileKey ?? null,
      assignedFileName: parsed.data.homeworkAssignedFileName ?? null,
      assignedFileMime: parsed.data.homeworkAssignedFileMime ?? null,
    };

    // Bookings normally get an empty homework row at creation time, but older
    // (and seeded) bookings predate that — upsert so the assignment is never
    // silently dropped by an UPDATE that matches no rows.
    const [existingHw] = await db
      .select({ id: homeworkTable.id })
      .from(homeworkTable)
      .where(eq(homeworkTable.bookingId, id));

    if (existingHw) {
      await db.update(homeworkTable).set(assignment).where(eq(homeworkTable.bookingId, id));
    } else {
      await db.insert(homeworkTable).values({ bookingId: id, ...assignment });
    }
  }

  res.json({
    id: updated.id,
    studentId: updated.studentId,
    studentName: row.user.displayName,
    studentEmail: row.user.email,
    lessonTypeId: updated.lessonTypeId,
    lessonTypeName: row.lessonType.name,
    startTime: updated.startTime,
    endTime: updated.endTime,
    status: updated.status,
    meetLink: updated.meetLink ?? null,
    notes: updated.notes ?? null,
    createdAt: updated.createdAt,
  });
});

// ─── Lesson types ─────────────────────────────────────────────────────────────

router.get("/admin/lesson-types", requireAdmin, async (_req, res): Promise<void> => {
  const types = await db.select().from(lessonTypesTable).orderBy(asc(lessonTypesTable.id));
  res.json(types);
});

router.post("/admin/lesson-types", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateLessonTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Only one lesson type can be "the" free trial at a time
  if (parsed.data.isTrial) {
    await db.update(lessonTypesTable).set({ isTrial: false }).where(eq(lessonTypesTable.isTrial, true));
  }

  const [type] = await db
    .insert(lessonTypesTable)
    .values({
      name: parsed.data.name,
      durationMinutes: parsed.data.durationMinutes,
      creditCost: parsed.data.creditCost,
      description: parsed.data.description,
      isActive: parsed.data.isActive ?? true,
      isTrial: parsed.data.isTrial ?? false,
    })
    .returning();

  res.status(201).json(type);
});

router.patch("/admin/lesson-types/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateLessonTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(lessonTypesTable).where(eq(lessonTypesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Lesson type not found" });
    return;
  }

  // Only one lesson type can be "the" free trial at a time
  if (parsed.data.isTrial) {
    await db
      .update(lessonTypesTable)
      .set({ isTrial: false })
      .where(and(eq(lessonTypesTable.isTrial, true), ne(lessonTypesTable.id, id)));
  }

  const updateData: any = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.durationMinutes != null) updateData.durationMinutes = parsed.data.durationMinutes;
  if (parsed.data.creditCost != null) updateData.creditCost = parsed.data.creditCost;
  if (parsed.data.description != null) updateData.description = parsed.data.description;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;
  if (parsed.data.isTrial != null) updateData.isTrial = parsed.data.isTrial;

  const [updated] = await db
    .update(lessonTypesTable)
    .set(updateData)
    .where(eq(lessonTypesTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/admin/lesson-types/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db.select().from(lessonTypesTable).where(eq(lessonTypesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Lesson type not found" });
    return;
  }

  await db.delete(lessonTypesTable).where(eq(lessonTypesTable.id, id));
  res.sendStatus(204);
});

router.get("/admin/credit-bundles", requireAdmin, async (_req, res): Promise<void> => {
  const bundles = await db
    .select()
    .from(creditBundlesTable)
    .orderBy(asc(creditBundlesTable.sortOrder), asc(creditBundlesTable.credits));
  res.json(bundles);
});

router.post("/admin/credit-bundles", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCreditBundleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [bundle] = await db
    .insert(creditBundlesTable)
    .values({
      credits: parsed.data.credits,
      priceCents: parsed.data.priceCents,
      sortOrder: parsed.data.sortOrder ?? 0,
      isActive: parsed.data.isActive ?? true,
    })
    .returning();

  res.status(201).json(bundle);
});

router.patch("/admin/credit-bundles/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateCreditBundleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(creditBundlesTable).where(eq(creditBundlesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Credit bundle not found" });
    return;
  }

  const updateData: any = {};
  if (parsed.data.credits != null) updateData.credits = parsed.data.credits;
  if (parsed.data.priceCents != null) updateData.priceCents = parsed.data.priceCents;
  if (parsed.data.sortOrder != null) updateData.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

  const [updated] = await db
    .update(creditBundlesTable)
    .set(updateData)
    .where(eq(creditBundlesTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/admin/credit-bundles/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db.select().from(creditBundlesTable).where(eq(creditBundlesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Credit bundle not found" });
    return;
  }

  await db.delete(creditBundlesTable).where(eq(creditBundlesTable.id, id));
  res.sendStatus(204);
});

// ─── Homework ─────────────────────────────────────────────────────────────────

router.get("/admin/homework", requireAdmin, async (req, res): Promise<void> => {
  const { reviewed, studentId, submitted } = req.query;
  const conditions: any[] = [];

  if (submitted === "false") {
    conditions.push(sql`${homeworkTable.submittedAt} IS NULL`);
  } else {
    // default (and submitted=true): preserve legacy global-inbox behavior
    conditions.push(sql`${homeworkTable.submittedAt} IS NOT NULL`);
  }

  if (reviewed === "true") {
    conditions.push(sql`${homeworkTable.reviewedAt} IS NOT NULL`);
  } else if (reviewed === "false") {
    conditions.push(sql`${homeworkTable.reviewedAt} IS NULL`);
  }

  if (studentId && typeof studentId === "string" && Number.isFinite(Number(studentId))) {
    conditions.push(eq(bookingsTable.studentId, Number(studentId)));
  }

  const rows = await db
    .select({ hw: homeworkTable, booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(homeworkTable.submittedAt));

  res.json(
    rows.map((r) =>
      mapHomeworkRow(r.hw, {
        studentId: r.booking.studentId,
        studentName: r.user.displayName,
        lessonTypeName: r.lessonType.name,
        lessonDate: r.booking.startTime,
      }),
    ),
  );
});

router.patch("/admin/homework/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateHomeworkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(homeworkTable).where(eq(homeworkTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Homework not found" });
    return;
  }

  const updateData: any = { reviewedAt: new Date() };
  if (parsed.data.tutorFeedback != null) updateData.tutorFeedback = parsed.data.tutorFeedback;
  if (parsed.data.grade != null) updateData.grade = parsed.data.grade;
  if (parsed.data.reviewedFileKey != null) updateData.reviewedFileKey = parsed.data.reviewedFileKey;
  if (parsed.data.reviewedFileName != null) updateData.reviewedFileName = parsed.data.reviewedFileName;
  if (parsed.data.reviewedFileMime != null) updateData.reviewedFileMime = parsed.data.reviewedFileMime;

  const [updated] = await db
    .update(homeworkTable)
    .set(updateData)
    .where(eq(homeworkTable.id, id))
    .returning();

  const [row] = await db
    .select({ user: usersTable, booking: bookingsTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(bookingsTable.id, updated.bookingId));

  res.json(
    mapHomeworkRow(updated, {
      studentId: row?.booking.studentId ?? 0,
      studentName: row?.user.displayName ?? "",
      lessonTypeName: row?.lessonType.name ?? "",
      lessonDate: row?.booking.startTime ?? new Date(),
    }),
  );
});

// ─── Students ─────────────────────────────────────────────────────────────────

router.get("/admin/students", requireAdmin, async (_req, res): Promise<void> => {
  const students = await db.select().from(usersTable).orderBy(asc(usersTable.createdAt));

  const result = await Promise.all(
    students.map(async (s) => {
      const packages = await db
        .select()
        .from(lessonPackagesTable)
        .where(eq(lessonPackagesTable.studentId, s.id));
      const total = packages.reduce((a, p) => a + p.totalCredits, 0);
      const used = packages.reduce((a, p) => a + p.usedCredits, 0);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(eq(bookingsTable.studentId, s.id));

      return {
        id: s.id,
        email: s.email,
        displayName: s.displayName,
        totalCredits: total,
        usedCredits: used,
        totalBookings: count,
        createdAt: s.createdAt,
      };
    }),
  );

  res.json(result);
});

router.get("/admin/students/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const packages = await db
    .select()
    .from(lessonPackagesTable)
    .where(eq(lessonPackagesTable.studentId, id));

  const bookings = await db
    .select({ booking: bookingsTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(bookingsTable.studentId, id))
    .orderBy(desc(bookingsTable.startTime));

  res.json({
    id: student.id,
    email: student.email,
    displayName: student.displayName,
    packages: packages.map((p) => ({
      id: p.id,
      totalCredits: p.totalCredits,
      usedCredits: p.usedCredits,
      remainingCredits: p.totalCredits - p.usedCredits,
      purchasedAt: p.purchasedAt,
    })),
    bookings: bookings.map((r) => ({
      id: r.booking.id,
      lessonTypeId: r.booking.lessonTypeId,
      lessonTypeName: r.lessonType.name,
      startTime: r.booking.startTime,
      endTime: r.booking.endTime,
      status: r.booking.status,
      meetLink: r.booking.meetLink ?? null,
      createdAt: r.booking.createdAt,
    })),
    createdAt: student.createdAt,
  });
});

// ─── Messages ─────────────────────────────────────────────────────────────────

router.get("/admin/messages", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ message: messagesTable, user: usersTable })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.studentId, usersTable.id))
    .orderBy(asc(messagesTable.createdAt));

  const threads = new Map<
    number,
    {
      studentId: number;
      studentName: string;
      studentEmail: string;
      lastMessageBody: string;
      lastMessageAt: Date;
      unreadCount: number;
    }
  >();

  for (const r of rows) {
    const isUnreadFromStudent = r.message.senderRole === "student" && !r.message.readAt;
    const existing = threads.get(r.message.studentId);
    if (!existing) {
      threads.set(r.message.studentId, {
        studentId: r.message.studentId,
        studentName: r.user.displayName,
        studentEmail: r.user.email,
        lastMessageBody: r.message.body,
        lastMessageAt: r.message.createdAt,
        unreadCount: isUnreadFromStudent ? 1 : 0,
      });
    } else {
      existing.lastMessageBody = r.message.body;
      existing.lastMessageAt = r.message.createdAt;
      if (isUnreadFromStudent) existing.unreadCount += 1;
    }
  }

  const result = Array.from(threads.values()).sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
  );

  res.json(result);
});

router.get("/admin/students/:id/messages", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.studentId, id))
    .orderBy(asc(messagesTable.createdAt));

  await db
    .update(messagesTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messagesTable.studentId, id),
        eq(messagesTable.senderRole, "student"),
        sql`${messagesTable.readAt} IS NULL`,
      ),
    );

  res.json(rows);
});

router.post("/admin/students/:id/messages", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const parsed = SendAdminMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      studentId: id,
      senderRole: "admin",
      body: parsed.data.body,
    })
    .returning();

  res.status(201).json(message);
});

router.post("/admin/packages", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GrantPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { studentId, totalCredits } = parsed.data;

  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) {
    res.status(400).json({ error: "Student not found" });
    return;
  }

  const [pkg] = await db
    .insert(lessonPackagesTable)
    .values({ studentId, totalCredits, usedCredits: 0 })
    .returning();

  res.status(201).json({
    id: pkg.id,
    totalCredits: pkg.totalCredits,
    usedCredits: pkg.usedCredits,
    remainingCredits: pkg.totalCredits - pkg.usedCredits,
    purchasedAt: pkg.purchasedAt,
  });
});

// ─── Testimonials ─────────────────────────────────────────────────────────────

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

// ─── Site Settings ────────────────────────────────────────────────────────────

router.get("/admin/site-settings", requireAdmin, async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(siteSettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(siteSettingsTable).values({}).returning();
  }
  res.json(settings);
});

router.patch("/admin/site-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateSiteSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [existing] = await db.select().from(siteSettingsTable).limit(1);
  if (!existing) {
    [existing] = await db.insert(siteSettingsTable).values({}).returning();
  }

  const updateData: any = {};
  if (parsed.data.tutorName != null) updateData.tutorName = parsed.data.tutorName;
  if (parsed.data.tutorBio != null) updateData.tutorBio = parsed.data.tutorBio;
  if (parsed.data.contactEmail != null) updateData.contactEmail = parsed.data.contactEmail;
  if (parsed.data.freeTrialEnabled != null) updateData.freeTrialEnabled = parsed.data.freeTrialEnabled;
  if (parsed.data.tutorPhotoUrl != null) updateData.tutorPhotoUrl = parsed.data.tutorPhotoUrl;
  if (parsed.data.weeklyHours != null) updateData.weeklyHours = parsed.data.weeklyHours;
  if (parsed.data.timezone != null) updateData.timezone = parsed.data.timezone;

  const [updated] = await db
    .update(siteSettingsTable)
    .set(updateData)
    .where(eq(siteSettingsTable.id, existing.id))
    .returning();

  res.json(updated);
});

// ─── Availability Overrides ───────────────────────────────────────────────────

router.get("/admin/availability-overrides", requireAdmin, async (_req, res): Promise<void> => {
  const now = new Date();
  const items = await db
    .select()
    .from(availabilityOverridesTable)
    .where(gte(availabilityOverridesTable.endTime, now))
    .orderBy(asc(availabilityOverridesTable.startTime));
  res.json(items);
});

router.put("/admin/availability-overrides/day", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SetDayAvailabilityOverridesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Resolve the day in the tutor's timezone — the incoming blocks are real
  // instants derived from her local wall-clock, so a UTC-midnight window would
  // put late-evening (or early-morning) blocks in the neighbouring day's bucket
  // and fail to clear them on re-save.
  const [tzSettings] = await db.select().from(siteSettingsTable).limit(1);
  const { start: dayStart, end: dayEnd } = zonedDayRange(
    parsed.data.date,
    tzSettings?.timezone || "UTC",
  );

  await db
    .delete(availabilityOverridesTable)
    .where(
      and(
        gte(availabilityOverridesTable.startTime, dayStart),
        lt(availabilityOverridesTable.startTime, dayEnd),
      ),
    );

  if (parsed.data.blocks.length === 0) {
    res.json([]);
    return;
  }

  const rows = await db
    .insert(availabilityOverridesTable)
    .values(parsed.data.blocks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })))
    .returning();

  res.json(rows);
});

router.delete("/admin/availability-overrides/:id", requireAdmin, async (req, res): Promise<void> => {
  const parsed = DeleteAvailabilityOverrideParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(availabilityOverridesTable).where(eq(availabilityOverridesTable.id, parsed.data.id));
  res.sendStatus(204);
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

router.get("/admin/calendar/busy", requireAdmin, async (req, res): Promise<void> => {
  const date = typeof req.query.date === "string" ? req.query.date : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
    return;
  }
  // Query exactly the selected day as it is lived in the tutor's timezone, so
  // the returned events are only that day's (no neighbouring-day noise) and the
  // day boundaries line up with how she reads her calendar.
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  const tz = settings?.timezone || "UTC";
  const { start: dayStart, end: dayEnd } = zonedDayRange(date, tz);
  const busy = await getFreeBusySlots(dayStart, dayEnd);
  res.json(busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })));
});

router.get("/admin/calendar/status", requireAdmin, async (_req, res): Promise<void> => {
  const connected = await isCalendarConnected();
  const email = connected ? await getCalendarEmail() : null;
  res.json({ connected, calendarEmail: email ?? null });
});

// Initiates Google OAuth — generates a one-time state nonce stored in the
// admin session to prevent CSRF / account-linking attacks.
router.get("/calendar/auth", requireAdmin, async (req, res): Promise<void> => {
  const state = randomBytes(32).toString("hex");
  (req.session as any).oauthState = state;

  const auth = createOAuth2Client();
  const url = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state,
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "openid",
      "email",
    ],
  });
  res.redirect(url);
});

// NOTE: requireAdmin is intentionally NOT on this route.
// Google's redirect lands here as a top-level browser navigation after OAuth.
// The session cookie is present (SameSite=Lax allows it on GET redirects), but
// we rely solely on the state nonce for CSRF protection — not the session admin
// flag — since an OAuth callback can't assume the normal authenticated context.
router.get("/admin/calendar/callback", async (req, res): Promise<void> => {
  const { code, error, state } = req.query;

  // Validate state nonce to prevent CSRF attacks
  const expectedState = (req.session as any).oauthState;
  delete (req.session as any).oauthState; // Consume nonce immediately (prevents replay)

  if (!expectedState || typeof state !== "string" || state !== expectedState) {
    res.redirect("/?admin=1#/settings?calendarError=invalid_state");
    return;
  }

  if (error || !code || typeof code !== "string") {
    res.redirect("/?admin=1#/settings?calendarError=1");
    return;
  }

  try {
    const auth = createOAuth2Client();
    const { tokens } = await auth.getToken(code);

    if (!tokens.refresh_token) {
      res.redirect("/?admin=1#/settings?calendarError=missing_refresh_token");
      return;
    }

    // Get the connected calendar email
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const userInfo = await oauth2.userinfo.get();
    const calendarEmail = userInfo.data.email ?? null;

    // Upsert token row
    const existing = await db.select().from(calendarTokensTable).limit(1);

    if (existing.length > 0) {
      await db
        .update(calendarTokensTable)
        .set({
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          calendarEmail,
        })
        .where(eq(calendarTokensTable.id, existing[0].id));
    } else {
      await db.insert(calendarTokensTable).values({
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarEmail,
      });
    }

    // Seed the tutor's timezone from Google (authoritative source) if she hasn't
    // set one yet, so her working hours are interpreted in the right zone.
    try {
      const cal = google.calendar({ version: "v3", auth });
      const tz = (await cal.settings.get({ setting: "timezone" })).data.value;
      if (tz) {
        const [s] = await db.select().from(siteSettingsTable).limit(1);
        if (!s) {
          await db.insert(siteSettingsTable).values({ timezone: tz });
        } else if (!s.timezone || s.timezone === "UTC") {
          await db.update(siteSettingsTable).set({ timezone: tz }).where(eq(siteSettingsTable.id, s.id));
        }
      }
    } catch {
      // Non-fatal: tutor can still set her timezone manually in Settings.
    }

    res.redirect("/?admin=1#/settings?calendarConnected=1");
  } catch (err) {
    res.redirect("/?admin=1#/settings?calendarError=1");
  }
});

router.delete("/admin/calendar/disconnect", requireAdmin, async (_req, res): Promise<void> => {
  await db.delete(calendarTokensTable);
  res.json({ success: true });
});

export default router;
