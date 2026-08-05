import { schedule } from "node-cron";
import { eq, and, gt, lt, isNull, or, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { homeworkTable, bookingsTable, homeworkFilesTable, reportsTable, usersTable, teachersTable, lessonTypesTable } from "@workspace/db";
import { deleteObject } from "./objectStorage";
import { logger } from "./logger";
import { sendPushToUser } from "./push";
import { formatStartsIn } from "./formatStartsIn";

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * ONE_DAY_MS;
const TWENTY_EIGHT_DAYS_MS = 28 * ONE_DAY_MS;
const CLASS_REMINDER_WINDOW_MS = 60 * ONE_MINUTE_MS;

// ─── Homework reminders ───────────────────────────────────────────────────────
// Sets reminderActive=true on homework that has been outstanding long enough.

export async function runHomeworkReminders(): Promise<{
  checkedAt: Date;
  remindersSet: number;
  homeworkIds: number[];
}> {
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

    const dueStudentIds = [
      ...new Set(candidates.filter((c) => dueHomeworkIds.includes(c.hw.id)).map((c) => c.booking.studentId)),
    ];
    const students = await db.select().from(usersTable).where(inArray(usersTable.id, dueStudentIds));
    await Promise.all(
      students.map((student) =>
        sendPushToUser(student.clerkUserId, {
          title: "Homework reminder",
          body: "You have homework waiting to be submitted.",
          url: "/homework",
        }).catch((err) => logger.error({ err }, "Failed to send homework-reminder push")),
      ),
    );
  }

  return { checkedAt: now, remindersSet: dueHomeworkIds.length, homeworkIds: dueHomeworkIds };
}

// ─── Homework files cleanup ───────────────────────────────────────────────────
// Deletes object-storage files for homework records older than 28 days.
// Skips any file that has an open report against it.

export async function runHomeworkFilesCleanup(): Promise<{
  checkedAt: Date;
  filesDeleted: number;
  skippedDueToOpenReport: number;
  homeworkFileIds: number[];
}> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - TWENTY_EIGHT_DAYS_MS);

  const candidates = await db
    .select({ file: homeworkFilesTable })
    .from(homeworkFilesTable)
    .innerJoin(homeworkTable, eq(homeworkFilesTable.homeworkId, homeworkTable.id))
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(and(isNull(homeworkFilesTable.deletedAt), lt(bookingsTable.endTime, cutoff)));

  if (candidates.length === 0) {
    return { checkedAt: now, filesDeleted: 0, skippedDueToOpenReport: 0, homeworkFileIds: [] };
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
      logger.error({ err, fileId: file.id }, "Failed to delete object storage file during cleanup");
      continue;
    }
    await db.update(homeworkFilesTable).set({ deletedAt: now }).where(eq(homeworkFilesTable.id, file.id));
    deletedIds.push(file.id);
  }

  return {
    checkedAt: now,
    filesDeleted: deletedIds.length,
    skippedDueToOpenReport: openReportFileIds.size,
    homeworkFileIds: deletedIds,
  };
}

// ─── Class reminders ────────────────────────────────────────────────────────
// Pushes students and teachers ~1 hour before an upcoming lesson starts.

export async function runClassReminders(): Promise<{
  checkedAt: Date;
  remindersSet: number;
  bookingIds: number[];
}> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + CLASS_REMINDER_WINDOW_MS);

  const dueBookings = await db
    .select({ booking: bookingsTable, lessonType: lessonTypesTable })
    .from(bookingsTable)
    .innerJoin(lessonTypesTable, eq(bookingsTable.lessonTypeId, lessonTypesTable.id))
    .where(
      and(
        eq(bookingsTable.status, "upcoming"),
        gt(bookingsTable.startTime, now),
        lt(bookingsTable.startTime, windowEnd),
        isNull(bookingsTable.classReminderSentAt),
      ),
    );

  if (dueBookings.length === 0) {
    return { checkedAt: now, remindersSet: 0, bookingIds: [] };
  }

  const studentIds = [...new Set(dueBookings.map((b) => b.booking.studentId))];
  const teacherIds = [...new Set(dueBookings.map((b) => b.booking.teacherId))];
  const [students, teachers] = await Promise.all([
    db.select().from(usersTable).where(inArray(usersTable.id, studentIds)),
    db.select().from(teachersTable).where(inArray(teachersTable.id, teacherIds)),
  ]);
  const studentById = new Map(students.map((s) => [s.id, s]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  await Promise.all(
    dueBookings.map(async ({ booking, lessonType }) => {
      const student = studentById.get(booking.studentId);
      const teacher = teacherById.get(booking.teacherId);
      const startLabel = formatStartsIn(booking.startTime, now);

      const pushes: Promise<void>[] = [];
      if (student) {
        pushes.push(
          sendPushToUser(student.clerkUserId, {
            title: "Upcoming lesson",
            body: `Your ${lessonType.name} lesson starts ${startLabel}.`,
            url: "/dashboard",
          }).catch((err) => logger.error({ err }, "Failed to send class-reminder push (student)")),
        );
      }
      if (teacher?.clerkUserId) {
        pushes.push(
          sendPushToUser(teacher.clerkUserId, {
            title: "Upcoming lesson",
            body: `Your lesson with ${student?.displayName ?? "a student"} starts ${startLabel}.`,
            url: "/teacher",
          }).catch((err) => logger.error({ err }, "Failed to send class-reminder push (teacher)")),
        );
      }
      await Promise.all(pushes);
    }),
  );

  const dueBookingIds = dueBookings.map((b) => b.booking.id);
  await db
    .update(bookingsTable)
    .set({ classReminderSentAt: now })
    .where(inArray(bookingsTable.id, dueBookingIds));

  return { checkedAt: now, remindersSet: dueBookingIds.length, bookingIds: dueBookingIds };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function startScheduledJobs() {
  // Homework reminders — 8:00 AM UTC daily
  schedule("0 8 * * *", async () => {
    logger.info("Scheduled job: homework-reminders starting");
    try {
      const result = await runHomeworkReminders();
      logger.info(result, "Scheduled job: homework-reminders complete");
    } catch (err) {
      logger.error({ err }, "Scheduled job: homework-reminders failed");
    }
  });

  // Homework file cleanup — 3:00 AM UTC daily
  schedule("0 3 * * *", async () => {
    logger.info("Scheduled job: homework-files-cleanup starting");
    try {
      const result = await runHomeworkFilesCleanup();
      logger.info(result, "Scheduled job: homework-files-cleanup complete");
    } catch (err) {
      logger.error({ err }, "Scheduled job: homework-files-cleanup failed");
    }
  });

  // Class reminders — every 15 minutes
  schedule("*/15 * * * *", async () => {
    logger.info("Scheduled job: class-reminders starting");
    try {
      const result = await runClassReminders();
      logger.info(result, "Scheduled job: class-reminders complete");
    } catch (err) {
      logger.error({ err }, "Scheduled job: class-reminders failed");
    }
  });

  logger.info("Scheduled jobs registered (reminders: 08:00 UTC, cleanup: 03:00 UTC, class-reminders: every 15min)");
}
