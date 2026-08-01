import { and, eq } from "drizzle-orm";
import { db, pool, homeworkTable, homeworkFilesTable } from "@workspace/db";

// One-off migration: copies the old fixed single-file-per-slot columns on
// `homework` (assignedFile*/submittedFile*/reviewedFile*) into the new
// one-to-many `homeworkFiles` table, before those legacy columns get dropped
// in the follow-up schema push. Safe to re-run — skips any (homeworkId, slot,
// key) combination that's already been migrated.
async function main() {
  const rows = await db.select().from(homeworkTable);

  const legacySlots = [
    { slot: "assigned" as const, key: "assignedFileKey", name: "assignedFileName", mime: "assignedFileMime" },
    { slot: "submission" as const, key: "submittedFileKey", name: "submittedFileName", mime: "submittedFileMime" },
    { slot: "review" as const, key: "reviewedFileKey", name: "reviewedFileName", mime: "reviewedFileMime" },
  ];

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    for (const { slot, key, name, mime } of legacySlots) {
      const fileKey = row[key as keyof typeof row] as string | null;
      if (!fileKey) continue;

      const [existing] = await db
        .select({ id: homeworkFilesTable.id })
        .from(homeworkFilesTable)
        .where(
          and(
            eq(homeworkFilesTable.homeworkId, row.id),
            eq(homeworkFilesTable.slot, slot),
            eq(homeworkFilesTable.key, fileKey),
          ),
        );
      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(homeworkFilesTable).values({
        homeworkId: row.id,
        slot,
        key: fileKey,
        name: (row[name as keyof typeof row] as string | null) ?? fileKey,
        mime: (row[mime as keyof typeof row] as string | null) ?? "application/octet-stream",
        sortOrder: 0,
      });
      migrated++;
    }
  }

  console.log(`Backfill complete: ${migrated} file(s) migrated, ${skipped} already present.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
