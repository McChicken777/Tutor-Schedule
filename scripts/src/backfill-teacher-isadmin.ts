import { isNotNull, eq } from "drizzle-orm";
import { db, pool, teachersTable } from "@workspace/db";

// One-off migration: marks the single claimed teacher (the real operator) as
// the platform admin. Safe to re-run — only flips isAdmin for the claimed
// row, doesn't touch anything already true. Aborts loudly if more than one
// teacher has been claimed since Phase 2 shipped, rather than guessing which
// one should become admin.
async function main() {
  const claimed = await db.select().from(teachersTable).where(isNotNull(teachersTable.clerkUserId));
  if (claimed.length !== 1) {
    throw new Error(
      `Expected exactly 1 claimed teacher row before backfill, found ${claimed.length}. Aborting — resolve manually before re-running.`,
    );
  }
  const teacher = claimed[0];

  const updated = await db
    .update(teachersTable)
    .set({ isAdmin: true })
    .where(eq(teachersTable.id, teacher.id))
    .returning({ id: teachersTable.id, email: teachersTable.email });
  console.log(`teachers: marked isAdmin=true for id ${updated[0]?.id} (${updated[0]?.email})`);

  console.log(`Backfill complete.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
