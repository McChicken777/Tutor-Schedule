import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  lessonTypesTable,
  creditBundlesTable,
  testimonialsTable,
  faqsTable,
  siteSettingsTable,
  teachersTable,
} from "@workspace/db";
import {
  getBusyBlocks,
  generateAvailableSlots,
} from "../lib/calendar";

const router: IRouter = Router();

router.get("/lesson-types", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ lessonType: lessonTypesTable, teacher: teachersTable })
    .from(lessonTypesTable)
    .innerJoin(teachersTable, eq(lessonTypesTable.teacherId, teachersTable.id))
    .where(and(eq(lessonTypesTable.isActive, true), eq(teachersTable.isBanned, false)))
    .orderBy(asc(lessonTypesTable.id));

  const types = rows.map((r) => r.lessonType);

  res.json(
    types.map((t) => ({
      id: t.id,
      name: t.name,
      durationMinutes: t.durationMinutes,
      creditCost: t.creditCost,
      description: t.description,
      isActive: t.isActive,
      isTrial: t.isTrial,
      createdAt: t.createdAt,
    })),
  );
});

router.get("/credit-bundles", async (_req, res): Promise<void> => {
  const bundles = await db
    .select()
    .from(creditBundlesTable)
    .where(eq(creditBundlesTable.isActive, true))
    .orderBy(asc(creditBundlesTable.credits));
  res.json(bundles);
});

router.get("/available-slots", async (req, res): Promise<void> => {
  const rawLessonTypeId = parseInt(req.query.lessonTypeId as string, 10);
  const rawStartDate = req.query.startDate as string;
  const rawEndDate = req.query.endDate as string;

  if (isNaN(rawLessonTypeId) || !rawStartDate || !rawEndDate) {
    res.status(400).json({ error: "lessonTypeId, startDate, and endDate are required" });
    return;
  }

  const lessonTypeId = rawLessonTypeId;
  const startDate = rawStartDate;
  const endDate = rawEndDate;

  const [lessonType] = await db
    .select()
    .from(lessonTypesTable)
    .where(eq(lessonTypesTable.id, lessonTypeId));

  if (!lessonType) {
    res.status(404).json({ error: "Lesson type not found" });
    return;
  }

  const [owningTeacher] = await db.select().from(teachersTable).where(eq(teachersTable.id, lessonType.teacherId));
  if (owningTeacher?.isBanned) {
    res.status(404).json({ error: "Lesson type not found" });
    return;
  }

  // startDate/endDate already arrive as full day-boundary instants (the client
  // computes them via startOfDay/endOfDay in its own timezone) — use them as-is.
  // Re-deriving the end boundary with setHours(23,59,59,999) would apply the
  // *server's* local wall-clock to an already-correct instant, shifting it by
  // the server/client timezone offset.
  const start = new Date(startDate);
  const end = new Date(endDate);

  const teacherId = lessonType.teacherId;
  const [settings] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacherId));

  const busySlots = await getBusyBlocks(teacherId, start, end);
  const slots = generateAvailableSlots(
    busySlots,
    start,
    end,
    lessonType.durationMinutes,
    settings?.weeklyHours,
    30,
    settings?.timezone ?? "UTC",
  );

  res.json(slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime, available: s.available })));
});

router.get("/testimonials", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(testimonialsTable)
    .where(eq(testimonialsTable.isVisible, true))
    .orderBy(asc(testimonialsTable.createdAt));
  res.json(items);
});

router.get("/faqs", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(faqsTable)
    .where(eq(faqsTable.isVisible, true))
    .orderBy(asc(faqsTable.displayOrder));
  res.json(items);
});

router.get("/site-settings", async (_req, res): Promise<void> => {
  let [settings] = await db.select().from(siteSettingsTable).limit(1);
  if (!settings) {
    const [teacher] = await db.select().from(teachersTable).limit(1);
    if (!teacher) {
      res.status(404).json({ error: "No teacher configured" });
      return;
    }
    [settings] = await db.insert(siteSettingsTable).values({ teacherId: teacher.id }).returning();
  }
  res.json({
    id: settings.id,
    tutorName: settings.tutorName,
    tutorBio: settings.tutorBio,
    contactEmail: settings.contactEmail,
    freeTrialEnabled: settings.freeTrialEnabled,
    tutorPhotoUrl: settings.tutorPhotoUrl ?? null,
  });
});

export default router;
