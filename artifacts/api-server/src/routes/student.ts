import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { eq, ne, lt, gt, and, asc, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  lessonTypesTable,
  lessonPackagesTable,
  homeworkTable,
  reviewsTable,
  messagesTable,
  siteSettingsTable,
  availabilityOverridesTable,
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
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  createCalendarEventWithMeet,
  deleteCalendarEvent,
  getFreeBusySlots,
} from "../lib/calendar";
import { mapHomeworkFields, mapHomeworkRow } from "../lib/homeworkMapper";

const router: IRouter = Router();

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

async function getTrialLessonType() {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  if (!settings?.freeTrialEnabled) return null;

  const [trialLessonType] = await db
    .select()
    .from(lessonTypesTable)
    .where(and(eq(lessonTypesTable.isTrial, true), eq(lessonTypesTable.isActive, true)));
  return trialLessonType ?? null;
}

// Re-validates a time window is actually still free right before committing a
// booking — the client-side slot list can go stale (another student books it
// first) or be bypassed entirely, so this is the real guarantee against
// double-booking, not the availability list.
async function isTimeSlotTaken(
  start: Date,
  end: Date,
  options?: { excludeBookingId?: number; excludeCalendarRange?: { start: Date; end: Date } },
): Promise<boolean> {
  const conditions = [
    eq(bookingsTable.status, "upcoming"),
    lt(bookingsTable.startTime, end),
    gt(bookingsTable.endTime, start),
  ];
  if (options?.excludeBookingId != null) {
    conditions.push(ne(bookingsTable.id, options.excludeBookingId));
  }

  const [conflictingBooking] = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(...conditions));
  if (conflictingBooking) return true;

  const busySlots = await getFreeBusySlots(start, end);
  const exclude = options?.excludeCalendarRange;
  const relevantBusy = exclude
    ? busySlots.filter(
        (b) => b.start.getTime() !== exclude.start.getTime() || b.end.getTime() !== exclude.end.getTime(),
      )
    : busySlots;

  if (relevantBusy.some((busy) => start < busy.end && end > busy.start)) return true;

  // In-app date-specific blocks (teacher time off) also make a slot unbookable.
  const [override] = await db
    .select({ id: availabilityOverridesTable.id })
    .from(availabilityOverridesTable)
    .where(
      and(
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
  const trialLessonType = await getTrialLessonType();
  const trialAvailable = isTestAccount || (trialLessonType ? !(await hasUsedTrial(user.id)) : false);

  res.json({
    nextBooking: mappedUpcoming[0] ?? null,
    upcomingBookings: mappedUpcoming,
    totalRemainingCredits: totalRemaining,
    trialAvailable,
    hasSeenTour: isTestAccount ? false : user.hasSeenTour,
    pendingHomeworkCount,
    packages: packages.map((p) => ({
      id: p.id,
      totalCredits: p.totalCredits,
      usedCredits: p.usedCredits,
      remainingCredits: p.totalCredits - p.usedCredits,
      purchasedAt: p.purchasedAt,
    })),
    recentHomework: recentHomework.map((r) =>
      mapHomeworkRow(r.hw, {
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

  // The trial lesson type needs no credits, but only once ever, per student
  let packages: (typeof lessonPackagesTable.$inferSelect)[] = [];
  if (lessonType.isTrial) {
    if (!isTestStudent(user.email) && (await hasUsedTrial(user.id))) {
      res.status(400).json({ error: "You've already used your free trial lesson" });
      return;
    }
  } else {
    packages = await db
      .select()
      .from(lessonPackagesTable)
      .where(eq(lessonPackagesTable.studentId, user.id));

    const totalRemaining = packages.reduce(
      (sum, p) => sum + (p.totalCredits - p.usedCredits),
      0,
    );

    if (totalRemaining < lessonType.creditCost) {
      res.status(400).json({ error: "Not enough credits for this lesson type" });
      return;
    }
  }

  const start = new Date(startTime as unknown as string);
  const end = new Date(start.getTime() + lessonType.durationMinutes * 60 * 1000);

  if (await isTimeSlotTaken(start, end)) {
    res.status(409).json({ error: "This time slot is no longer available. Please choose another." });
    return;
  }

  // Create Google Meet event
  const calendarResult = await createCalendarEventWithMeet(
    `Spanish Lesson with ${user.displayName}`,
    start,
    end,
    user.email,
    `Spanish lesson - ${lessonType.name} (${lessonType.durationMinutes} min)`,
  );

  // Create booking
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      studentId: user.id,
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
      await db
        .update(lessonPackagesTable)
        .set({ usedCredits: pkg.usedCredits + deduction })
        .where(eq(lessonPackagesTable.id, pkg.id));
      remainingToDeduct -= deduction;
    }
  }

  // Create empty homework record
  await db.insert(homeworkTable).values({ bookingId: booking.id });

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
    homework: hw ? mapHomeworkFields(hw) : null,
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
    res.status(400).json({ error: "Can only cancel upcoming bookings" });
    return;
  }

  // Delete calendar event
  if (row.booking.calendarEventId) {
    await deleteCalendarEvent(row.booking.calendarEventId);
  }

  const [updated] = await db
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
    const packages = await db
      .select()
      .from(lessonPackagesTable)
      .where(eq(lessonPackagesTable.studentId, user.id))
      .orderBy(desc(lessonPackagesTable.purchasedAt));

    let remainingToRefund = row.lessonType.creditCost;
    for (const pkg of packages) {
      if (remainingToRefund <= 0) break;
      if (pkg.usedCredits <= 0) continue;
      const refund = Math.min(pkg.usedCredits, remainingToRefund);
      await db
        .update(lessonPackagesTable)
        .set({ usedCredits: pkg.usedCredits - refund })
        .where(eq(lessonPackagesTable.id, pkg.id));
      remainingToRefund -= refund;
    }
  }

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

  const taken = await isTimeSlotTaken(newStart, newEnd, {
    excludeBookingId: id,
    excludeCalendarRange: { start: row.booking.startTime, end: row.booking.endTime },
  });
  if (taken) {
    res.status(409).json({ error: "This time slot is no longer available. Please choose another." });
    return;
  }

  // Delete old calendar event (only now that we know the new time is free)
  if (row.booking.calendarEventId) {
    await deleteCalendarEvent(row.booking.calendarEventId);
  }

  const calendarResult = await createCalendarEventWithMeet(
    `Spanish Lesson with ${user.displayName}`,
    newStart,
    newEnd,
    user.email,
  );

  const [updated] = await db
    .update(bookingsTable)
    .set({
      startTime: newStart,
      endTime: newEnd,
      meetLink: calendarResult?.meetLink ?? row.booking.meetLink,
      calendarEventId: calendarResult?.eventId ?? null,
    })
    .where(eq(bookingsTable.id, id))
    .returning();

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

  res.json(mapHomeworkFields(hw));
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

  const [existing] = await db.select().from(homeworkTable).where(eq(homeworkTable.bookingId, id));

  let hw;
  if (existing) {
    [hw] = await db
      .update(homeworkTable)
      .set({
        submittedText: parsed.data.submittedText ?? existing.submittedText,
        fileUrl: parsed.data.fileUrl ?? existing.fileUrl,
        submittedFileKey: parsed.data.fileKey ?? existing.submittedFileKey,
        submittedFileName: parsed.data.fileName ?? existing.submittedFileName,
        submittedFileMime: parsed.data.fileMime ?? existing.submittedFileMime,
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
        fileUrl: parsed.data.fileUrl ?? null,
        submittedFileKey: parsed.data.fileKey ?? null,
        submittedFileName: parsed.data.fileName ?? null,
        submittedFileMime: parsed.data.fileMime ?? null,
        submittedAt: new Date(),
        reminderActive: false,
      })
      .returning();
  }

  res.status(201).json(mapHomeworkFields(hw));
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

  res.json(
    rows.map((r) =>
      mapHomeworkRow(r.hw, {
        studentId: user.id,
        studentName: user.displayName,
        lessonTypeName: r.lessonType.name,
        lessonDate: r.booking.startTime,
      }),
    ),
  );
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

export default router;
