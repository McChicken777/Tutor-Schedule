import { Router, type IRouter } from "express";
import { eq, ne, and, desc, asc, gte, lt, sql, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  lessonTypesTable,
  lessonPackagesTable,
  creditBundlesTable,
  homeworkTable,
  homeworkFilesTable,
  siteSettingsTable,
  messagesTable,
  availabilityOverridesTable,
  reportsTable,
} from "@workspace/db";
import {
  UpdateTeacherBookingBody,
  UpdateTeacherBookingParams,
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
  AttachHomeworkFileBody,
  RelinkHomeworkFileBody,
  GetTeacherStudentParams,
  GrantPackageBody,
  UpdateSiteSettingsBody,
  SendTeacherMessageBody,
  SetDayAvailabilityOverridesBody,
  DeleteAvailabilityOverrideParams,
  CreateTeacherReportBody,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { requireTeacher } from "../middlewares/requireTeacher";
import { sendPushToUser } from "../lib/push";
import { isCalendarConnected, getCalendarEmail, deleteCalendarEvent, createOAuth2Client, getFreeBusySlots, zonedDayRange } from "../lib/calendar";
import { google } from "googleapis";
import { calendarTokensTable } from "@workspace/db";
import { mapHomeworkRow } from "../lib/homeworkMapper";
import { mapReportRow } from "../lib/reportMapper";
import { isKeyForBookingContext } from "../lib/objectStorage";

const router: IRouter = Router();

// Advisory lock namespace shared with student.ts's locking scheme (2 = per-student).
// Serializes refund/credit writes against concurrent student-side booking/cancel
// operations touching the same student's lessonPackages rows.
const STUDENT_ADVISORY_LOCK_NAMESPACE = 2;

async function withStudentLock<T>(studentId: number, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${STUDENT_ADVISORY_LOCK_NAMESPACE}, ${studentId})`);
    return fn(tx);
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/teacher/dashboard", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const now = new Date();

  // Resolve "today" in the tutor's own timezone, not the server's — otherwise a
  // tutor east/west of the server would see lessons drop off (or appear) at the
  // wrong wall-clock moment.
  const [tzSettings] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId));
  const tz = tzSettings?.timezone || "UTC";
  const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const { start: todayStart, end: todayEnd } = zonedDayRange(todayDateStr, tz);

  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const todayRows = await db
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(
      and(
        eq(bookingsTable.teacherId, teacherId),
        eq(bookingsTable.status, "upcoming"),
        gte(bookingsTable.startTime, todayStart),
        lt(bookingsTable.startTime, todayEnd),
      ),
    )
    .orderBy(asc(bookingsTable.startTime));

  const [{ count: upcomingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.teacherId, teacherId), eq(bookingsTable.status, "upcoming")));

  const [{ count: studentCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.teacherId, teacherId));

  const [{ count: pendingHwCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(
      and(
        eq(bookingsTable.teacherId, teacherId),
        sql`${homeworkTable.submittedAt} IS NOT NULL`,
        sql`${homeworkTable.reviewedAt} IS NULL`,
      ),
    );

  const [{ count: weekCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.teacherId, teacherId),
        eq(bookingsTable.status, "upcoming"),
        gte(bookingsTable.startTime, now),
        lt(bookingsTable.startTime, weekEnd),
      ),
    );

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
    thisWeekBookings: weekCount,
  });
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

router.get("/teacher/bookings", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const { status, date } = req.query;
  const conditions: any[] = [eq(bookingsTable.teacherId, teacherId)];

  if (status && typeof status === "string") {
    conditions.push(eq(bookingsTable.status, status));
  }

  if (date && typeof date === "string") {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      const [tzSettings] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId));
      const tz = tzSettings?.timezone || "UTC";
      // `date` may arrive as a bare "YYYY-MM-DD" or as a full instant (the
      // generated client stringifies Date params via Date#toString()) — resolve
      // whichever calendar day it falls on in the teacher's own timezone.
      const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(parsedDate);
      const { start: dayStart, end: dayEnd } = zonedDayRange(dateStr, tz);
      conditions.push(gte(bookingsTable.startTime, dayStart));
      conditions.push(lt(bookingsTable.startTime, dayEnd));
    }
  }

  const rows = await db
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(and(...conditions))
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

router.patch("/teacher/bookings/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateTeacherBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.teacherId, teacherId)));

  if (!row) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const isNewlyCancelled = parsed.data.status === "cancelled" && row.booking.status === "upcoming";

  if (isNewlyCancelled && row.booking.calendarEventId) {
    await deleteCalendarEvent(teacherId, row.booking.calendarEventId);
  }

  const updateData: any = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.notes != null) updateData.notes = parsed.data.notes;

  // A teacher-initiated cancellation always refunds the credit — unlike a
  // student cancelling within 24h, the student isn't the one who caused the
  // lesson not to happen, and the FAQ promises credits are always returned
  // for a cancelled lesson. Locked per-student to match the same
  // read-then-write pattern used for student-initiated cancel/booking.
  const updated = isNewlyCancelled && !row.lessonType.isTrial
    ? await withStudentLock(row.booking.studentId, async (tx) => {
        const [u] = await tx.update(bookingsTable).set(updateData).where(eq(bookingsTable.id, id)).returning();

        const packages = await tx
          .select()
          .from(lessonPackagesTable)
          .where(eq(lessonPackagesTable.studentId, row.booking.studentId))
          .orderBy(desc(lessonPackagesTable.purchasedAt));

        let remainingToRefund = row.lessonType.creditCost;
        for (const pkg of packages) {
          if (remainingToRefund <= 0) break;
          if (pkg.usedCredits <= 0) continue;
          const refund = Math.min(pkg.usedCredits, remainingToRefund);
          await tx
            .update(lessonPackagesTable)
            .set({ usedCredits: pkg.usedCredits - refund })
            .where(eq(lessonPackagesTable.id, pkg.id));
          remainingToRefund -= refund;
        }

        return u;
      })
    : (await db.update(bookingsTable).set(updateData).where(eq(bookingsTable.id, id)).returning())[0];

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
router.patch("/teacher/bookings/:id/complete", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
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
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.teacherId, teacherId)));

  if (!row) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  if (row.booking.status !== "upcoming") {
    res.status(400).json({ error: `Cannot complete a booking with status "${row.booking.status}"` });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "completed", notes: parsed.data.notes })
    .where(eq(bookingsTable.id, id))
    .returning();

  const assignment = {
    noHomework: parsed.data.homework.noHomework,
    assignedText: parsed.data.homework.noHomework ? null : (parsed.data.homework.assignedText ?? null),
    assignedLinkUrl: parsed.data.homework.noHomework ? null : (parsed.data.homework.assignedLinkUrl ?? null),
  };

  // Bookings normally get an empty homework row at creation time, but older
  // (and seeded) bookings predate that — upsert so the assignment is never
  // silently dropped by an UPDATE that matches no rows. The homework decision
  // is required on every complete-booking call, so this always runs.
  const [existingHw] = await db
    .select({ id: homeworkTable.id })
    .from(homeworkTable)
    .where(eq(homeworkTable.bookingId, id));

  let homeworkId: number;
  if (existingHw) {
    homeworkId = existingHw.id;
    await db.update(homeworkTable).set(assignment).where(eq(homeworkTable.bookingId, id));
  } else {
    const [inserted] = await db
      .insert(homeworkTable)
      .values({ bookingId: id, ...assignment })
      .returning({ id: homeworkTable.id });
    homeworkId = inserted.id;
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
    homeworkId,
  });
});

// ─── Lesson types ─────────────────────────────────────────────────────────────

router.get("/teacher/lesson-types", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const types = await db
    .select()
    .from(lessonTypesTable)
    .where(eq(lessonTypesTable.teacherId, teacherId))
    .orderBy(asc(lessonTypesTable.id));
  res.json(types);
});

router.post("/teacher/lesson-types", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const parsed = CreateLessonTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Only one lesson type can be "the" free trial at a time (per teacher)
  if (parsed.data.isTrial) {
    await db
      .update(lessonTypesTable)
      .set({ isTrial: false })
      .where(and(eq(lessonTypesTable.isTrial, true), eq(lessonTypesTable.teacherId, teacherId)));
  }

  const [type] = await db
    .insert(lessonTypesTable)
    .values({
      teacherId,
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

router.patch("/teacher/lesson-types/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateLessonTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(lessonTypesTable)
    .where(and(eq(lessonTypesTable.id, id), eq(lessonTypesTable.teacherId, teacherId)));
  if (!existing) {
    res.status(404).json({ error: "Lesson type not found" });
    return;
  }

  // Only one lesson type can be "the" free trial at a time (per teacher)
  if (parsed.data.isTrial) {
    await db
      .update(lessonTypesTable)
      .set({ isTrial: false })
      .where(
        and(
          eq(lessonTypesTable.isTrial, true),
          eq(lessonTypesTable.teacherId, teacherId),
          ne(lessonTypesTable.id, id),
        ),
      );
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

router.delete("/teacher/lesson-types/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db
    .select()
    .from(lessonTypesTable)
    .where(and(eq(lessonTypesTable.id, id), eq(lessonTypesTable.teacherId, teacherId)));
  if (!existing) {
    res.status(404).json({ error: "Lesson type not found" });
    return;
  }

  await db.delete(lessonTypesTable).where(eq(lessonTypesTable.id, id));
  res.sendStatus(204);
});

router.get("/teacher/credit-bundles", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const bundles = await db
    .select()
    .from(creditBundlesTable)
    .where(eq(creditBundlesTable.teacherId, teacherId))
    .orderBy(asc(creditBundlesTable.sortOrder), asc(creditBundlesTable.credits));
  res.json(bundles);
});

router.post("/teacher/credit-bundles", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const parsed = CreateCreditBundleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [bundle] = await db
    .insert(creditBundlesTable)
    .values({
      teacherId,
      credits: parsed.data.credits,
      priceCents: parsed.data.priceCents,
      sortOrder: parsed.data.sortOrder ?? 0,
      isActive: parsed.data.isActive ?? true,
    })
    .returning();

  res.status(201).json(bundle);
});

router.patch("/teacher/credit-bundles/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateCreditBundleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(creditBundlesTable)
    .where(and(eq(creditBundlesTable.id, id), eq(creditBundlesTable.teacherId, teacherId)));
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

router.delete("/teacher/credit-bundles/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db
    .select()
    .from(creditBundlesTable)
    .where(and(eq(creditBundlesTable.id, id), eq(creditBundlesTable.teacherId, teacherId)));
  if (!existing) {
    res.status(404).json({ error: "Credit bundle not found" });
    return;
  }

  await db.delete(creditBundlesTable).where(eq(creditBundlesTable.id, id));
  res.sendStatus(204);
});

// ─── Homework ─────────────────────────────────────────────────────────────────
// homework/homeworkFiles carry no teacherId column — ownership is checked via
// a join through the parent booking's teacherId instead.

async function getHomeworkFiles(homeworkId: number) {
  return db
    .select()
    .from(homeworkFilesTable)
    .where(and(eq(homeworkFilesTable.homeworkId, homeworkId), isNull(homeworkFilesTable.deletedAt)));
}

async function getHomeworkFilesByIds(ids: number[]) {
  if (ids.length === 0) return new Map<number, (typeof homeworkFilesTable.$inferSelect)[]>();
  const rows = await db
    .select()
    .from(homeworkFilesTable)
    .where(and(inArray(homeworkFilesTable.homeworkId, ids), isNull(homeworkFilesTable.deletedAt)));
  const byId = new Map<number, (typeof homeworkFilesTable.$inferSelect)[]>();
  for (const row of rows) {
    const list = byId.get(row.homeworkId) ?? [];
    list.push(row);
    byId.set(row.homeworkId, list);
  }
  return byId;
}

async function getHomeworkContext(bookingId: number) {
  const [row] = await db
    .select({ user: usersTable, booking: bookingsTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(bookingsTable.id, bookingId));

  return {
    studentId: row?.booking.studentId ?? 0,
    studentName: row?.user.displayName ?? "",
    lessonTypeName: row?.lessonType.name ?? "",
    lessonDate: row?.booking.startTime ?? new Date(),
  };
}

router.get("/teacher/homework", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const { reviewed, studentId, submitted } = req.query;
  const conditions: any[] = [eq(bookingsTable.teacherId, teacherId)];

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
    .where(and(...conditions))
    .orderBy(desc(homeworkTable.submittedAt));

  const filesByHwId = await getHomeworkFilesByIds(rows.map((r) => r.hw.id));

  res.json(
    rows.map((r) =>
      mapHomeworkRow(r.hw, filesByHwId.get(r.hw.id) ?? [], {
        studentId: r.booking.studentId,
        studentName: r.user.displayName,
        lessonTypeName: r.lessonType.name,
        lessonDate: r.booking.startTime,
      }),
    ),
  );
});

router.patch("/teacher/homework/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = UpdateHomeworkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ hw: homeworkTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(eq(homeworkTable.id, id), eq(bookingsTable.teacherId, teacherId)));
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

  const context = await getHomeworkContext(updated.bookingId);
  const files = await getHomeworkFiles(id);

  res.json(mapHomeworkRow(updated, files, context));
});

router.post("/teacher/homework/:id/files", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = AttachHomeworkFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ hw: homeworkTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(eq(homeworkTable.id, id), eq(bookingsTable.teacherId, teacherId)));
  if (!existing) {
    res.status(404).json({ error: "Homework not found" });
    return;
  }

  const expectedContext = parsed.data.slot === "assigned" ? "homework-assigned" : "homework-review";
  if (!isKeyForBookingContext(parsed.data.key, existing.hw.bookingId, expectedContext)) {
    res.status(400).json({ error: "Invalid file key for this booking" });
    return;
  }

  const existingFiles = await getHomeworkFiles(id);
  const sortOrder = existingFiles.filter((f) => f.slot === parsed.data.slot).length;

  await db.insert(homeworkFilesTable).values({
    homeworkId: id,
    slot: parsed.data.slot,
    key: parsed.data.key,
    name: parsed.data.name,
    mime: parsed.data.mime,
    url: parsed.data.url,
    linkedFileId: parsed.data.linkedFileId,
    originalFileId: parsed.data.originalFileId,
    sortOrder,
  });

  const context = await getHomeworkContext(existing.hw.bookingId);
  const files = await getHomeworkFiles(id);
  res.status(201).json(mapHomeworkRow(existing.hw, files, context));
});

router.delete("/teacher/homework/:id/files/:fileId", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const rawFileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
  const fileId = parseInt(rawFileId, 10);

  const [existing] = await db
    .select({ hw: homeworkTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(eq(homeworkTable.id, id), eq(bookingsTable.teacherId, teacherId)));
  if (!existing) {
    res.status(404).json({ error: "Homework not found" });
    return;
  }

  await db
    .delete(homeworkFilesTable)
    .where(and(eq(homeworkFilesTable.id, fileId), eq(homeworkFilesTable.homeworkId, id)));

  const context = await getHomeworkContext(existing.hw.bookingId);
  const files = await getHomeworkFiles(id);
  res.json(mapHomeworkRow(existing.hw, files, context));
});

router.patch("/teacher/homework/:id/files/:fileId", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const rawFileId = Array.isArray(req.params.fileId) ? req.params.fileId[0] : req.params.fileId;
  const fileId = parseInt(rawFileId, 10);

  const parsed = RelinkHomeworkFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ hw: homeworkTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(eq(homeworkTable.id, id), eq(bookingsTable.teacherId, teacherId)));
  if (!existing) {
    res.status(404).json({ error: "Homework not found" });
    return;
  }

  // A file can only be linked to another file within the same homework record
  // — otherwise a teacher could point a review file at an arbitrary file id
  // belonging to a different student's homework.
  if (parsed.data.linkedFileId != null) {
    const [target] = await db
      .select({ id: homeworkFilesTable.id })
      .from(homeworkFilesTable)
      .where(and(eq(homeworkFilesTable.id, parsed.data.linkedFileId), eq(homeworkFilesTable.homeworkId, id)));
    if (!target) {
      res.status(400).json({ error: "Invalid linkedFileId" });
      return;
    }
  }

  await db
    .update(homeworkFilesTable)
    .set({ linkedFileId: parsed.data.linkedFileId })
    .where(and(eq(homeworkFilesTable.id, fileId), eq(homeworkFilesTable.homeworkId, id)));

  const context = await getHomeworkContext(existing.hw.bookingId);
  const files = await getHomeworkFiles(id);
  res.json(mapHomeworkRow(existing.hw, files, context));
});

// ─── Students ─────────────────────────────────────────────────────────────────

router.get("/teacher/students", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const students = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.teacherId, teacherId))
    .orderBy(asc(usersTable.createdAt));

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

router.get("/teacher/students/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [student] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.teacherId, teacherId)));
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
// messages carries no teacherId column — ownership is mediated entirely through
// the parent student row (users.teacherId), which is unambiguous once set.

router.get("/teacher/messages", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const rows = await db
    .select({ message: messagesTable, user: usersTable })
    .from(messagesTable)
    .innerJoin(usersTable, eq(messagesTable.studentId, usersTable.id))
    .where(eq(usersTable.teacherId, teacherId))
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

router.get("/teacher/students/:id/messages", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [student] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.teacherId, teacherId)));
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

router.post("/teacher/students/:id/messages", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [student] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.teacherId, teacherId)));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const parsed = SendTeacherMessageBody.safeParse(req.body);
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

  sendPushToUser(student.clerkUserId, {
    title: "New message from your tutor",
    body: parsed.data.body,
    url: "/student/messages",
  }).catch((err) => console.error("Failed to send message push:", err));

  res.status(201).json(message);
});

router.post("/teacher/packages", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const parsed = GrantPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { studentId, totalCredits } = parsed.data;

  const [student] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, studentId), eq(usersTable.teacherId, teacherId)));
  if (!student) {
    res.status(400).json({ error: "Student not found" });
    return;
  }

  const [pkg] = await db
    .insert(lessonPackagesTable)
    .values({ teacherId, studentId, totalCredits, usedCredits: 0 })
    .returning();

  res.status(201).json({
    id: pkg.id,
    totalCredits: pkg.totalCredits,
    usedCredits: pkg.usedCredits,
    remainingCredits: pkg.totalCredits - pkg.usedCredits,
    purchasedAt: pkg.purchasedAt,
  });
});

// ─── Site Settings ────────────────────────────────────────────────────────────

router.get("/teacher/site-settings", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  let [settings] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId));
  if (!settings) {
    [settings] = await db.insert(siteSettingsTable).values({ teacherId }).returning();
  }
  res.json(settings);
});

router.patch("/teacher/site-settings", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const parsed = UpdateSiteSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let [existing] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId));
  if (!existing) {
    [existing] = await db.insert(siteSettingsTable).values({ teacherId }).returning();
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

router.get("/teacher/availability-overrides", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const now = new Date();
  const items = await db
    .select()
    .from(availabilityOverridesTable)
    .where(and(eq(availabilityOverridesTable.teacherId, teacherId), gte(availabilityOverridesTable.endTime, now)))
    .orderBy(asc(availabilityOverridesTable.startTime));
  res.json(items);
});

router.put("/teacher/availability-overrides/day", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const parsed = SetDayAvailabilityOverridesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Resolve the day in the tutor's timezone — the incoming blocks are real
  // instants derived from her local wall-clock, so a UTC-midnight window would
  // put late-evening (or early-morning) blocks in the neighbouring day's bucket
  // and fail to clear them on re-save.
  const [tzSettings] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId));
  const { start: dayStart, end: dayEnd } = zonedDayRange(
    parsed.data.date,
    tzSettings?.timezone || "UTC",
  );

  await db
    .delete(availabilityOverridesTable)
    .where(
      and(
        eq(availabilityOverridesTable.teacherId, teacherId),
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
    .values(parsed.data.blocks.map((b) => ({ teacherId, startTime: b.startTime, endTime: b.endTime })))
    .returning();

  res.json(rows);
});

router.delete("/teacher/availability-overrides/:id", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const parsed = DeleteAvailabilityOverrideParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(availabilityOverridesTable)
    .where(and(eq(availabilityOverridesTable.id, parsed.data.id), eq(availabilityOverridesTable.teacherId, teacherId)));
  res.sendStatus(204);
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

router.get("/teacher/calendar/busy", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const date = typeof req.query.date === "string" ? req.query.date : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
    return;
  }
  // Query exactly the selected day as it is lived in the tutor's timezone, so
  // the returned events are only that day's (no neighbouring-day noise) and the
  // day boundaries line up with how she reads her calendar.
  const [settings] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId));
  const tz = settings?.timezone || "UTC";
  const { start: dayStart, end: dayEnd } = zonedDayRange(date, tz);
  const busy = await getFreeBusySlots(teacherId, dayStart, dayEnd);
  res.json(busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })));
});

router.get("/teacher/calendar/status", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const connected = await isCalendarConnected(teacherId);
  const email = connected ? await getCalendarEmail(teacherId) : null;
  res.json({ connected, calendarEmail: email ?? null });
});

// Initiates Google OAuth — generates a one-time state nonce stored in the
// session to prevent CSRF / account-linking attacks. The teacherId is stashed
// alongside it since the callback route below has no auth context of its own
// (it's reached via a top-level browser redirect from Google, not an API call).
router.get("/calendar/auth", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const state = randomBytes(32).toString("hex");
  (req.session as any).oauthState = state;
  (req.session as any).oauthTeacherId = teacherId;

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

// NOTE: requireTeacher is intentionally NOT on this route.
// Google's redirect lands here as a top-level browser navigation after OAuth.
// The session cookie is present (SameSite=Lax allows it on GET redirects), but
// we rely solely on the state nonce (plus the teacherId stashed alongside it
// in /calendar/auth) for both CSRF protection and knowing which teacher this
// token belongs to — an OAuth callback can't assume the normal authenticated
// context.
//
// NOTE: this literal path (/admin/calendar/callback) is intentionally NOT
// renamed to /teacher/*, even though it conceptually belongs here — it is
// registered verbatim as the redirect URI in Google Cloud Console's OAuth
// app config, external to this codebase, and renaming it would break the
// live calendar integration until that config is manually updated.
router.get("/admin/calendar/callback", async (req, res): Promise<void> => {
  const { code, error, state } = req.query;

  // Validate state nonce to prevent CSRF attacks, and recover which teacher
  // initiated this flow.
  const expectedState = (req.session as any).oauthState;
  const oauthTeacherId = (req.session as any).oauthTeacherId as number | undefined;
  delete (req.session as any).oauthState; // Consume nonce immediately (prevents replay)
  delete (req.session as any).oauthTeacherId;

  if (!expectedState || typeof state !== "string" || state !== expectedState || !oauthTeacherId) {
    res.redirect("/teacher/availability?calendarError=invalid_state");
    return;
  }

  if (error || !code || typeof code !== "string") {
    res.redirect("/teacher/availability?calendarError=1");
    return;
  }

  try {
    const auth = createOAuth2Client();
    const { tokens } = await auth.getToken(code);

    if (!tokens.refresh_token) {
      res.redirect("/?admin=1#/availability?calendarError=missing_refresh_token");
      return;
    }

    // Get the connected calendar email
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth });
    const userInfo = await oauth2.userinfo.get();
    const calendarEmail = userInfo.data.email ?? null;

    // Upsert token row (one per teacher — calendarTokens.teacherId is unique)
    const existing = await db
      .select()
      .from(calendarTokensTable)
      .where(eq(calendarTokensTable.teacherId, oauthTeacherId));

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
        teacherId: oauthTeacherId,
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
        const [s] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, oauthTeacherId));
        if (!s) {
          await db.insert(siteSettingsTable).values({ teacherId: oauthTeacherId, timezone: tz });
        } else if (!s.timezone || s.timezone === "UTC") {
          await db.update(siteSettingsTable).set({ timezone: tz }).where(eq(siteSettingsTable.id, s.id));
        }
      }
    } catch {
      // Non-fatal: tutor can still set her timezone manually in Settings.
    }

    res.redirect("/teacher/availability?calendarConnected=1");
  } catch (err) {
    res.redirect("/teacher/availability?calendarError=1");
  }
});

router.delete("/teacher/calendar/disconnect", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  await db.delete(calendarTokensTable).where(eq(calendarTokensTable.teacherId, teacherId));
  res.json({ success: true });
});

// ─── Reports ──────────────────────────────────────────────────────────────────
// Message/homework-file targets must belong to one of this teacher's own
// students — reports can't be filed against content outside the teacher's
// own roster. "general" carries no target and no reported user.

async function validateTeacherReportTarget(
  teacherId: number,
  targetType: "message" | "homework_file" | "general",
  targetId: number | null,
): Promise<{ ok: true; preview: string | null; reportedStudentId: number | null } | { ok: false }> {
  if (targetType === "general") {
    return targetId == null ? { ok: true, preview: null, reportedStudentId: null } : { ok: false };
  }
  if (targetId == null) return { ok: false };

  if (targetType === "message") {
    const [row] = await db
      .select({ message: messagesTable, user: usersTable })
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.studentId, usersTable.id))
      .where(and(eq(messagesTable.id, targetId), eq(usersTable.teacherId, teacherId)));
    return row
      ? { ok: true, preview: row.message.body.slice(0, 140), reportedStudentId: row.message.studentId }
      : { ok: false };
  }

  const [row] = await db
    .select({ file: homeworkFilesTable, booking: bookingsTable })
    .from(homeworkFilesTable)
    .innerJoin(homeworkTable, eq(homeworkFilesTable.homeworkId, homeworkTable.id))
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(eq(homeworkFilesTable.id, targetId), eq(bookingsTable.teacherId, teacherId)));
  return row ? { ok: true, preview: row.file.name, reportedStudentId: row.booking.studentId } : { ok: false };
}

router.post("/teacher/reports", requireTeacher, async (req, res): Promise<void> => {
  const teacherId = (req as any).teacherId as number;
  const teacher = (req as any).teacher as { displayName: string };

  const parsed = CreateTeacherReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const targetId = parsed.data.targetId ?? null;
  const validation = await validateTeacherReportTarget(teacherId, parsed.data.targetType, targetId);
  if (!validation.ok) {
    res.status(400).json({ error: "Invalid target for this report type" });
    return;
  }

  const reportedUserRole = validation.reportedStudentId != null ? "student" : null;

  const [report] = await db
    .insert(reportsTable)
    .values({
      reporterRole: "teacher",
      reporterTeacherId: teacherId,
      targetType: parsed.data.targetType,
      targetId,
      reportedUserRole,
      reportedStudentId: validation.reportedStudentId,
      body: parsed.data.body,
    })
    .returning();

  let reportedUserName: string | null = null;
  if (validation.reportedStudentId != null) {
    const [s] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, validation.reportedStudentId));
    reportedUserName = s?.displayName ?? null;
  }

  res.status(201).json(mapReportRow(report, teacher.displayName, validation.preview, reportedUserName));
});

export default router;
