import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Catches render-time crashes, which React otherwise handles by unmounting the
 * whole tree — leaving a blank white page with nothing but a console message.
 * Shows the component stack in development so the failing component is obvious
 * without reproducing the crash with devtools already open.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error("[ErrorBoundary] Render failed:", error, info.componentStack);
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-2xl bg-card border border-destructive/30 rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-serif font-bold text-foreground">Something broke on this page</h1>
              <p className="text-muted-foreground mt-2">
                This is a bug, not something you did. Reloading usually gets you moving again.
              </p>

              {import.meta.env.DEV && (
                <div className="mt-5 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">{error.name}: {error.message}</p>
                    <pre className="p-3 bg-accent/50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-48">
                      {error.stack}
                    </pre>
                  </div>
                  {componentStack && (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                        Component stack (dev only)
                      </summary>
                      <pre className="mt-2 p-3 bg-accent/50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-48">
                        {componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <Button onClick={() => window.location.reload()}>Reload page</Button>
                <Button variant="outline" onClick={() => this.setState({ error: null, componentStack: null })}>
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
