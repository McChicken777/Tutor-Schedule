import { eq, and, inArray } from "drizzle-orm";
import { db, siteSettingsTable, creditBundlesTable, pool } from "@workspace/db";

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

  const bogusBundles = await db
    .select()
    .from(creditBundlesTable)
    .where(inArray(creditBundlesTable.id, [8, 9, 10]));
  const expected = [
    { id: 8, credits: 200 },
    { id: 9, credits: 400 },
    { id: 10, credits: 800 },
  ];
  for (const e of expected) {
    const row = bogusBundles.find((b) => b.id === e.id);
    if (!row || row.credits !== e.credits) {
      throw new Error(`Expected credit_bundles id=${e.id} with credits=${e.credits}, found ${JSON.stringify(row)}. Aborting.`);
    }
  }
  await db.delete(creditBundlesTable).where(inArray(creditBundlesTable.id, [8, 9, 10]));
  console.log("Deleted bogus credit_bundles rows id=8,9,10");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
