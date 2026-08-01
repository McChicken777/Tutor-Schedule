import { Router, type IRouter } from "express";
import { eq, and, gt, isNull, or, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { homeworkTable, bookingsTable } from "@workspace/db";
import { requireCronSecret } from "../middlewares/requireCronSecret";

const router: IRouter = Router();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * ONE_DAY_MS;

router.post("/internal/homework-reminders/run", requireCronSecret, async (_req, res): Promise<void> => {
  const now = new Date();

  const candidates = await db
    .select({ hw: homeworkTable, booking: bookingsTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        isNull(homeworkTable.submittedAt),
        eq(homeworkTable.reminderActive, false),
        or(
          sql`${homeworkTable.assignedText} IS NOT NULL`,
          sql`${homeworkTable.assignedLinkUrl} IS NOT NULL`,
          sql`EXISTS (SELECT 1 FROM homework_files WHERE homework_files.homework_id = ${homeworkTable.id} AND homework_files.slot = 'assigned')`,
        ),
      ),
    );

  const upcoming = await db
    .select({ studentId: bookingsTable.studentId, startTime: bookingsTable.startTime })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.status, "upcoming"), gt(bookingsTable.startTime, now)));

  const nextBookingByStudent = new Map<number, Date>();
  for (const b of upcoming) {
    const existing = nextBookingByStudent.get(b.studentId);
    if (!existing || b.startTime < existing) {
      nextBookingByStudent.set(b.studentId, b.startTime);
    }
  }

  const dueHomeworkIds: number[] = [];
  for (const candidate of candidates) {
    const threeDaysAfterCompletion = new Date(candidate.booking.endTime.getTime() + THREE_DAYS_MS);
    const nextStart = nextBookingByStudent.get(candidate.booking.studentId);
    const twentyFourHoursBeforeNext = nextStart ? new Date(nextStart.getTime() - ONE_DAY_MS) : undefined;

    const dueAt = twentyFourHoursBeforeNext
      ? new Date(Math.min(twentyFourHoursBeforeNext.getTime(), threeDaysAfterCompletion.getTime()))
      : threeDaysAfterCompletion;

    if (now >= dueAt) {
      dueHomeworkIds.push(candidate.hw.id);
    }
  }

  if (dueHomeworkIds.length > 0) {
    await db
      .update(homeworkTable)
      .set({ reminderActive: true, reminderSentAt: now })
      .where(inArray(homeworkTable.id, dueHomeworkIds));
  }

  res.json({
    checkedAt: now,
    remindersSet: dueHomeworkIds.length,
    homeworkIds: dueHomeworkIds,
  });
});

export default router;
