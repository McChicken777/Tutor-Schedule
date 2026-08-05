import { useCallback, useEffect, useState } from "react";

// Push subscriptions need a Uint8Array applicationServerKey, but VAPID public
// keys are handed out URL-safe-base64 encoded — this is the standard decode.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

const isSupported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/**
 * Keeps the device's push subscription pointing at whoever is signed in now.
 *
 * A browser push subscription outlives a session: the endpoint stays valid
 * across sign-out. Without this, if one person enables notifications and a
 * second person later signs in on the same device, the second person is never
 * re-prompted (the prompt only shows while permission is still "default"), so
 * the subscription keeps resolving to the first person — and message pushes
 * carry the full message body. So: re-register on sign-in to transfer
 * ownership, and drop the browser subscription entirely on sign-out, which
 * makes the endpoint expire and the server prune the row on its next send.
 */
export function useSyncPushSubscription(userId: string | null | undefined) {
  useEffect(() => {
    if (!isSupported || userId === undefined) return;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;

        if (!userId) {
          await existing?.unsubscribe();
          return;
        }

        if (Notification.permission !== "granted") return;

        const subscription =
          existing ??
          (await (async () => {
            const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!publicKey) return null;
            return registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
            });
          })());
        if (!subscription || cancelled) return;

        const json = subscription.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      } catch (err) {
        console.error("Push subscription sync failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : "denied",
  );

  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission);
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicKey) return false;

    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return false;

    // iOS Safari (and some other environments) support the Notification API
    // before Add to Home Screen but throw on pushManager.subscribe() until the
    // PWA is actually installed — treat that as "not available" rather than an error.
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      return response.ok;
    } catch (err) {
      console.error("Push subscription failed:", err);
      return false;
    }
  }, []);

  return { isSupported, permission, subscribe };
}
