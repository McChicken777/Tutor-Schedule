import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { eq, isNull } from "drizzle-orm";
import { db, teachersTable } from "@workspace/db";
import { ClaimTeacherBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

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

function serializeTeacher(teacher: { id: number; email: string; displayName: string }) {
  return { id: teacher.id, email: teacher.email, displayName: teacher.displayName };
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
  const [teacher] = await db
    .insert(teachersTable)
    .values({ clerkUserId, email: identity.email, displayName: identity.displayName })
    .returning();
  res.status(201).json(serializeTeacher(teacher));
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
    .set({ clerkUserId, email: identity.email, displayName: identity.displayName })
    .where(eq(teachersTable.id, unclaimed.id))
    .returning();
  res.json(serializeTeacher(teacher));
});

export default router;
