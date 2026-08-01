import { db, siteSettingsTable, creditBundlesTable, pool } from "@workspace/db";

async function main() {
  console.log("site_settings:", JSON.stringify(await db.select().from(siteSettingsTable), null, 2));
  console.log("credit_bundles:", JSON.stringify(await db.select().from(creditBundlesTable), null, 2));
  await pool.end();
}

main();
