import { Router, type IRouter } from "express";
import { eq, and, gt, lt, isNull, or, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { homeworkTable, bookingsTable, homeworkFilesTable, reportsTable } from "@workspace/db";
import { requireCronSecret } from "../middlewares/requireCronSecret";
import { deleteObject } from "../lib/objectStorage";

const router: IRouter = Router();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * ONE_DAY_MS;
const TWENTY_EIGHT_DAYS_MS = 28 * ONE_DAY_MS;

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

router.post("/internal/homework-files-cleanup/run", requireCronSecret, async (_req, res): Promise<void> => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - TWENTY_EIGHT_DAYS_MS);

  const candidates = await db
    .select({ file: homeworkFilesTable })
    .from(homeworkFilesTable)
    .innerJoin(homeworkTable, eq(homeworkFilesTable.homeworkId, homeworkTable.id))
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(isNull(homeworkFilesTable.deletedAt), lt(bookingsTable.endTime, cutoff)));

  if (candidates.length === 0) {
    res.json({ checkedAt: now, filesDeleted: 0, skippedDueToOpenReport: 0, homeworkFileIds: [] });
    return;
  }

  const candidateIds = candidates.map((c) => c.file.id);
  const openReports = await db
    .select({ targetId: reportsTable.targetId })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.targetType, "homework_file"),
        eq(reportsTable.status, "open"),
        inArray(reportsTable.targetId, candidateIds),
      ),
    );
  const openReportFileIds = new Set(openReports.map((r) => r.targetId));

  const toDelete = candidates.filter((c) => !openReportFileIds.has(c.file.id));
  const deletedIds: number[] = [];

  for (const { file } of toDelete) {
    try {
      await deleteObject(file.key);
    } catch (err) {
      console.error(`Failed to delete object for homework file ${file.id}:`, err);
      continue;
    }
    await db.update(homeworkFilesTable).set({ deletedAt: now }).where(eq(homeworkFilesTable.id, file.id));
    deletedIds.push(file.id);
  }

  res.json({
    checkedAt: now,
    filesDeleted: deletedIds.length,
    skippedDueToOpenReport: openReportFileIds.size,
    homeworkFileIds: deletedIds,
  });
});

export default router;
