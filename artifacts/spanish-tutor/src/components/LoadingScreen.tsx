import { Loader2Icon } from "lucide-react";

export function LoadingScreen() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-5 p-6">
      <img src={`${basePath}/logo-wordmark.png`} alt="LaCastia" className="w-44 max-w-[55vw]" />
      <div className="flex items-center gap-2 text-secondary">
        <Loader2Icon className="size-5 animate-spin" aria-hidden="true" />
        <span className="text-sm font-medium">Loading</span>
      </div>
    </div>
  );
}
