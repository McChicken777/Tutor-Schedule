import { db, siteSettingsTable, creditBundlesTable, teachersTable, pool } from "@workspace/db";

async function main() {
  const teachers = await db.select().from(teachersTable);
  console.log("teachers:", JSON.stringify(teachers, null, 2));

  const settings = await db.select().from(siteSettingsTable);
  console.log("site_settings:", JSON.stringify(settings, null, 2));

  const bundles = await db.select().from(creditBundlesTable);
  console.log("credit_bundles:", JSON.stringify(bundles, null, 2));

  await pool.end();
}

main();
