import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  lessonTypesTable,
  testimonialsTable,
  faqsTable,
  siteSettingsTable,
} from "@workspace/db";
import {
  getBusyBlocks,
  generateAvailableSlots,
} from "../lib/calendar";

const router: IRouter = Router();

router.get("/lesson-types", async (_req, res): Promise<void> => {
  const types = await db
    .select()
    .from(lessonTypesTable)
    .where(eq(lessonTypesTable.isActive, true))
    .orderBy(asc(lessonTypesTable.id));
  res.json(
    types.map((t) => ({
      id: t.id,
      name: t.name,
      durationMinutes: t.durationMinutes,
      priceCents: t.priceCents,
      description: t.description,
      isActive: t.isActive,
      isTrial: t.isTrial,
      createdAt: t.createdAt,
    })),
  );
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

  const start = new Date(startDate as unknown as string);
  const end = new Date(endDate as unknown as string);
  end.setHours(23, 59, 59, 999);

  const [settings] = await db.select().from(siteSettingsTable).limit(1);

  const busySlots = await getBusyBlocks(start, end);
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
    [settings] = await db.insert(siteSettingsTable).values({}).returning();
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
