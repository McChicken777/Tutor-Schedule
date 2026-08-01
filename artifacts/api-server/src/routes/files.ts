import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { homeworkTable, bookingsTable, usersTable, testHomeworkTable } from "@workspace/db";
import { getObject } from "../lib/objectStorage";

const router: IRouter = Router();

const WHICH_TO_FIELDS = {
  assigned: { key: "assignedFileKey", name: "assignedFileName", mime: "assignedFileMime" },
  submission: { key: "submittedFileKey", name: "submittedFileName", mime: "submittedFileMime" },
  review: { key: "reviewedFileKey", name: "reviewedFileName", mime: "reviewedFileMime" },
} as const;

router.get("/files/homework/:homeworkId/:which", async (req, res): Promise<void> => {
  const homeworkId = Number(req.params.homeworkId);
  const which = req.params.which as keyof typeof WHICH_TO_FIELDS;

  if (!Number.isFinite(homeworkId) || !WHICH_TO_FIELDS[which]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [row] = await db
    .select({ hw: homeworkTable, booking: bookingsTable })
    .from(homeworkTable)
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(eq(homeworkTable.id, homeworkId));

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const sess = req.session as any;
  if (!sess?.isAdmin) {
    const auth = getAuth(req);
    const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [owner] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.clerkUserId, clerkUserId), eq(usersTable.id, row.booking.studentId)));
    if (!owner) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const fields = WHICH_TO_FIELDS[which];
  const key = row.hw[fields.key] as string | null;
  const name = row.hw[fields.name] as string | null;
  const mime = row.hw[fields.mime] as string | null;

  if (!key) {
    res.status(404).json({ error: "No file for this homework/which combination" });
    return;
  }

  const buffer = await getObject(key);
  res.setHeader("Content-Type", mime ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${(name ?? "file").replace(/"/g, "")}"`);
  res.send(buffer);
});

router.get("/files/test-homework/:id/:which", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const which = req.params.which as keyof typeof WHICH_TO_FIELDS;

  if (!Number.isFinite(id) || !WHICH_TO_FIELDS[which]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [hw] = await db.select().from(testHomeworkTable).where(eq(testHomeworkTable.id, id));

  if (!hw) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const sess = req.session as any;
  if (!sess?.isAdmin) {
    const auth = getAuth(req);
    const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const fields = WHICH_TO_FIELDS[which];
  const key = hw[fields.key] as string | null;
  const name = hw[fields.name] as string | null;
  const mime = hw[fields.mime] as string | null;

  if (!key) {
    res.status(404).json({ error: "No file for this test homework/which combination" });
    return;
  }

  const buffer = await getObject(key);
  res.setHeader("Content-Type", mime ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${(name ?? "file").replace(/"/g, "")}"`);
  res.send(buffer);
});

export default router;
