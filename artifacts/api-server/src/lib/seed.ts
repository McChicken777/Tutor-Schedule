import { eq, and, notInArray, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  teachersTable,
  lessonTypesTable,
  lessonTypePackagesTable,
  testimonialsTable,
  faqsTable,
  siteSettingsTable,
} from "@workspace/db";

export async function seed() {
  // Placeholder teacher — unclaimed until the real operator registers/claims
  // it via POST /teachers/claim. Everything below is seeded under this
  // teacher's id so a fresh (dev/staging) database is immediately consistent.
  const existingTeachers = await db.select().from(teachersTable);
  const teacher =
    existingTeachers[0] ??
    (await db.insert(teachersTable).values({ clerkUserId: null }).returning())[0];
  if (existingTeachers.length === 0) {
    console.log("Seeded placeholder teacher");
  }

  // Lesson types
  const existingTypes = await db.select().from(lessonTypesTable);
  if (existingTypes.length === 0) {
    await db.insert(lessonTypesTable).values([
      {
        teacherId: teacher.id,
        name: "Trial Lesson",
        durationMinutes: 25,
        priceCents: 0,
        description: "A free 25-minute introductory session to see if we are the right fit.",
        isActive: true,
        isTrial: true,
      },
      {
        teacherId: teacher.id,
        name: "Short Lesson",
        durationMinutes: 25,
        priceCents: 900,
        description: "25 minutes of focused practice — ideal for keeping momentum between longer lessons.",
        isActive: true,
      },
      {
        teacherId: teacher.id,
        name: "Standard Lesson",
        durationMinutes: 45,
        priceCents: 1600,
        description: "A focused 45-minute lesson tailored to your level and goals.",
        isActive: true,
      },
      {
        teacherId: teacher.id,
        name: "Intensive Lesson",
        durationMinutes: 85,
        priceCents: 3000,
        description: "An 85-minute deep-dive session for rapid progress on specific skills.",
        isActive: true,
      },
    ]);
    console.log("Seeded lesson types");
  }

  // Bulk packages, seeded per lesson type. Only non-trial types get them — a
  // free trial has nothing to discount. Priced as a total, which is the figure
  // the student actually pays; the per-lesson rate is derived for display.
  const teacherLessonTypes = await db
    .select()
    .from(lessonTypesTable)
    .where(and(eq(lessonTypesTable.teacherId, teacher.id), eq(lessonTypesTable.isTrial, false)));

  const packagesByLessonName: Record<string, { quantity: number; totalCents: number }[]> = {
    // ~6% off for five, ~12.5% off for ten. Holding the discount steady across
    // lengths keeps the per-minute rate at roughly EUR 0.36 / 0.33 / 0.31 for
    // single / 5 / 10 whichever lesson you buy, so no length is a loophole.
    "Short Lesson": [
      { quantity: 5, totalCents: 4245 },
      { quantity: 10, totalCents: 7890 },
    ],
    "Standard Lesson": [
      { quantity: 5, totalCents: 7495 },
      { quantity: 10, totalCents: 13990 },
    ],
    // 14145 rather than the 13995 the discount implies, so it is not a
    // near-twin of the 45-minute ten-pack at 13990.
    "Intensive Lesson": [
      { quantity: 5, totalCents: 14145 },
      { quantity: 10, totalCents: 26490 },
    ],
  };

  for (const lessonType of teacherLessonTypes) {
    const desired = packagesByLessonName[lessonType.name];
    if (!desired) continue;

    for (const [index, pkg] of desired.entries()) {
      const [existing] = await db
        .select()
        .from(lessonTypePackagesTable)
        .where(
          and(
            eq(lessonTypePackagesTable.lessonTypeId, lessonType.id),
            eq(lessonTypePackagesTable.quantity, pkg.quantity),
          ),
        );
      if (existing) {
        await db
          .update(lessonTypePackagesTable)
          .set({ totalCents: pkg.totalCents, sortOrder: index, isActive: true })
          .where(eq(lessonTypePackagesTable.id, existing.id));
      } else {
        await db.insert(lessonTypePackagesTable).values({
          lessonTypeId: lessonType.id,
          quantity: pkg.quantity,
          totalCents: pkg.totalCents,
          sortOrder: index,
          isActive: true,
        });
      }
    }

    // Retire offers from a previous pricing scheme rather than deleting them —
    // past requests reference these rows.
    await db
      .update(lessonTypePackagesTable)
      .set({ isActive: false })
      .where(
        and(
          eq(lessonTypePackagesTable.lessonTypeId, lessonType.id),
          notInArray(
            lessonTypePackagesTable.quantity,
            desired.map((p) => p.quantity),
          ),
        ),
      );
  }
  console.log("Synced lesson packages");

  // Testimonials
  const existingTestimonials = await db.select().from(testimonialsTable);
  if (existingTestimonials.length === 0) {
    await db.insert(testimonialsTable).values([
      {
        studentName: "Sarah M.",
        text: "I went from zero Spanish to holding full conversations in just six months. The personalized approach made all the difference — every lesson felt tailored to exactly what I needed.",
        rating: 5,
        isVisible: true,
      },
      {
        studentName: "James T.",
        text: "Finally found a tutor who makes grammar fun instead of painful. The sessions are engaging, patient, and I always leave feeling like I've genuinely made progress.",
        rating: 5,
        isVisible: true,
      },
      {
        studentName: "Priya K.",
        text: "The flexibility of scheduling and the quality of teaching are both top-notch. I fit lessons around my busy schedule and the progress has been remarkable.",
        rating: 5,
        isVisible: true,
      },
      {
        studentName: "Carlos R.",
        text: "As a heritage speaker wanting to improve my formal Spanish, this was exactly what I needed. Nuanced, thoughtful, and incredibly effective.",
        rating: 5,
        isVisible: true,
      },
    ]);
    console.log("Seeded testimonials");
  }

  // FAQs
  const existingFaqs = await db.select().from(faqsTable);
  if (existingFaqs.length === 0) {
    await db.insert(faqsTable).values([
      {
        question: "What level of Spanish do I need to get started?",
        answer: "Absolutely none! Lessons are tailored to all levels, from complete beginners to advanced speakers looking to refine their fluency.",
        displayOrder: 1,
        isVisible: true,
      },
      {
        question: "How do classes work online?",
        answer: "Each lesson takes place over Google Meet. Once you book, a unique meeting link is automatically generated and sent to you. All you need is a stable internet connection.",
        displayOrder: 2,
        isVisible: true,
      },
      {
        question: "Can I cancel or reschedule a lesson?",
        answer: "Yes, you can cancel or reschedule from your dashboard up to 24 hours before your lesson. A cancelled lesson goes straight back into your balance.",
        displayOrder: 3,
        isVisible: true,
      },
      {
        question: "How do lesson packages work?",
        answer: "You can pay for lessons one at a time, or buy a package of 5 or 10 at a lower price per lesson. Request a package from your dashboard, and once your tutor confirms payment the lessons appear in your balance. Each lesson length has its own balance.",
        displayOrder: 4,
        isVisible: true,
      },
      {
        question: "Is there a free first lesson?",
        answer: "Yes! A free 25-minute lesson is available so you can experience the teaching style before committing. Just book the 'Trial Lesson' type.",
        displayOrder: 5,
        isVisible: true,
      },
      {
        question: "What materials do I need?",
        answer: "Just yourself and curiosity! Materials and exercises are provided during lessons. A notebook for vocabulary is always a good idea.",
        displayOrder: 6,
        isVisible: true,
      },
    ]);
    console.log("Seeded FAQs");
  }

  // Site settings
  const allSettings = await db.select().from(siteSettingsTable);
  // Matches un-backfilled rows (teacherId null) as well as this teacher's own,
  // so seed() can't insert a duplicate while running ahead of the teacherId backfill.
  const existingSettings = allSettings.filter((s) => s.teacherId === teacher.id || s.teacherId === null);
  if (existingSettings.length === 0) {
    await db.insert(siteSettingsTable).values({
      teacherId: teacher.id,
      tutorName: "Your Spanish Tutor",
      tutorBio: "Native speaker with a passion for helping learners find their voice in Spanish. With years of teaching experience spanning all levels, I create personalized lessons that make language learning feel natural — and actually fun.",
      contactEmail: "hello@example.com",
      freeTrialEnabled: true,
    });
    console.log("Seeded site settings");
  }
}
