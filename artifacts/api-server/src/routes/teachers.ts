import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { eq, isNull } from "drizzle-orm";
import {
  db,
  teachersTable,
  bookingsTable,
  usersTable,
  lessonTypesTable,
  availabilityOverridesTable,
  calendarTokensTable,
  siteSettingsTable,
  testimonialsTable,
  faqsTable,
} from "@workspace/db";
import { ClaimTeacherBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const SIGNUP_CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // excludes 0/O, 1/I/L
const SIGNUP_CODE_LENGTH = 8;

function generateSignupCode(): string {
  const bytes = randomBytes(SIGNUP_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < SIGNUP_CODE_LENGTH; i++) {
    code += SIGNUP_CODE_CHARSET[bytes[i] % SIGNUP_CODE_CHARSET.length];
  }
  return code;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

async function fetchClerkIdentity(clerkUserId: string): Promise<{ email: string; displayName: string }> {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      "";
    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "Teacher";
    return { email, displayName };
  } catch {
    return { email: "", displayName: "Teacher" };
  }
}

function serializeTeacher(teacher: { id: number; email: string; displayName: string; isAdmin: boolean; signupCode: string }) {
  return { id: teacher.id, email: teacher.email, displayName: teacher.displayName, isAdmin: teacher.isAdmin, signupCode: teacher.signupCode };
}

router.get("/teachers/me", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.clerkUserId, clerkUserId));
  if (!teacher) {
    res.status(404).json({ error: "No teacher account linked to this user" });
    return;
  }
  res.json(serializeTeacher(teacher));
});

router.post("/teachers/register", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const [existing] = await db.select().from(teachersTable).where(eq(teachersTable.clerkUserId, clerkUserId));
  if (existing) {
    res.status(409).json({ error: "This user is already linked to a teacher account" });
    return;
  }

  const identity = await fetchClerkIdentity(clerkUserId);
  let teacher: typeof teachersTable.$inferSelect | undefined;
  for (let attempts = 0; attempts < 10 && !teacher; attempts++) {
    try {
      [teacher] = await db
        .insert(teachersTable)
        .values({ clerkUserId, email: identity.email, displayName: identity.displayName, signupCode: generateSignupCode() })
        .returning();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (!teacher) {
    res.status(500).json({ error: "Failed to generate a unique signup code" });
    return;
  }
  res.status(201).json(serializeTeacher(teacher));
});

router.post("/teachers/regenerate-code", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const [existing] = await db.select().from(teachersTable).where(eq(teachersTable.clerkUserId, clerkUserId));
  if (!existing) {
    res.status(404).json({ error: "No teacher account linked to this user" });
    return;
  }

  let teacher: typeof teachersTable.$inferSelect | undefined;
  for (let attempts = 0; attempts < 10 && !teacher; attempts++) {
    try {
      [teacher] = await db
        .update(teachersTable)
        .set({ signupCode: generateSignupCode() })
        .where(eq(teachersTable.id, existing.id))
        .returning();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (!teacher) {
    res.status(500).json({ error: "Failed to generate a unique signup code" });
    return;
  }
  res.json(serializeTeacher(teacher));
});

router.post("/teachers/claim", requireAuth, async (req, res): Promise<void> => {
  const parsed = ClaimTeacherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || parsed.data.password !== adminPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  const clerkUserId = (req as any).clerkUserId;
  const [existing] = await db.select().from(teachersTable).where(eq(teachersTable.clerkUserId, clerkUserId));
  if (existing) {
    res.status(409).json({ error: "This user is already linked to a teacher account" });
    return;
  }

  const [unclaimed] = await db.select().from(teachersTable).where(isNull(teachersTable.clerkUserId));
  if (!unclaimed) {
    res.status(409).json({ error: "No unclaimed teacher account is available" });
    return;
  }

  const identity = await fetchClerkIdentity(clerkUserId);
  const [teacher] = await db
    .update(teachersTable)
    .set({ clerkUserId, email: identity.email, displayName: identity.displayName, isAdmin: true })
    .where(eq(teachersTable.id, unclaimed.id))
    .returning();
  res.json(serializeTeacher(teacher));
});

// Self-service deletion — deliberately scoped to unused accounts only. A
// teacher with any bookings or connected students has real history that a
// plain hard-delete would orphan or destroy; that case needs a person to
// handle it (reassignment, export, etc.), not a one-click endpoint.
router.delete("/teachers/me", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId;
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.clerkUserId, clerkUserId));
  if (!teacher) {
    res.status(404).json({ error: "No teacher account linked to this user" });
    return;
  }

  const [booking] = await db.select({ id: bookingsTable.id }).from(bookingsTable).where(eq(bookingsTable.teacherId, teacher.id));
  if (booking) {
    res.status(409).json({ error: "This account has bookings on record and can't be self-deleted. Contact support." });
    return;
  }
  const [student] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.teacherId, teacher.id));
  if (student) {
    res.status(409).json({ error: "This account has connected students and can't be self-deleted. Contact support." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(lessonTypesTable).where(eq(lessonTypesTable.teacherId, teacher.id));
      await tx.delete(availabilityOverridesTable).where(eq(availabilityOverridesTable.teacherId, teacher.id));
      await tx.delete(calendarTokensTable).where(eq(calendarTokensTable.teacherId, teacher.id));
      await tx.delete(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacher.id));
      await tx.delete(testimonialsTable).where(eq(testimonialsTable.teacherId, teacher.id));
      await tx.delete(faqsTable).where(eq(faqsTable.teacherId, teacher.id));
      await tx.delete(teachersTable).where(eq(teachersTable.id, teacher.id));
    });
  } catch {
    res.status(409).json({ error: "This account still has related data and can't be self-deleted. Contact support." });
    return;
  }

  res.status(204).send();
});

export default router;
