import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { eq, ne, lt, gt, and, asc, desc, sql, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  lessonTypesTable,
  lessonPackagesTable,
  homeworkTable,
  homeworkFilesTable,
  reviewsTable,
  messagesTable,
  siteSettingsTable,
  availabilityOverridesTable,
  reportsTable,
  teachersTable,
} from "@workspace/db";
import {
  CreateBookingBody,
  CancelBookingBody,
  CancelBookingParams,
  RescheduleBookingBody,
  RescheduleBookingParams,
  GetStudentBookingParams,
  GetHomeworkParams,
  SubmitHomeworkBody,
  SubmitHomeworkParams,
  SubmitReviewBody,
  SubmitReviewParams,
  ListStudentBookingsQueryParams,
  SendStudentMessageBody,
  CreateStudentReportBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  createCalendarEventWithMeet,
  deleteCalendarEvent,
  getFreeBusySlots,
} from "../lib/calendar";
import { mapHomeworkFields, mapHomeworkRow } from "../lib/homeworkMapper";
import { mapReportRow } from "../lib/reportMapper";
import { isKeyForBookingContext } from "../lib/objectStorage";

const router: IRouter = Router();

// Booking creation/reschedule races (two requests both passing a slot-taken or
// credit-sufficiency check before either write lands) are real without some
// form of serialization — there's no unique constraint that could catch a
// double-booked slot or a FIFO credit deduction after the fact. Postgres
// advisory locks (scoped per-teacher / per-student via a namespace int so the
// two id spaces can't collide) serialize just the requests that could
// actually conflict, held for the transaction's lifetime and auto-released on
// commit/rollback. Lock order is always teacher-then-student to avoid a
// deadlock against another request locking the same pair.
const ADVISORY_LOCK_NAMESPACE = { teacher: 1, student: 2 } as const;

async function withTeacherLock<T>(teacherId: number, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE.teacher}, ${teacherId})`);
    return fn(tx);
  });
}

async function withStudentLock<T>(studentId: number, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE.student}, ${studentId})`);
    return fn(tx);
  });
}

async function withTeacherAndStudentLock<T>(
  teacherId: number,
  studentId: number,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE.teacher}, ${teacherId})`);
    await tx.execute(sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE.student}, ${studentId})`);
    return fn(tx);
  });
}

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
    .select({ booking: bookingsTable, user: usersTable, lessonType: lessonTypesTable })
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

// Looks up real email/name from Clerk directly, rather than relying on session
// claims (which need a custom JWT template configured in the Clerk dashboard
// to include them at all). Never throws — a Clerk hiccup falls back to the
// placeholder values rather than breaking booking/dashboard access.
async function fetchClerkIdentity(clerkUserId: string): Promise<{ email: string; displayName: string }> {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      "";
    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "Student";
    return { email, displayName };
  } catch {
    return { email: "", displayName: "Student" };
  }
}

// JIT provision: get or create user from Clerk ID. Also self-heals legacy
// rows that were created before this function looked up real identity data —
// any row still holding the placeholder gets re-synced from Clerk here.
async function getOrCreateUser(clerkUserId: string) {
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  if (!user) {
    const identity = await fetchClerkIdentity(clerkUserId);
    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email: identity.email,
        displayName: identity.displayName,
      })
      .returning();
  } else if (user.email === "" || user.displayName === "Student") {
    const identity = await fetchClerkIdentity(clerkUserId);
    if (identity.email !== "" || identity.displayName !== "Student") {
      [user] = await db
        .update(usersTable)
        .set({ email: identity.email || user.email, displayName: identity.displayName })
        .where(eq(usersTable.id, user.id))
        .returning();
    }
  }
  return user;
}

// The trial lesson type needs no credits to book, but a student can only ever
// use it once. Only a "completed" (the lesson actually happened) booking
// counts as used — an upcoming or cancelled trial doesn't burn the one-time
// trial, so a student can still be re-scheduled or try again before it happens.
async function hasUsedTrial(studentId: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(
      and(
        eq(bookingsTable.studentId, studentId),
        eq(lessonTypesTable.isTrial, true),
        eq(bookingsTable.status, "completed"),
      ),
    );
  return !!existing;
}

// A single account (set via TEST_STUDENT_EMAIL) that always looks first-time —
// tour and free trial always available — regardless of real history, so it
// can be used to repeatedly test both flows without touching real data.
function isTestStudent(email: string): boolean {
  const testEmail = process.env.TEST_STUDENT_EMAIL;
  return !!testEmail && email.toLowerCase() === testEmail.toLowerCase();
}

// Before a student's first booking, user.teacherId is still null (adopted on
// first booking — see POST /student/bookings) and there's no "pick a teacher"
// UI yet, so we can't scope this to one teacher's settings. Falls back to the
// legacy unscoped lookup in that case; once adopted, scopes strictly.
async function getTrialLessonType(teacherId: number | null) {
  const [settings] =
    teacherId != null
      ? await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId))
      : await db.select().from(siteSettingsTable).limit(1);
  if (!settings?.freeTrialEnabled) return null;

  const conditions = [eq(lessonTypesTable.isTrial, true), eq(lessonTypesTable.isActive, true)];
  if (teacherId != null) conditions.push(eq(lessonTypesTable.teacherId, teacherId));

  const [trialLessonType] = await db.select().from(lessonTypesTable).where(and(...conditions));
  return trialLessonType ?? null;
}

// Re-validates a time window is actually still free right before committing a
// booking — the client-side slot list can go stale (another student books it
// first) or be bypassed entirely, so this is the real guarantee against
// double-booking, not the availability list.
async function isTimeSlotTaken(
  dbClient: Pick<typeof db, "select">,
  teacherId: number,
  start: Date,
  end: Date,
  options?: { excludeBookingId?: number; excludeCalendarRange?: { start: Date; end: Date } },
): Promise<boolean> {
  const conditions = [
    eq(bookingsTable.status, "upcoming"),
    eq(bookingsTable.teacherId, teacherId),
    lt(bookingsTable.startTime, end),
    gt(bookingsTable.endTime, start),
  ];
  if (options?.excludeBookingId != null) {
    conditions.push(ne(bookingsTable.id, options.excludeBookingId));
  }

  const [conflictingBooking] = await dbClient
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(...conditions));
  if (conflictingBooking) return true;

  const busySlots = await getFreeBusySlots(teacherId, start, end);
  const exclude = options?.excludeCalendarRange;
  const relevantBusy = exclude
    ? busySlots.filter(
        (b) => b.start.getTime() !== exclude.start.getTime() || b.end.getTime() !== exclude.end.getTime(),
      )
    : busySlots;

  if (relevantBusy.some((busy) => start < busy.end && end > busy.start)) return true;

  // In-app date-specific blocks (teacher time off) also make a slot unbookable.
  const [override] = await dbClient
    .select({ id: availabilityOverridesTable.id })
    .from(availabilityOverridesTable)
    .where(
      and(
        eq(availabilityOverridesTable.teacherId, teacherId),
        lt(availabilityOverridesTable.startTime, end),
        gt(availabilityOverridesTable.endTime, start),
      ),
    );
  return !!override;
}

router.get("/student/me", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const packages = await db
    .select()
    .from(lessonPackagesTable)
    .where(eq(lessonPackagesTable.studentId, user.id));

  const totalRemaining = packages.reduce(
    (sum, p) => sum + (p.totalCredits - p.usedCredits),
    0,
  );

  const upcoming = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.studentId, user.id),
        eq(bookingsTable.status, "upcoming"),
      ),
    );

  res.json({
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    displayName: user.displayName,
    totalRemainingCredits: totalRemaining,
    upcomingLessonsCount: upcoming.length,
    createdAt: user.createdAt,
  });
});

router.get("/student/dashboard", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const upcomingBookings = await db
    .select({
      booking: bookingsTable,
      lessonType: lessonTypesTable,
    })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(
      and(
        eq(bookingsTable.studentId, user.id),
        eq(bookingsTable.status, "upcoming"),
      ),
    )
    .orderBy(asc(bookingsTable.startTime))
    .limit(5);

  const packages = await db
    .select()
    .from(lessonPackagesTable)
    .where(eq(lessonPackagesTable.studentId, user.id));

  // Homework with pending feedback
  const recentHomework = await db
    .select({
      hw: homeworkTable,
      booking: bookingsTable,
      lessonType: lessonTypesTable,
    })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(bookingsTable.studentId, user.id))
    .orderBy(desc(homeworkTable.createdAt))
    .limit(3);

  const pendingHomeworkCount = recentHomework.filter(
    (h) => h.hw.submittedAt && !h.hw.reviewedAt,
  ).length;

  const recentHomeworkFilesByHwId = await getHomeworkFilesByIds(recentHomework.map((h) => h.hw.id));

  const [{ count: unreadMessageCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(and(eq(messagesTable.studentId, user.id), eq(messagesTable.senderRole, "admin"), sql`${messagesTable.readAt} IS NULL`));

  const totalRemaining = packages.reduce(
    (sum, p) => sum + (p.totalCredits - p.usedCredits),
    0,
  );

  const mappedUpcoming = upcomingBookings.map((r) => ({
    id: r.booking.id,
    lessonTypeId: r.booking.lessonTypeId,
    lessonTypeName: r.lessonType.name,
    startTime: r.booking.startTime,
    endTime: r.booking.endTime,
    status: r.booking.status,
    meetLink: r.booking.meetLink ?? null,
    createdAt: r.booking.createdAt,
  }));

  const isTestAccount = isTestStudent(user.email);
  const trialLessonType = await getTrialLessonType(user.teacherId);
  const trialAvailable = isTestAccount || (trialLessonType ? !(await hasUsedTrial(user.id)) : false);

  res.json({
    nextBooking: mappedUpcoming[0] ?? null,
    upcomingBookings: mappedUpcoming,
    totalRemainingCredits: totalRemaining,
    trialAvailable,
    hasSeenTour: isTestAccount ? false : user.hasSeenTour,
    pendingHomeworkCount,
    hasUnreadMessages: unreadMessageCount > 0,
    packages: packages.map((p) => ({
      id: p.id,
      totalCredits: p.totalCredits,
      usedCredits: p.usedCredits,
      remainingCredits: p.totalCredits - p.usedCredits,
      purchasedAt: p.purchasedAt,
    })),
    recentHomework: recentHomework.map((r) =>
      mapHomeworkRow(r.hw, recentHomeworkFilesByHwId.get(r.hw.id) ?? [], {
        studentId: user.id,
        studentName: "",
        lessonTypeName: r.lessonType.name,
        lessonDate: r.booking.startTime,
      }),
    ),
  });
});

router.get("/student/bookings", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const parsed = ListStudentBookingsQueryParams.safeParse(req.query);
  const statusFilter = parsed.success ? parsed.data.status : undefined;

  const conditions: any[] = [eq(bookingsTable.studentId, user.id)];
  if (statusFilter === "past") {
    // "past" is a UI concept — map to completed + cancelled
    conditions.push(
      sql`${bookingsTable.status} IN ('completed', 'cancelled')`,
    );
  } else if (statusFilter) {
    conditions.push(eq(bookingsTable.status, statusFilter));
  }

  const rows = await db
    .select({
      booking: bookingsTable,
      lessonType: lessonTypesTable,
    })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(and(...conditions))
    .orderBy(desc(bookingsTable.startTime));

  res.json(
    rows.map((r) => ({
      id: r.booking.id,
      lessonTypeId: r.booking.lessonTypeId,
      lessonTypeName: r.lessonType.name,
      startTime: r.booking.startTime,
      endTime: r.booking.endTime,
      status: r.booking.status,
      meetLink: r.booking.meetLink ?? null,
      createdAt: r.booking.createdAt,
    })),
  );
});

router.post("/student/bookings", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { lessonTypeId, startTime } = parsed.data;

  const [lessonType] = await db
    .select()
    .from(lessonTypesTable)
    .where(eq(lessonTypesTable.id, lessonTypeId));

  if (!lessonType) {
    res.status(404).json({ error: "Lesson type not found" });
    return;
  }

  const teacherId = lessonType.teacherId;
  if (user.teacherId != null && user.teacherId !== teacherId) {
    res.status(400).json({ error: "This lesson type belongs to a different teacher" });
    return;
  }

  const start = new Date(startTime as unknown as string);
  const end = new Date(start.getTime() + lessonType.durationMinutes * 60 * 1000);

  // Everything that reads-then-writes a shared invariant (slot availability,
  // credit balance) happens inside one locked transaction — see
  // withTeacherAndStudentLock — so two concurrent requests for the same
  // teacher/student can't both pass a check that only one of them should.
  const result = await withTeacherAndStudentLock(teacherId, user.id, async (
    tx,
  ): Promise<{ error: { status: number; message: string } } | { booking: typeof bookingsTable.$inferSelect }> => {
    // One teacher per student: adopt this teacher on the student's first-ever
    // booking. No UI offers a teacher choice yet, so a mismatch shouldn't be
    // reachable today — this is a defensive guard against that invariant breaking.
    if (user.teacherId == null) {
      await tx.update(usersTable).set({ teacherId }).where(eq(usersTable.id, user.id));
      user.teacherId = teacherId;
    }

    // The trial lesson type needs no credits, but only once ever, per student
    let packages: (typeof lessonPackagesTable.$inferSelect)[] = [];
    if (lessonType.isTrial) {
      if (!isTestStudent(user.email) && (await hasUsedTrial(user.id))) {
        return { error: { status: 400, message: "You've already used your free trial lesson" } } as const;
      }
    } else {
      packages = await tx
        .select()
        .from(lessonPackagesTable)
        .where(eq(lessonPackagesTable.studentId, user.id));

      const totalRemaining = packages.reduce(
        (sum, p) => sum + (p.totalCredits - p.usedCredits),
        0,
      );

      if (totalRemaining < lessonType.creditCost) {
        return { error: { status: 400, message: "Not enough credits for this lesson type" } } as const;
      }
    }

    if (await isTimeSlotTaken(tx, teacherId, start, end)) {
      return { error: { status: 409, message: "This time slot is no longer available. Please choose another." } } as const;
    }

    // Create Google Meet event
    const calendarResult = await createCalendarEventWithMeet(
      teacherId,
      `Spanish Lesson with ${user.displayName}`,
      start,
      end,
      user.email,
      `Spanish lesson - ${lessonType.name} (${lessonType.durationMinutes} min)`,
    );

    // Create booking
    const [booking] = await tx
      .insert(bookingsTable)
      .values({
        studentId: user.id,
        teacherId,
        lessonTypeId,
        startTime: start,
        endTime: end,
        status: "upcoming",
        meetLink: calendarResult?.meetLink ?? null,
        calendarEventId: calendarResult?.eventId ?? null,
      })
      .returning();

    if (!lessonType.isTrial) {
      // Deduct creditCost credits FIFO across package rows, oldest first
      let remainingToDeduct = lessonType.creditCost;
      const sortedPackages = [...packages].sort(
        (a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime(),
      );
      for (const pkg of sortedPackages) {
        if (remainingToDeduct <= 0) break;
        const available = pkg.totalCredits - pkg.usedCredits;
        if (available <= 0) continue;
        const deduction = Math.min(available, remainingToDeduct);
        await tx
          .update(lessonPackagesTable)
          .set({ usedCredits: pkg.usedCredits + deduction })
          .where(eq(lessonPackagesTable.id, pkg.id));
        remainingToDeduct -= deduction;
      }
    }

    // Create empty homework record
    await tx.insert(homeworkTable).values({ bookingId: booking.id });

    return { booking } as const;
  });

  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const { booking } = result;
  res.status(201).json({
    id: booking.id,
    lessonTypeId: booking.lessonTypeId,
    lessonTypeName: lessonType.name,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
    meetLink: booking.meetLink ?? null,
    createdAt: booking.createdAt,
  });
});

router.get("/student/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }

  const [row] = await db
    .select({ booking: bookingsTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.studentId, user.id)));

  if (!row) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const [hw] = await db.select().from(homeworkTable).where(eq(homeworkTable.bookingId, id));
  const homeworkFiles = hw ? await getHomeworkFiles(hw.id) : [];
  const [review] = await db.select().from(reviewsTable).where(eq(reviewsTable.bookingId, id));

  res.json({
    id: row.booking.id,
    lessonTypeId: row.booking.lessonTypeId,
    lessonTypeName: row.lessonType.name,
    durationMinutes: row.lessonType.durationMinutes,
    startTime: row.booking.startTime,
    endTime: row.booking.endTime,
    status: row.booking.status,
    meetLink: row.booking.meetLink ?? null,
    notes: row.booking.notes ?? null,
    homework: hw ? mapHomeworkFields(hw, homeworkFiles) : null,
    review: review
      ? {
          id: review.id,
          bookingId: review.bookingId,
          rating: review.rating,
          comment: review.comment ?? null,
          createdAt: review.createdAt,
        }
      : null,
    createdAt: row.booking.createdAt,
  });
});

router.patch("/student/bookings/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = CancelBookingBody.safeParse(req.body);

  const result = await withStudentLock(user.id, async (
    tx,
  ): Promise<
    | { error: { status: number; message: string } }
    | { updated: typeof bookingsTable.$inferSelect; lessonTypeName: string }
  > => {
    const [row] = await tx
      .select({ booking: bookingsTable, lessonType: lessonTypesTable })
      .from(bookingsTable)
      .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
      .where(and(eq(bookingsTable.id, id), eq(bookingsTable.studentId, user.id)));

    if (!row) {
      return { error: { status: 404, message: "Booking not found" } } as const;
    }

    if (row.booking.status !== "upcoming") {
      return { error: { status: 400, message: "Can only cancel upcoming bookings" } } as const;
    }

    // Delete calendar event
    if (row.booking.calendarEventId) {
      await deleteCalendarEvent(row.booking.teacherId, row.booking.calendarEventId);
    }

    const [updated] = await tx
      .update(bookingsTable)
      .set({
        status: "cancelled",
        cancellationReason: parsed.success ? (parsed.data.reason ?? null) : null,
      })
      .where(eq(bookingsTable.id, id))
      .returning();

    // Refund credit — but not if cancelling less than 24 hours before the lesson,
    // and never for a trial booking, which never consumed a credit to begin with.
    const hoursUntilLesson = (row.booking.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (!row.lessonType.isTrial && hoursUntilLesson >= 24) {
      const packages = await tx
        .select()
        .from(lessonPackagesTable)
        .where(eq(lessonPackagesTable.studentId, user.id))
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
    }

    return { updated, lessonTypeName: row.lessonType.name } as const;
  });

  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const { updated, lessonTypeName } = result;
  res.json({
    id: updated.id,
    lessonTypeId: updated.lessonTypeId,
    lessonTypeName,
    startTime: updated.startTime,
    endTime: updated.endTime,
    status: updated.status,
    meetLink: updated.meetLink ?? null,
    createdAt: updated.createdAt,
  });
});

router.patch("/student/bookings/:id/reschedule", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = RescheduleBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select({ booking: bookingsTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.studentId, user.id)));

  if (!row) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (row.booking.status !== "upcoming") {
    res.status(400).json({ error: "Can only reschedule upcoming bookings" });
    return;
  }

  const newStart = new Date(parsed.data.newStartTime as unknown as string);
  const newEnd = new Date(newStart.getTime() + row.lessonType.durationMinutes * 60 * 1000);

  const result = await withTeacherLock(row.booking.teacherId, async (
    tx,
  ): Promise<{ error: { status: number; message: string } } | { updated: typeof bookingsTable.$inferSelect }> => {
    const taken = await isTimeSlotTaken(tx, row.booking.teacherId, newStart, newEnd, {
      excludeBookingId: id,
      excludeCalendarRange: { start: row.booking.startTime, end: row.booking.endTime },
    });
    if (taken) {
      return { error: { status: 409, message: "This time slot is no longer available. Please choose another." } } as const;
    }

    // Delete old calendar event (only now that we know the new time is free)
    if (row.booking.calendarEventId) {
      await deleteCalendarEvent(row.booking.teacherId, row.booking.calendarEventId);
    }

    const calendarResult = await createCalendarEventWithMeet(
      row.booking.teacherId,
      `Spanish Lesson with ${user.displayName}`,
      newStart,
      newEnd,
      user.email,
    );

    const [updated] = await tx
      .update(bookingsTable)
      .set({
        startTime: newStart,
        endTime: newEnd,
        meetLink: calendarResult?.meetLink ?? row.booking.meetLink,
        calendarEventId: calendarResult?.eventId ?? null,
      })
      .where(eq(bookingsTable.id, id))
      .returning();

    return { updated } as const;
  });

  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const { updated } = result;
  res.json({
    id: updated.id,
    lessonTypeId: updated.lessonTypeId,
    lessonTypeName: row.lessonType.name,
    startTime: updated.startTime,
    endTime: updated.endTime,
    status: updated.status,
    meetLink: updated.meetLink ?? null,
    createdAt: updated.createdAt,
  });
});

router.get("/student/bookings/:id/homework", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.studentId, user.id)));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const [hw] = await db.select().from(homeworkTable).where(eq(homeworkTable.bookingId, id));
  if (!hw) {
    res.status(404).json({ error: "Homework not found" });
    return;
  }

  const files = await getHomeworkFiles(hw.id);
  res.json(mapHomeworkFields(hw, files));
});

router.post("/student/bookings/:id/homework", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = SubmitHomeworkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.studentId, user.id)));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const files = parsed.data.files ?? [];
  for (const file of files) {
    if (!isKeyForBookingContext(file.key, id, "homework-submission")) {
      res.status(400).json({ error: "Invalid file key for this booking" });
      return;
    }
  }

  const [existing] = await db.select().from(homeworkTable).where(eq(homeworkTable.bookingId, id));

  let hw;
  if (existing) {
    [hw] = await db
      .update(homeworkTable)
      .set({
        submittedText: parsed.data.submittedText ?? existing.submittedText,
        submittedLinkUrl: parsed.data.submittedLinkUrl ?? existing.submittedLinkUrl,
        submittedAt: new Date(),
        reminderActive: false,
      })
      .where(eq(homeworkTable.bookingId, id))
      .returning();
  } else {
    [hw] = await db
      .insert(homeworkTable)
      .values({
        bookingId: id,
        submittedText: parsed.data.submittedText ?? null,
        submittedLinkUrl: parsed.data.submittedLinkUrl ?? null,
        submittedAt: new Date(),
        reminderActive: false,
      })
      .returning();
  }

  if (files.length > 0) {
    const existingSubmissionCount = (await getHomeworkFiles(hw.id)).filter((f) => f.slot === "submission").length;

    await db.insert(homeworkFilesTable).values(
      files.map((file, index) => ({
        homeworkId: hw.id,
        slot: "submission" as const,
        key: file.key,
        name: file.name,
        mime: file.mime,
        url: file.url,
        linkedFileId: file.linkedFileId,
        sortOrder: existingSubmissionCount + index,
      })),
    );
  }

  const allFiles = await getHomeworkFiles(hw.id);
  res.status(201).json(mapHomeworkFields(hw, allFiles));
});

router.get("/student/homework", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const rows = await db
    .select({ hw: homeworkTable, booking: bookingsTable, lessonType: lessonTypesTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(bookingsTable.studentId, user.id))
    .orderBy(desc(bookingsTable.startTime));

  const filesByHwId = await getHomeworkFilesByIds(rows.map((r) => r.hw.id));

  res.json(
    rows.map((r) =>
      mapHomeworkRow(r.hw, filesByHwId.get(r.hw.id) ?? [], {
        studentId: user.id,
        studentName: user.displayName,
        lessonTypeName: r.lessonType.name,
        lessonDate: r.booking.startTime,
      }),
    ),
  );
});

router.post("/student/homework/:id/seen", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [row] = await db
    .select({ hw: homeworkTable, booking: bookingsTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(eq(homeworkTable.id, id), eq(bookingsTable.studentId, user.id)));
  if (!row) {
    res.status(404).json({ error: "Homework not found" });
    return;
  }

  const [hw] = await db
    .update(homeworkTable)
    .set({ studentReviewSeenAt: new Date() })
    .where(eq(homeworkTable.id, id))
    .returning();

  const context = await getHomeworkContext(hw.bookingId);
  const files = await getHomeworkFiles(id);
  res.status(200).json(mapHomeworkRow(hw, files, context));
});

router.post("/student/bookings/:id/review", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = SubmitReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.studentId, user.id)));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  const [existing] = await db.select().from(reviewsTable).where(eq(reviewsTable.bookingId, id));
  if (existing) {
    res.status(400).json({ error: "Review already submitted for this booking" });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({
      bookingId: id,
      studentId: user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    })
    .returning();

  res.status(201).json({
    id: review.id,
    bookingId: review.bookingId,
    rating: review.rating,
    comment: review.comment ?? null,
    createdAt: review.createdAt,
  });
});

router.get("/student/packages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const rows = await db
    .select()
    .from(lessonPackagesTable)
    .where(eq(lessonPackagesTable.studentId, user.id))
    .orderBy(desc(lessonPackagesTable.purchasedAt));

  res.json(
    rows.map((r) => ({
      id: r.id,
      totalCredits: r.totalCredits,
      usedCredits: r.usedCredits,
      remainingCredits: r.totalCredits - r.usedCredits,
      purchasedAt: r.purchasedAt,
    })),
  );
});

router.patch("/student/tour-complete", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  await db.update(usersTable).set({ hasSeenTour: true }).where(eq(usersTable.id, user.id));

  res.json({ hasSeenTour: true });
});

// ─── Messages ─────────────────────────────────────────────────────────────────

router.get("/student/messages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.studentId, user.id))
    .orderBy(asc(messagesTable.createdAt));

  // Mark the teacher's messages as read now that the student has viewed the thread
  await db
    .update(messagesTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messagesTable.studentId, user.id),
        eq(messagesTable.senderRole, "admin"),
        sql`${messagesTable.readAt} IS NULL`,
      ),
    );

  res.json(rows);
});

router.post("/student/messages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const parsed = SendStudentMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      studentId: user.id,
      senderRole: "student",
      body: parsed.data.body,
    })
    .returning();

  res.status(201).json(message);
});

// ─── Reports ──────────────────────────────────────────────────────────────────
// Message/homework-file targets must belong to this student's own thread/
// bookings — reports can't be filed against content the student can't see.
// "general" (and every target type) attributes the reported user to this
// student's own assigned teacher, since neither messages nor homework files
// carry per-author identity beyond the student side of the thread.

async function validateStudentReportTarget(
  studentId: number,
  targetType: "message" | "homework_file" | "general",
  targetId: number | null,
): Promise<{ ok: true; preview: string | null } | { ok: false }> {
  if (targetType === "general") {
    return targetId == null ? { ok: true, preview: null } : { ok: false };
  }
  if (targetId == null) return { ok: false };

  if (targetType === "message") {
    const [m] = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.id, targetId), eq(messagesTable.studentId, studentId)));
    return m ? { ok: true, preview: m.body.slice(0, 140) } : { ok: false };
  }

  const [row] = await db
    .select({ file: homeworkFilesTable })
    .from(homeworkFilesTable)
    .innerJoin(homeworkTable, eq(homeworkFilesTable.homeworkId, homeworkTable.id))
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(eq(homeworkFilesTable.id, targetId), eq(bookingsTable.studentId, studentId)));
  return row ? { ok: true, preview: row.file.name } : { ok: false };
}

router.post("/student/reports", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const user = await getOrCreateUser(clerkUserId);

  const parsed = CreateStudentReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const targetId = parsed.data.targetId ?? null;
  const validation = await validateStudentReportTarget(user.id, parsed.data.targetType, targetId);
  if (!validation.ok) {
    res.status(400).json({ error: "Invalid target for this report type" });
    return;
  }

  const reportedUserRole = user.teacherId != null ? "teacher" : null;

  const [report] = await db
    .insert(reportsTable)
    .values({
      reporterRole: "student",
      reporterStudentId: user.id,
      targetType: parsed.data.targetType,
      targetId,
      reportedUserRole,
      reportedTeacherId: user.teacherId ?? null,
      body: parsed.data.body,
    })
    .returning();

  let reportedUserName: string | null = null;
  if (reportedUserRole === "teacher" && user.teacherId != null) {
    const [t] = await db.select({ displayName: teachersTable.displayName }).from(teachersTable).where(eq(teachersTable.id, user.teacherId));
    reportedUserName = t?.displayName ?? null;
  }

  res.status(201).json(mapReportRow(report, user.displayName, validation.preview, reportedUserName));
});

export default router;
