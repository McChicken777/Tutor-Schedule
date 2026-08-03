import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";

const DISMISSED_KEY = "push-prompt-dismissed";

export default function PushNotificationPrompt() {
  const { isSupported, permission, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  if (!isSupported || permission !== "default" || dismissed) {
    return null;
  }

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const handleEnable = async () => {
    setSubscribing(true);
    const ok = await subscribe();
    setSubscribing(false);
    if (ok) {
      localStorage.setItem(DISMISSED_KEY, "1");
      setDismissed(true);
    }
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:right-6 z-40 md:w-80 rounded-2xl border border-border bg-card p-4 shadow-xl flex gap-3">
      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <Bell className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">Stay in the loop</p>
        <p className="text-xs text-muted-foreground mb-3">
          Get notified about messages, homework, and upcoming lessons.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleEnable} disabled={subscribing}>
            {subscribing ? "Enabling..." : "Enable notifications"}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
