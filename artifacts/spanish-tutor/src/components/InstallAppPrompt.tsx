import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStandalone, promptInstall, useCanInstall } from "@/lib/pwa";

const DISMISSED_KEY = "install-prompt-dismissed";

export default function InstallAppPrompt() {
  const canInstall = useCanInstall();
  const [dismissed, setDismissed] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  if (!canInstall || dismissed || isStandalone()) {
    return null;
  }

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const handleInstall = async () => {
    setInstalling(true);
    const accepted = await promptInstall();
    setInstalling(false);
    if (accepted) {
      localStorage.setItem(DISMISSED_KEY, "1");
      setDismissed(true);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-xl flex gap-3">
      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <Download className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">Install LaCastia</p>
        <p className="text-xs text-muted-foreground mb-3">
          Add it to your home screen to open straight into your lessons.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleInstall} disabled={installing}>
            {installing ? "Installing..." : "Install app"}
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
