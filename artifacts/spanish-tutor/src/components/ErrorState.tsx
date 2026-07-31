import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";

interface ErrorStateProps {
  error: unknown;
  /** Re-runs the failed query. Usually React Query's `refetch`. */
  onRetry?: () => void;
  /** Set when this replaces a whole page rather than one card in a page. */
  fullPage?: boolean;
  className?: string;
}

/**
 * Renders in place of content that failed to load. The technical detail block
 * is development-only: in production a student sees a plain explanation, while
 * developing we get the status, endpoint, and server stack inline rather than
 * having to go hunting in the console.
 */
export default function ErrorState({ error, onRetry, fullPage, className }: ErrorStateProps) {
  const { title, message, status, detail } = describeError(error);

  return (
    <div
      className={`${fullPage ? "p-6 md:p-10" : ""} ${className ?? ""}`}
      role="alert"
    >
      <div className="bg-card border border-destructive/30 rounded-2xl p-6 md:p-8 max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-foreground text-lg">
              {title}
              {status ? <span className="ml-2 text-sm font-normal text-muted-foreground">({status})</span> : null}
            </h2>
            <p className="text-muted-foreground mt-1">{message}</p>

            {import.meta.env.DEV && detail && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Technical details (dev only)
                </summary>
                <pre className="mt-2 p-3 bg-accent/50 rounded-lg text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-words max-h-64">
                  {detail}
                </pre>
              </details>
            )}

            {onRetry && (
              <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Try again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
