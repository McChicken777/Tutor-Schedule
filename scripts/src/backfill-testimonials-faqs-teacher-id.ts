import { isNull } from "drizzle-orm";
import { db, pool, teachersTable, testimonialsTable, faqsTable } from "@workspace/db";

// One-off migration: assigns the single existing teacher's id to every
// pre-existing testimonials/faqs row, now that those tables are teacher-scoped
// (fully independent tutors, not a shared global list). Safe to re-run — only
// touches rows where teacher_id IS NULL. Assumes exactly one teacher exists,
// same invariant as backfill-teacher-id.ts.
async function main() {
  const teachers = await db.select().from(teachersTable);
  if (teachers.length !== 1) {
    throw new Error(
      `Expected exactly 1 teacher row before backfill, found ${teachers.length}. Aborting — resolve manually before re-running.`,
    );
  }
  const teacherId = teachers[0].id;

  const testimonials = await db
    .update(testimonialsTable)
    .set({ teacherId })
    .where(isNull(testimonialsTable.teacherId))
    .returning({ id: testimonialsTable.id });
  console.log(`testimonials: backfilled ${testimonials.length} row(s)`);

  const faqs = await db
    .update(faqsTable)
    .set({ teacherId })
    .where(isNull(faqsTable.teacherId))
    .returning({ id: faqsTable.id });
  console.log(`faqs: backfilled ${faqs.length} row(s)`);

  console.log(`Backfill complete for teacher id ${teacherId}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
