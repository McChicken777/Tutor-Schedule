import { eq, and, asc } from "drizzle-orm";
import { db, lessonPackagesTable, lessonTypesTable } from "@workspace/db";

export type LessonBalance = {
  lessonTypeId: number;
  lessonTypeName: string;
  durationMinutes: number;
  remaining: number;
};

/**
 * Remaining lessons per lesson type for a student.
 *
 * Balances are held per lesson type rather than as one fungible pool, so five
 * 55-minute lessons can't be spent on an 85-minute one. Types the student has
 * never bought simply don't appear.
 */
export async function getLessonBalances(studentId: number): Promise<LessonBalance[]> {
  const rows = await db
    .select({ pkg: lessonPackagesTable, lessonType: lessonTypesTable })
    .from(lessonPackagesTable)
    .innerJoin(lessonTypesTable, eq(lessonPackagesTable.lessonTypeId, lessonTypesTable.id))
    .where(eq(lessonPackagesTable.studentId, studentId));

  const byType = new Map<number, LessonBalance>();
  for (const { pkg, lessonType } of rows) {
    const remaining = pkg.totalLessons - pkg.usedLessons;
    const existing = byType.get(lessonType.id);
    if (existing) {
      existing.remaining += remaining;
    } else {
      byType.set(lessonType.id, {
        lessonTypeId: lessonType.id,
        lessonTypeName: lessonType.name,
        durationMinutes: lessonType.durationMinutes,
        remaining,
      });
    }
  }

  return [...byType.values()]
    .filter((b) => b.remaining > 0)
    .sort((a, b) => a.durationMinutes - b.durationMinutes);
}

/** Remaining lessons a student holds for one specific lesson type. */
export async function getRemainingForLessonType(
  studentId: number,
  lessonTypeId: number,
): Promise<number> {
  const rows = await db
    .select()
    .from(lessonPackagesTable)
    .where(
      and(
        eq(lessonPackagesTable.studentId, studentId),
        eq(lessonPackagesTable.lessonTypeId, lessonTypeId),
      ),
    );
  return rows.reduce((sum, p) => sum + (p.totalLessons - p.usedLessons), 0);
}

/**
 * Spends one lesson of the given type, oldest grant first, and reports whether
 * it succeeded. Callers must already hold the per-student advisory lock — this
 * reads and writes without its own transaction.
 */
export async function consumeLesson(studentId: number, lessonTypeId: number): Promise<boolean> {
  const packages = await db
    .select()
    .from(lessonPackagesTable)
    .where(
      and(
        eq(lessonPackagesTable.studentId, studentId),
        eq(lessonPackagesTable.lessonTypeId, lessonTypeId),
      ),
    )
    .orderBy(asc(lessonPackagesTable.purchasedAt));

  const target = packages.find((p) => p.totalLessons - p.usedLessons > 0);
  if (!target) return false;

  await db
    .update(lessonPackagesTable)
    .set({ usedLessons: target.usedLessons + 1 })
    .where(eq(lessonPackagesTable.id, target.id));
  return true;
}

/**
 * Returns one lesson to the student's balance, refilling the most recently
 * drawn-down grant first so the oldest package stays the one that expires
 * soonest in use order.
 */
export async function refundLesson(studentId: number, lessonTypeId: number): Promise<void> {
  const packages = await db
    .select()
    .from(lessonPackagesTable)
    .where(
      and(
        eq(lessonPackagesTable.studentId, studentId),
        eq(lessonPackagesTable.lessonTypeId, lessonTypeId),
      ),
    )
    .orderBy(asc(lessonPackagesTable.purchasedAt));

  const target = [...packages].reverse().find((p) => p.usedLessons > 0);
  if (!target) return;

  await db
    .update(lessonPackagesTable)
    .set({ usedLessons: target.usedLessons - 1 })
    .where(eq(lessonPackagesTable.id, target.id));
}
