import { eq, and } from "drizzle-orm";
import { db, usersTable, teachersTable, bookingsTable, pool } from "@workspace/db";

async function main() {
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.id, 1));
  if (!teacher?.clerkUserId) throw new Error("Teacher 1 has no clerkUserId, aborting.");

  const [strayStudent] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, teacher.clerkUserId));
  if (!strayStudent) {
    console.log("No student row found for this clerkUserId — nothing to do.");
    await pool.end();
    return;
  }

  const bookings = await db.select().from(bookingsTable).where(eq(bookingsTable.studentId, strayStudent.id));
  if (bookings.length > 0) {
    throw new Error(`Student row id=${strayStudent.id} has ${bookings.length} booking(s) — not deleting, needs manual review.`);
  }

  await db.delete(usersTable).where(eq(usersTable.id, strayStudent.id));
  console.log(`Deleted stray student row id=${strayStudent.id} (email=${strayStudent.email})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
