import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_CRON_SECRET;
  if (!expected) {
    res.status(401).json({ error: "Internal endpoint not configured" });
    return;
  }

  const provided = req.header("X-Internal-Secret") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);

  const isValid =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

  if (!isValid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
