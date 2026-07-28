import { Router, type IRouter } from "express";
import { eq, and, asc, desc, sql } from "drizzle-orm";
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
} from "../lib/calendar";

const router: IRouter = Router();

// JIT provision: get or create user from Clerk ID
async function getOrCreateUser(clerkUserId: string, email?: string, displayName?: string) {
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email: email ?? "",
        displayName: displayName ?? "Student",
      })
      .returning();
  }
  return user;
}

// The trial lesson type needs no credits to book, but a student can only ever
// book it once — checked directly against booking history (any status) rather
// than a credit balance, so it can't be re-triggered by cancelling and rebooking.
async function hasUsedTrial(studentId: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(and(eq(bookingsTable.studentId, studentId), eq(lessonTypesTable.isTrial, true)));
  return !!existing;
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

router.get("/student/me", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const { getAuth } = await import("@clerk/express");
  const auth = getAuth(req);
  const clerkUser = (auth as any)?.sessionClaims;

  const user = await getOrCreateUser(
    clerkUserId,
    (auth as any)?.sessionClaims?.email as string | undefined,
    (auth as any)?.sessionClaims?.name as string | undefined,
  );

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
    .select({
      pkg: lessonPackagesTable,
      lessonType: lessonTypesTable,
    })
    .from(lessonPackagesTable)
    .innerJoin(lessonTypesTable, eq(lessonPackagesTable.lessonTypeId, lessonTypesTable.id))
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
    (sum, p) => sum + (p.pkg.totalCredits - p.pkg.usedCredits),
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

  const trialLessonType = await getTrialLessonType();
  const trialAvailable = trialLessonType ? !(await hasUsedTrial(user.id)) : false;

  res.json({
    nextBooking: mappedUpcoming[0] ?? null,
    upcomingBookings: mappedUpcoming,
    totalRemainingCredits: totalRemaining,
    trialAvailable,
    pendingHomeworkCount,
    packages: packages.map((p) => ({
      id: p.pkg.id,
      lessonTypeId: p.pkg.lessonTypeId,
      lessonTypeName: p.lessonType.name,
      totalCredits: p.pkg.totalCredits,
      usedCredits: p.pkg.usedCredits,
      remainingCredits: p.pkg.totalCredits - p.pkg.usedCredits,
      purchasedAt: p.pkg.purchasedAt,
    })),
    recentHomework: recentHomework.map((r) => ({
      id: r.hw.id,
      bookingId: r.hw.bookingId,
      studentName: "",
      lessonTypeName: r.lessonType.name,
      lessonDate: r.booking.startTime,
      submittedText: r.hw.submittedText ?? null,
      fileUrl: r.hw.fileUrl ?? null,
      tutorFeedback: r.hw.tutorFeedback ?? null,
      grade: r.hw.grade ?? null,
      submittedAt: r.hw.submittedAt ?? null,
      reviewedAt: r.hw.reviewedAt ?? null,
    })),
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
    if (await hasUsedTrial(user.id)) {
      res.status(400).json({ error: "You've already used your free trial lesson" });
      return;
    }
  } else {
    packages = await db
      .select()
      .from(lessonPackagesTable)
      .where(
        and(
          eq(lessonPackagesTable.studentId, user.id),
          eq(lessonPackagesTable.lessonTypeId, lessonTypeId),
        ),
      );

    const totalRemaining = packages.reduce(
      (sum, p) => sum + (p.totalCredits - p.usedCredits),
      0,
    );

    if (totalRemaining <= 0) {
      res.status(400).json({ error: "No remaining credits for this lesson type" });
      return;
    }
  }

  const start = new Date(startTime as unknown as string);
  const end = new Date(start.getTime() + lessonType.durationMinutes * 60 * 1000);

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
    // Deduct one credit from the package with most credits remaining
    const pkg = packages.sort(
      (a, b) => (b.totalCredits - b.usedCredits) - (a.totalCredits - a.usedCredits),
    )[0];
    await db
      .update(lessonPackagesTable)
      .set({ usedCredits: pkg.usedCredits + 1 })
      .where(eq(lessonPackagesTable.id, pkg.id));
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
    homework: hw
      ? {
          id: hw.id,
          bookingId: hw.bookingId,
          submittedText: hw.submittedText ?? null,
          fileUrl: hw.fileUrl ?? null,
          tutorFeedback: hw.tutorFeedback ?? null,
          grade: hw.grade ?? null,
          submittedAt: hw.submittedAt ?? null,
          reviewedAt: hw.reviewedAt ?? null,
        }
      : null,
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

  // Refund credit
  const packages = await db
    .select()
    .from(lessonPackagesTable)
    .where(
      and(
        eq(lessonPackagesTable.studentId, user.id),
        eq(lessonPackagesTable.lessonTypeId, row.booking.lessonTypeId),
      ),
    )
    .orderBy(desc(lessonPackagesTable.purchasedAt));

  if (packages.length > 0 && packages[0].usedCredits > 0) {
    await db
      .update(lessonPackagesTable)
      .set({ usedCredits: packages[0].usedCredits - 1 })
      .where(eq(lessonPackagesTable.id, packages[0].id));
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

  // Delete old calendar event
  if (row.booking.calendarEventId) {
    await deleteCalendarEvent(row.booking.calendarEventId);
  }

  const newStart = new Date(parsed.data.newStartTime as unknown as string);
  const newEnd = new Date(newStart.getTime() + row.lessonType.durationMinutes * 60 * 1000);

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

  res.json({
    id: hw.id,
    bookingId: hw.bookingId,
    submittedText: hw.submittedText ?? null,
    fileUrl: hw.fileUrl ?? null,
    tutorFeedback: hw.tutorFeedback ?? null,
    grade: hw.grade ?? null,
    submittedAt: hw.submittedAt ?? null,
    reviewedAt: hw.reviewedAt ?? null,
  });
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
        submittedAt: new Date(),
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
        submittedAt: new Date(),
      })
      .returning();
  }

  res.status(201).json({
    id: hw.id,
    bookingId: hw.bookingId,
    submittedText: hw.submittedText ?? null,
    fileUrl: hw.fileUrl ?? null,
    tutorFeedback: hw.tutorFeedback ?? null,
    grade: hw.grade ?? null,
    submittedAt: hw.submittedAt ?? null,
    reviewedAt: hw.reviewedAt ?? null,
  });
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
    .select({
      pkg: lessonPackagesTable,
      lessonType: lessonTypesTable,
    })
    .from(lessonPackagesTable)
    .innerJoin(lessonTypesTable, eq(lessonPackagesTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(lessonPackagesTable.studentId, user.id))
    .orderBy(desc(lessonPackagesTable.purchasedAt));

  res.json(
    rows.map((r) => ({
      id: r.pkg.id,
      lessonTypeId: r.pkg.lessonTypeId,
      lessonTypeName: r.lessonType.name,
      totalCredits: r.pkg.totalCredits,
      usedCredits: r.pkg.usedCredits,
      remainingCredits: r.pkg.totalCredits - r.pkg.usedCredits,
      purchasedAt: r.pkg.purchasedAt,
    })),
  );
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
