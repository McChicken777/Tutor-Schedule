import { Router, type IRouter } from "express";
import { eq, and, desc, asc, gte, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  lessonTypesTable,
  lessonPackagesTable,
  homeworkTable,
  reviewsTable,
  testimonialsTable,
  faqsTable,
  siteSettingsTable,
} from "@workspace/db";
import {
  AdminLoginBody,
  UpdateAdminBookingBody,
  UpdateAdminBookingParams,
  CreateLessonTypeBody,
  UpdateLessonTypeBody,
  UpdateLessonTypeParams,
  DeleteLessonTypeParams,
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
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";
import { isCalendarConnected, getCalendarEmail, deleteCalendarEvent } from "../lib/calendar";

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

  const [type] = await db
    .insert(lessonTypesTable)
    .values({
      name: parsed.data.name,
      durationMinutes: parsed.data.durationMinutes,
      priceCents: parsed.data.priceCents,
      description: parsed.data.description,
      isActive: parsed.data.isActive ?? true,
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

  const updateData: any = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.durationMinutes != null) updateData.durationMinutes = parsed.data.durationMinutes;
  if (parsed.data.priceCents != null) updateData.priceCents = parsed.data.priceCents;
  if (parsed.data.description != null) updateData.description = parsed.data.description;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

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

// ─── Homework ─────────────────────────────────────────────────────────────────

router.get("/admin/homework", requireAdmin, async (req, res): Promise<void> => {
  const { reviewed } = req.query;
  let conditions: any[] = [sql`${homeworkTable.submittedAt} IS NOT NULL`];

  if (reviewed === "true") {
    conditions.push(sql`${homeworkTable.reviewedAt} IS NOT NULL`);
  } else if (reviewed === "false") {
    conditions.push(sql`${homeworkTable.reviewedAt} IS NULL`);
  }

  const rows = await db
    .select({ hw: homeworkTable, booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(and(...conditions))
    .orderBy(desc(homeworkTable.submittedAt));

  res.json(
    rows.map((r) => ({
      id: r.hw.id,
      bookingId: r.hw.bookingId,
      studentName: r.user.displayName,
      lessonTypeName: r.lessonType.name,
      lessonDate: r.booking.startTime,
      submittedText: r.hw.submittedText ?? null,
      fileUrl: r.hw.fileUrl ?? null,
      tutorFeedback: r.hw.tutorFeedback ?? null,
      grade: r.hw.grade ?? null,
      submittedAt: r.hw.submittedAt ?? null,
      reviewedAt: r.hw.reviewedAt ?? null,
    })),
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

  res.json({
    id: updated.id,
    bookingId: updated.bookingId,
    studentName: row?.user.displayName ?? "",
    lessonTypeName: row?.lessonType.name ?? "",
    lessonDate: row?.booking.startTime ?? new Date(),
    submittedText: updated.submittedText ?? null,
    fileUrl: updated.fileUrl ?? null,
    tutorFeedback: updated.tutorFeedback ?? null,
    grade: updated.grade ?? null,
    submittedAt: updated.submittedAt ?? null,
    reviewedAt: updated.reviewedAt ?? null,
  });
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
    .select({
      pkg: lessonPackagesTable,
      lessonType: lessonTypesTable,
    })
    .from(lessonPackagesTable)
    .innerJoin(lessonTypesTable, eq(lessonPackagesTable.lessonTypeId, lessonTypesTable.id))
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
      id: p.pkg.id,
      lessonTypeId: p.pkg.lessonTypeId,
      lessonTypeName: p.lessonType.name,
      totalCredits: p.pkg.totalCredits,
      usedCredits: p.pkg.usedCredits,
      remainingCredits: p.pkg.totalCredits - p.pkg.usedCredits,
      purchasedAt: p.pkg.purchasedAt,
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

router.post("/admin/packages", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GrantPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { studentId, lessonTypeId, totalCredits } = parsed.data;

  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) {
    res.status(400).json({ error: "Student not found" });
    return;
  }

  const [lessonType] = await db.select().from(lessonTypesTable).where(eq(lessonTypesTable.id, lessonTypeId));
  if (!lessonType) {
    res.status(400).json({ error: "Lesson type not found" });
    return;
  }

  const [pkg] = await db
    .insert(lessonPackagesTable)
    .values({ studentId, lessonTypeId, totalCredits, usedCredits: 0 })
    .returning();

  res.status(201).json({
    id: pkg.id,
    lessonTypeId: pkg.lessonTypeId,
    lessonTypeName: lessonType.name,
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

  const [updated] = await db
    .update(siteSettingsTable)
    .set(updateData)
    .where(eq(siteSettingsTable.id, existing.id))
    .returning();

  res.json(updated);
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

router.get("/admin/calendar/status", requireAdmin, async (_req, res): Promise<void> => {
  const connected = await isCalendarConnected();
  const email = connected ? await getCalendarEmail() : null;
  res.json({ connected, calendarEmail: email ?? null });
});

export default router;
