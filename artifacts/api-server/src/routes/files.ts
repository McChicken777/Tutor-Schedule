import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { homeworkTable, homeworkFilesTable, bookingsTable, usersTable } from "@workspace/db";
import { getObject } from "../lib/objectStorage";

const router: IRouter = Router();

router.get("/files/homework-file/:fileId", async (req, res): Promise<void> => {
  const fileId = Number(req.params.fileId);

  if (!Number.isFinite(fileId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [row] = await db
    .select({ file: homeworkFilesTable, booking: bookingsTable })
    .from(homeworkFilesTable)
    .innerJoin(homeworkTable, eq(homeworkFilesTable.homeworkId, homeworkTable.id))
    .innerJoin(bookingsTable, eq(homeworkTable.bookingId, bookingsTable.id))
    .where(eq(homeworkFilesTable.id, fileId));

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

  const buffer = await getObject(row.file.key);
  res.setHeader("Content-Type", row.file.mime ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${(row.file.name ?? "file").replace(/"/g, "")}"`);
  res.send(buffer);
});

export default router;
