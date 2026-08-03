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
