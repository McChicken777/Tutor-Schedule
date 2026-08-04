import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { endpoint, keys } = req.body ?? {};
  const p256dh = keys?.p256dh as string | undefined;
  const auth = keys?.auth as string | undefined;

  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "Invalid subscription" });
    return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({ clerkUserId, endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { clerkUserId, p256dh, auth },
    });

  res.status(201).json({ ok: true });
});

router.post("/push/unsubscribe", requireAuth, async (req, res): Promise<void> => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) {
    res.status(400).json({ error: "Missing endpoint" });
    return;
  }

  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));

  res.status(200).json({ ok: true });
});

export default router;
