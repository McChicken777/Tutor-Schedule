import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Any route that throws (or rejects) lands here instead of dying as an
 * unhandled rejection or a bare Express HTML error page. Every failure is
 * logged with its full stack so a crash is diagnosable from the server log,
 * and the client always gets JSON — outside production that JSON carries the
 * real message and stack, which is what makes a failing screen self-explaining
 * during development.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, message } = classify(err);

  logger.error(
    {
      err,
      status,
      method: req.method,
      url: req.originalUrl.split("?")[0],
    },
    `Unhandled error in ${req.method} ${req.originalUrl.split("?")[0]}: ${message}`,
  );

  res.status(status).json({
    error: status >= 500 && isProduction ? "Internal server error" : message,
    ...(isProduction
      ? {}
      : {
          detail: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        }),
  });
}

function classify(err: unknown): { status: number; message: string } {
  // Matched structurally rather than with `instanceof MulterError`: multer is
  // CJS, and a bad interop unwrap here would throw inside the error handler
  // itself — the one place that must never fail.
  const named = err as { name?: string; code?: string; message?: string } | null;
  if (named?.name === "MulterError") {
    // The only limit configured is fileSize, so this is nearly always an
    // oversized upload — worth saying plainly rather than as a generic 400.
    if (named.code === "LIMIT_FILE_SIZE") {
      return { status: 413, message: "File is too large." };
    }
    return { status: 400, message: `Upload failed: ${named.message ?? "unknown error"}` };
  }

  const status = (err as { status?: number; statusCode?: number } | null)?.status
    ?? (err as { statusCode?: number } | null)?.statusCode;

  if (typeof status === "number" && status >= 400 && status < 600) {
    return { status, message: err instanceof Error ? err.message : "Request failed" };
  }

  return { status: 500, message: err instanceof Error ? err.message : "Internal server error" };
}

/**
 * Unmatched `/api/*` requests would otherwise fall through to the SPA fallback
 * or Express's HTML 404 — both of which make a typo'd or renamed endpoint look
 * like a parsing failure on the client rather than a missing route.
 */
export function apiNotFound(req: Request, res: Response): void {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl.split("?")[0]}` });
}
