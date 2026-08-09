import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// Each lesson length gets its own colour so a balance is recognisable at a
// glance without reading the label. Keyed by duration rather than lesson id, so
// the 45-minute lesson looks the same everywhere even if the teacher renames or
// recreates it. Anything unrecognised falls back to the neutral slate.
const DURATION_STYLES: Record<number, string> = {
  25: "bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300",
  45: "bg-primary/12 text-primary border-primary/25",
  85: "bg-secondary/12 text-secondary border-secondary/25 dark:text-emerald-300",
};
const FALLBACK_STYLE = "bg-muted text-muted-foreground border-border";

function styleFor(durationMinutes: number): string {
  return DURATION_STYLES[durationMinutes] ?? FALLBACK_STYLE;
}

/** The little book-with-a-duration mark used wherever a lesson length appears. */
export function LessonMark({
  durationMinutes,
  className,
}: {
  durationMinutes: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center w-9 h-9 rounded-lg border shrink-0",
        styleFor(durationMinutes),
        className,
      )}
      aria-hidden
    >
      <BookOpen className="w-5 h-5 opacity-30" />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">
        {durationMinutes}
      </span>
    </span>
  );
}

/**
 * A student's remaining lessons of one length. `count` is omitted where the
 * badge is only labelling a lesson type rather than reporting a balance.
 */
export default function LessonBalanceBadge({
  durationMinutes,
  lessonTypeName,
  count,
  className,
}: {
  durationMinutes: number;
  lessonTypeName: string;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2",
        styleFor(durationMinutes),
        className,
      )}
    >
      <LessonMark durationMinutes={durationMinutes} className="bg-background/60" />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight truncate">
          {count !== undefined ? `${count} left` : lessonTypeName}
        </p>
        <p className="text-xs opacity-70 leading-tight truncate">
          {count !== undefined ? lessonTypeName : `${durationMinutes} minutes`}
        </p>
      </div>
    </div>
  );
}
