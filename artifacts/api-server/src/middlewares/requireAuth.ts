import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

// Unlike requireTeacher, a student may not have a users row yet (JIT-created
// elsewhere on first booking) — no row is not an error here, only an
// existing banned row is.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId as string | undefined || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, userId));
  if (user?.isBanned) {
    res.status(403).json({ error: "Account suspended", code: "BANNED" });
    return;
  }

  (req as any).clerkUserId = userId;
  next();
}
