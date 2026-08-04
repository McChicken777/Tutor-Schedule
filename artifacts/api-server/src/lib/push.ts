import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export async function sendPushToUser(clerkUserId: string, payload: PushPayload): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.clerkUserId, clerkUserId));

  if (subscriptions.length === 0) {
    return;
  }

  const expiredIds: number[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredIds.push(sub.id);
        } else {
          console.error(`Push send failed for subscription ${sub.id}:`, err);
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, expiredIds));
  }
}
