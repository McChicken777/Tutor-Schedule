import { eq, and, notInArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  teachersTable,
  lessonTypesTable,
  testimonialsTable,
  faqsTable,
  siteSettingsTable,
  creditBundlesTable,
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
        creditCost: 1,
        description: "A free 25-minute introductory session to see if we are the right fit.",
        isActive: true,
        isTrial: true,
      },
      {
        teacherId: teacher.id,
        name: "Standard Lesson",
        durationMinutes: 55,
        creditCost: 1,
        description: "A focused 55-minute lesson tailored to your level and goals.",
        isActive: true,
      },
      {
        teacherId: teacher.id,
        name: "Intensive Lesson",
        durationMinutes: 85,
        creditCost: 2,
        description: "An 85-minute deep-dive session for rapid progress on specific skills.",
        isActive: true,
      },
      {
        teacherId: teacher.id,
        name: "Conversation Practice",
        durationMinutes: 25,
        creditCost: 1,
        description: "25 minutes of relaxed, guided conversation practice to build fluency.",
        isActive: true,
      },
    ]);
    console.log("Seeded lesson types");
  }

  // Credit packages — seed.ts is the single source of truth for pricing (no admin UI for these)
  const desiredBundles = [
    { credits: 200, priceCents: 4100, sortOrder: 0, isActive: true },
    { credits: 400, priceCents: 7790, sortOrder: 1, isActive: true },
    { credits: 800, priceCents: 14720, sortOrder: 2, isActive: true },
  ];
  for (const bundle of desiredBundles) {
    const [existing] = await db
      .select()
      .from(creditBundlesTable)
      .where(and(eq(creditBundlesTable.credits, bundle.credits), eq(creditBundlesTable.teacherId, teacher.id)));
    if (existing) {
      await db
        .update(creditBundlesTable)
        .set({ priceCents: bundle.priceCents, sortOrder: bundle.sortOrder, isActive: bundle.isActive })
        .where(eq(creditBundlesTable.id, existing.id));
    } else {
      await db.insert(creditBundlesTable).values({ ...bundle, teacherId: teacher.id });
    }
  }
  // Deactivate any leftover packages from a previous pricing scheme so they
  // stop showing up for students, without deleting rows tied to past purchases.
  await db
    .update(creditBundlesTable)
    .set({ isActive: false })
    .where(
      and(
        eq(creditBundlesTable.teacherId, teacher.id),
        notInArray(creditBundlesTable.credits, desiredBundles.map((b) => b.credits)),
      ),
    );
  console.log("Synced credit packages");

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
        answer: "Yes, you can cancel or reschedule from your dashboard up to 24 hours before your lesson. Credits are automatically returned for cancelled lessons.",
        displayOrder: 3,
        isVisible: true,
      },
      {
        question: "How do lesson credits work?",
        answer: "Credits are packages of lessons purchased in advance. Each booking uses one credit from your package. Your tutor can grant credits as part of a package deal.",
        displayOrder: 4,
        isVisible: true,
      },
      {
        question: "Is there a free trial?",
        answer: "Yes! A free 30-minute trial lesson is available so you can experience the teaching style before committing. Just book the 'Trial Lesson' type.",
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
  const existingSettings = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.teacherId, teacher.id));
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
