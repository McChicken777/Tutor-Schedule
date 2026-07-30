import { Router, type IRouter } from "express";
import multer from "multer";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { bookingsTable, usersTable } from "@workspace/db";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, buildKey, putObject, type UploadContext } from "../lib/objectStorage";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const UPLOAD_CONTEXTS: UploadContext[] = ["homework-assigned", "homework-submission", "homework-review"];

router.post("/uploads", upload.single("file"), async (req, res): Promise<void> => {
  const file = req.file;
  const context = req.body?.context as string | undefined;
  const bookingIdRaw = req.body?.bookingId as string | undefined;

  if (!file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  if (!context || !UPLOAD_CONTEXTS.includes(context as UploadContext)) {
    res.status(400).json({ error: "Invalid context" });
    return;
  }
  const bookingId = Number(bookingIdRaw);
  if (!Number.isFinite(bookingId)) {
    res.status(400).json({ error: "Invalid bookingId" });
    return;
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_MIME_TYPES)[number])) {
    res.status(400).json({ error: "Unsupported file type" });
    return;
  }

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId));
  if (!booking) {
    res.status(400).json({ error: "Booking not found" });
    return;
  }

  const ctx = context as UploadContext;
  if (ctx === "homework-assigned" || ctx === "homework-review") {
    const sess = req.session as any;
    if (!sess?.isAdmin) {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
  } else {
    const auth = getAuth(req);
    const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [owner] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.clerkUserId, clerkUserId), eq(usersTable.id, booking.studentId)));
    if (!owner) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const key = buildKey(bookingId, ctx, file.originalname);
  await putObject(key, file.buffer);

  res.status(201).json({
    key,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  });
});

export default router;
