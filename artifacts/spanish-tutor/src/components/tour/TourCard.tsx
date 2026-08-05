import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The card body is shared between the two tour presentations; only the
// positioning differs, and that comes in via className. Desktop anchors it
// beside the sidebar item; mobile renders it full-width above the tab bar.
export default function TourCard({
  index,
  total,
  title,
  description,
  isLast,
  onNext,
  onBack,
  onSkip,
  showCounter = false,
  showClose = false,
  className,
}: {
  index: number;
  total: number;
  title: string;
  description: string;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  showCounter?: boolean;
  showClose?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-xl text-left",
        className,
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
        {showCounter && (
          <span className="text-xs text-muted-foreground">
            Step {index + 1} of {total}
          </span>
        )}
        {showClose && (
          <button
            type="button"
            onClick={onSkip}
            aria-label="Close tour"
            className="ml-auto -mr-1 -mt-1 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <h3 className="font-bold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground font-medium"
        >
          Skip
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button variant="outline" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          <Button size="sm" onClick={onNext}>
            {isLast ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
