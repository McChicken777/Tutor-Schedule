import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const sess = req.session as any;
  if (!sess?.isAdmin) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  next();
}
