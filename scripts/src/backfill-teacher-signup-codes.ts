import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, teachersTable } from "@workspace/db";

// One-off migration: generates a signupCode for every teacher row that
// doesn't have one yet (signup_code = "", the column default). Safe to
// re-run — only touches rows still at that default.

const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // excludes 0/O, 1/I/L
const CODE_LENGTH = 8;

function generateSignupCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return code;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

async function main() {
  const teachers = await db.select().from(teachersTable).where(eq(teachersTable.signupCode, ""));

  for (const teacher of teachers) {
    let assigned = false;
    for (let attempts = 0; attempts < 10 && !assigned; attempts++) {
      const code = generateSignupCode();
      try {
        await db.update(teachersTable).set({ signupCode: code }).where(eq(teachersTable.id, teacher.id));
        console.log(`teacher ${teacher.id}: assigned signup code ${code}`);
        assigned = true;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    if (!assigned) {
      throw new Error(`teacher ${teacher.id}: failed to generate a unique signup code after 10 attempts`);
    }
  }

  console.log(`Backfill complete for ${teachers.length} teacher(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
