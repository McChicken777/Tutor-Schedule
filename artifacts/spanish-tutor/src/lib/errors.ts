/**
 * Turns whatever a failed request threw into something both a student and a
 * developer can act on: a plain-language title/message for the page, plus the
 * raw status/detail that only shows up in development.
 */

export interface DescribedError {
  status?: number;
  title: string;
  message: string;
  /** Server stack / raw payload. Only ever rendered in development. */
  detail?: string;
}

interface ApiErrorLike {
  name?: string;
  status?: number;
  method?: string;
  url?: string;
  data?: unknown;
  message?: string;
}

function asApiError(error: unknown): ApiErrorLike | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as ApiErrorLike;
  return typeof candidate.status === "number" ? candidate : null;
}

function serverMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = (data as Record<string, unknown>).error;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function serverDetail(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const parts = [record.detail, record.stack].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function describeError(error: unknown): DescribedError {
  const api = asApiError(error);

  if (!api) {
    // No status means the request never got a response — almost always the
    // server being down, which is worth naming explicitly rather than calling
    // it a generic failure.
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return {
      title: "Can't reach the server",
      message: "The request didn't get a response. The server may be restarting or offline.",
      detail: error instanceof Error ? (error.stack ?? message) : message,
    };
  }

  const fromServer = serverMessage(api.data);
  const detail = [
    serverDetail(api.data),
    api.method && api.url ? `${api.method} ${api.url}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  const base = { status: api.status, detail: detail || api.message };

  switch (api.status) {
    case 401:
      return { ...base, title: "You're not signed in", message: fromServer ?? "Your session expired. Sign in again to continue." };
    case 403:
      return { ...base, title: "Not allowed", message: fromServer ?? "You don't have access to this." };
    case 404:
      return { ...base, title: "Not found", message: fromServer ?? "That item doesn't exist, or it was removed." };
    case 409:
      return { ...base, title: "That didn't go through", message: fromServer ?? "Someone else changed this first. Refresh and try again." };
    case 413:
      return { ...base, title: "File too large", message: fromServer ?? "That file is over the 15MB limit." };
    default:
      if (api.status! >= 500) {
        return { ...base, title: "Something went wrong", message: fromServer ?? "The server hit an error. Try again in a moment." };
      }
      return { ...base, title: "That didn't work", message: fromServer ?? "The request was rejected." };
  }
}

/** Convenience for toasts, which want one line rather than a title/body pair. */
export function errorMessage(error: unknown): string {
  return describeError(error).message;
}
