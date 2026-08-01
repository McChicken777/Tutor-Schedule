import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, teachersTable } from "@workspace/db";

// Unlike getOrCreateUser for students, a teacher row is never auto-created
// here — it only exists after an explicit POST /teachers/register or
// /teachers/claim. A signed-in Clerk user with no teacher row gets a 403
// (not a 401) so the frontend can distinguish "not signed in" from
// "signed in but not registered as a teacher" and route to onboarding.
export async function requireTeacher(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.clerkUserId, clerkUserId));
  if (!teacher) {
    res.status(403).json({ error: "No teacher account linked to this user", code: "NO_TEACHER_ACCOUNT" });
    return;
  }

  (req as any).clerkUserId = clerkUserId;
  (req as any).teacherId = teacher.id;
  next();
}
