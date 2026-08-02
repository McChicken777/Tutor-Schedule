import type { Request, Response, NextFunction } from "express";
import type { Teacher } from "@workspace/db";
import { requireTeacher } from "./requireTeacher";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireTeacher(req, res, () => {
    const teacher = (req as any).teacher as Teacher;
    if (!teacher.isAdmin) {
      res.status(403).json({ error: "Admin access required", code: "NOT_ADMIN" });
      return;
    }
    next();
  });
}
