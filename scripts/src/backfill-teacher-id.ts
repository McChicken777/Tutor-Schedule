import { isNull } from "drizzle-orm";
import {
  db,
  pool,
  teachersTable,
  bookingsTable,
  lessonTypesTable,
  availabilityOverridesTable,
  lessonPackagesTable,
  siteSettingsTable,
  calendarTokensTable,
  usersTable,
} from "@workspace/db";

// One-off migration: assigns the single existing teacher's id to every
// pre-existing row across the newly teacher-scoped tables. Safe to re-run —
// only touches rows where teacher_id IS NULL. Assumes exactly one teacher
// exists (the seeded placeholder row) — this script only runs before the
// multi-tenant cutover, when that invariant always holds.
async function main() {
  const teachers = await db.select().from(teachersTable);
  if (teachers.length !== 1) {
    throw new Error(
      `Expected exactly 1 teacher row before backfill, found ${teachers.length}. Aborting — resolve manually before re-running.`,
    );
  }
  const teacherId = teachers[0].id;

  const bookings = await db.update(bookingsTable).set({ teacherId }).where(isNull(bookingsTable.teacherId)).returning({ id: bookingsTable.id });
  console.log(`bookings: backfilled ${bookings.length} row(s)`);

  const lessonTypes = await db
    .update(lessonTypesTable)
    .set({ teacherId })
    .where(isNull(lessonTypesTable.teacherId))
    .returning({ id: lessonTypesTable.id });
  console.log(`lesson_types: backfilled ${lessonTypes.length} row(s)`);

  const overrides = await db
    .update(availabilityOverridesTable)
    .set({ teacherId })
    .where(isNull(availabilityOverridesTable.teacherId))
    .returning({ id: availabilityOverridesTable.id });
  console.log(`availability_overrides: backfilled ${overrides.length} row(s)`);

  const packages = await db
    .update(lessonPackagesTable)
    .set({ teacherId })
    .where(isNull(lessonPackagesTable.teacherId))
    .returning({ id: lessonPackagesTable.id });
  console.log(`lesson_packages: backfilled ${packages.length} row(s)`);

  const settings = await db
    .update(siteSettingsTable)
    .set({ teacherId })
    .where(isNull(siteSettingsTable.teacherId))
    .returning({ id: siteSettingsTable.id });
  console.log(`site_settings: backfilled ${settings.length} row(s)`);

  const tokens = await db
    .update(calendarTokensTable)
    .set({ teacherId })
    .where(isNull(calendarTokensTable.teacherId))
    .returning({ id: calendarTokensTable.id });
  console.log(`calendar_tokens: backfilled ${tokens.length} row(s)`);

  // Students: adopt every existing student into the one teacher too, so
  // nothing regresses before a student's next booking re-confirms it.
  const students = await db.update(usersTable).set({ teacherId }).where(isNull(usersTable.teacherId)).returning({ id: usersTable.id });
  console.log(`users: backfilled ${students.length} row(s)`);

  console.log(`Backfill complete for teacher id ${teacherId}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
