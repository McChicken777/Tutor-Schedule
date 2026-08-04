import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetSiteSettings, useListLessonTypes, useListTestimonials, useListFaqs, useListCreditBundles } from "@workspace/api-client-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import ErrorState from "@/components/ErrorState";

// Rounds a raw computed price UP to the next "charm price" ending in .49 or .99,
// so marketing copy reads like normal retail pricing while the advertised figure
// is always a ceiling — the real price a student pays is never higher than this.
function toCharmPrice(price: number): number {
  const steps = Math.ceil((price - 0.49) / 0.5);
  return Math.max(0.49, 0.49 + steps * 0.5);
}

export default function Landing() {
  const { data: settings, isLoading: loadingSettings, error: settingsError, refetch: refetchSettings } = useGetSiteSettings();
  const { data: lessonTypes } = useListLessonTypes();
  const { data: testimonials } = useListTestimonials();
  const { data: faqs } = useListFaqs();
  const { data: creditBundles } = useListCreditBundles();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (settingsError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <ErrorState error={settingsError} onRetry={refetchSettings} />
      </div>
    );
  }

  if (loadingSettings) {
    return <div className="min-h-screen bg-background animate-pulse" />;
  }

  const contactEmail = settings?.contactEmail || "hola@elsol.com";
  const tutorName = settings?.tutorName || "your tutor";
  const activeLessonTypes = lessonTypes?.filter((lt) => lt.isActive) ?? [];
  const trialLessonType = activeLessonTypes.find((lt) => lt.isTrial);
  const trialAvailable = !!settings?.freeTrialEnabled && !!trialLessonType;
  const activeBundles = (creditBundles ?? []).filter((b) => b.isActive);
  const perCreditRate =
    activeBundles.length > 0
      ? Math.min(...activeBundles.map((b) => b.priceCents / b.credits)) / 100
      : null;
  const sortedLessonTypes = [...activeLessonTypes].sort(
    (a, b) => (a.isTrial ? 0 : a.creditCost) - (b.isTrial ? 0 : b.creditCost)
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="fixed top-0 inset-x-0 bg-background/85 backdrop-blur-md z-50 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={`${basePath}/logo.png`} alt="Logo" className="w-11 h-11" />
            <span className="font-serif text-xl font-bold tracking-tight">LaCastia</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Button asChild size="sm">
              <Link href="/sign-up">{trialAvailable ? "Book a free lesson" : "Book a lesson"}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="pt-40 pb-24 px-6 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-16 items-end">
            <div>
              <p className="flex items-center gap-3 text-sm font-medium text-primary mb-6">
                <span className="w-8 h-px bg-primary" />
                Spanish, one conversation at a time
              </p>
              <h1 className="text-5xl md:text-6xl font-serif font-bold text-foreground leading-[1.05] tracking-tight mb-8">
                Fluency isn't a course.
                <br />
                It's a habit we build together.
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-md mb-10">
                Live, 1-on-1 lessons with {tutorName} — shaped around your goals, your pace,
                and the mistakes you need to make out loud to actually learn from them.
              </p>
              <div className="flex items-center gap-6">
                <Button asChild size="lg">
                  <Link href="/sign-up">
                    {trialAvailable ? "Book your free lesson" : "Book your first lesson"}
                    <ArrowRight className="ml-1" />
                  </Link>
                </Button>
                <a href="#packages" className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                  See lesson formats
                </a>
              </div>
              {trialAvailable && (
                <p className="text-sm text-muted-foreground mt-4">
                  Your first {trialLessonType!.durationMinutes}-minute lesson is free — no card required.
                </p>
              )}
            </div>

            <div className="relative">
              <div className="absolute -bottom-5 -right-5 w-full h-full bg-primary rounded-2xl -z-10" />
              {settings?.tutorPhotoUrl ? (
                <>
                  <div className="aspect-[4/5] rounded-2xl overflow-hidden border-4 border-background shadow-xl -rotate-1">
                    <img src={settings.tutorPhotoUrl} alt={tutorName} className="w-full h-full object-cover" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground italic font-serif -rotate-1">
                    {tutorName}, live from the first "hola"
                  </p>
                </>
              ) : (
                <div
                  className="aspect-[4/5] rounded-2xl border-4 border-background shadow-xl -rotate-1 bg-secondary text-secondary-foreground p-9 flex flex-col justify-between"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0)",
                    backgroundSize: "18px 18px",
                  }}
                >
                  <span className="text-xs font-sans font-semibold tracking-[0.2em] uppercase opacity-60">
                    Lección uno
                  </span>
                  <div>
                    <p className="font-serif text-4xl md:text-5xl leading-[1.05] mb-4">
                      Hola.
                      <br />
                      Empecemos.
                    </p>
                    <p className="text-sm opacity-75 max-w-[230px] font-sans leading-relaxed">
                      "Hello. Let's begin." Real conversation from lesson one — not just flashcards.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Bio — editorial pull-quote layout */}
        <section className="py-20 px-6 border-y border-border bg-accent/40">
          <div className="max-w-6xl mx-auto grid md:grid-cols-[auto_1fr] gap-8 md:gap-14">
            <span className="font-serif text-8xl md:text-9xl leading-none text-primary/25 select-none">
              "
            </span>
            <div className="max-w-2xl">
              <p className="text-2xl md:text-3xl font-serif text-foreground leading-snug mb-6 whitespace-pre-wrap">
                {settings?.tutorBio ||
                  "I'm a native Spanish speaker who's taught students from a dozen countries to stop translating in their heads and start thinking in Spanish. Lessons are conversational, a little messy, and built entirely around you."}
              </p>
              <p className="text-sm font-medium text-foreground">
                — {tutorName}
              </p>
            </div>
          </div>
        </section>

        {/* Lesson formats — menu style, not cards */}
        <section id="packages" className="py-24 px-6 max-w-6xl mx-auto scroll-mt-20">
          <div className="flex items-end justify-between gap-6 mb-12 flex-wrap">
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground">Lesson formats</h2>
            <p className="text-muted-foreground max-w-sm">Pick the cadence that fits your week — switch anytime.</p>
          </div>

          {activeLessonTypes.length === 0 ? (
            <p className="text-muted-foreground border-t border-border pt-8">
              No lesson types available right now.
            </p>
          ) : (
            <div className="border-t border-border">
              {sortedLessonTypes.map((lt, i) => (
                <Link
                  key={lt.id}
                  href="/sign-up"
                  className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8 py-7 border-b border-border hover:bg-accent/50 transition-colors px-2 -mx-2 rounded-lg"
                >
                  <span className="font-serif text-2xl text-muted-foreground/60 w-10 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-foreground">{lt.name}</h3>
                      {lt.isTrial && settings?.freeTrialEnabled && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                          Free first lesson
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground">{lt.description}</p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <div className="text-2xl font-serif font-bold text-foreground">
                        {lt.isTrial && settings?.freeTrialEnabled
                          ? "Free"
                          : perCreditRate !== null
                            ? `from €${toCharmPrice(perCreditRate * lt.creditCost).toFixed(2)}`
                            : null}
                      </div>
                      <div className="text-sm text-muted-foreground">{lt.durationMinutes} min</div>
                    </div>
                    <ArrowUpRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Testimonials — plain quotes, alternating rhythm */}
        {testimonials && testimonials.length > 0 && (
          <section className="py-24 bg-secondary text-secondary-foreground px-6">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-serif font-bold mb-16">What students say</h2>
              <div className="space-y-14">
                {testimonials.slice(0, 3).map((t, i) => (
                  <div
                    key={t.id}
                    className={`max-w-2xl ${i % 2 === 1 ? "ml-auto text-right" : ""}`}
                  >
                    <p className="text-xl md:text-2xl font-serif leading-snug mb-4">
                      "{t.text}"
                    </p>
                    <p className="text-sm text-secondary-foreground/70">
                      {t.studentName} · rated {t.rating}/5
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQs */}
        {faqs && faqs.length > 0 && (
          <section className="py-24 px-6 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-serif font-bold mb-12">Questions, answered</h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem key={faq.id} value={`item-${faq.id}`}>
                  <AccordionTrigger className="text-left text-lg font-medium gap-4">
                    <span className="font-serif text-muted-foreground/50 mr-1">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed pl-9">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        {/* Closing CTA */}
        <section className="py-24 px-6 border-t border-border">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground leading-[1.05]">
              Your first lesson could be this week.
            </h2>
            <div className="flex flex-col items-start md:items-end gap-4">
              <p className="text-muted-foreground max-w-sm md:text-right">
                No packages to commit to upfront — just book a lesson and see how it feels.
              </p>
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Create your account
                  <ArrowRight className="ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-accent/40 py-12 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <img src={`${basePath}/logo.png`} alt="Logo" className="w-8 h-8 opacity-70" />
            <span className="font-serif font-bold text-foreground">LaCastia</span>
          </div>
          <p className="text-sm text-muted-foreground">
            <a href={`mailto:${contactEmail}`} className="hover:text-foreground hover:underline">{contactEmail}</a>
            <span className="mx-2">·</span>
            © {new Date().getFullYear()} LaCastia
            <span className="mx-2">·</span>
            <Link href="/teacher/sign-in" className="hover:text-foreground hover:underline">Teacher login</Link>
            <span className="mx-2">·</span>
            <Link href="/teacher/sign-up" className="hover:text-foreground hover:underline">Become a tutor</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
