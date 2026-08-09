import { eq, and, inArray } from "drizzle-orm";
import { db, siteSettingsTable, pool } from "@workspace/db";

// One-off cleanup for a seed.ts bug (fixed in this same commit): a teacher-scoped
// existence check ran before the teacherId backfill completed, so seed() inserted
// duplicate placeholder rows instead of recognizing the real pre-existing ones.

async function main() {
  const bogusSettings = await db
    .select()
    .from(siteSettingsTable)
    .where(
      and(
        eq(siteSettingsTable.teacherId, 1),
        eq(siteSettingsTable.tutorName, "Your Spanish Tutor"),
        eq(siteSettingsTable.contactEmail, "hello@example.com"),
      ),
    );
  if (bogusSettings.length !== 1) {
    throw new Error(`Expected exactly 1 bogus site_settings row, found ${bogusSettings.length}. Aborting.`);
  }
  await db.delete(siteSettingsTable).where(eq(siteSettingsTable.id, bogusSettings[0].id));
  console.log(`Deleted bogus site_settings row id=${bogusSettings[0].id}`);

  const allSettings = await db.select().from(siteSettingsTable);
  const target = allSettings.filter((s) => s.teacherId === null);
  if (target.length !== 1) {
    throw new Error(`Expected exactly 1 site_settings row with null teacherId remaining, found ${target.length}. Aborting.`);
  }
  await db.update(siteSettingsTable).set({ teacherId: 1 }).where(eq(siteSettingsTable.id, target[0].id));
  console.log(`Set site_settings id=${target[0].id} teacherId=1`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
