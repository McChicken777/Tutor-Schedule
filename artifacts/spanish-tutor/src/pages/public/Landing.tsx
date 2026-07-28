import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetSiteSettings, useListLessonTypes, useListTestimonials, useListFaqs } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Landing() {
  const { data: settings, isLoading: loadingSettings } = useGetSiteSettings();
  const { data: lessonTypes } = useListLessonTypes();
  const { data: testimonials } = useListTestimonials();
  const { data: faqs } = useListFaqs();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (loadingSettings) {
    return <div className="min-h-screen bg-background animate-pulse" />;
  }

  const contactEmail = settings?.contactEmail || "hola@elsol.com";

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="fixed top-0 inset-x-0 bg-background/80 backdrop-blur-md z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 rounded" />
            <span className="font-serif text-xl font-bold">El Sol</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-foreground hover:text-primary">Log in</Link>
            <Link href="/sign-up" className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium hover:bg-primary/90 transition">
              Book a Lesson
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block py-1 px-3 rounded-full bg-accent text-primary text-sm font-medium mb-6">
              Learn Spanish naturally.
            </span>
            <h1 className="text-5xl md:text-7xl font-serif font-bold text-foreground leading-tight mb-6">
              Speak Spanish with confidence.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed max-w-lg">
              Personalized 1-on-1 tutoring tailored to your goals. Whether you're a beginner or looking to perfect your fluency, I'm here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/sign-up" className="bg-primary text-primary-foreground px-8 py-4 rounded-full text-center font-medium hover:bg-primary/90 transition text-lg">
                Start Your Journey
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl">
              {settings?.tutorPhotoUrl ? (
                <img src={settings.tutorPhotoUrl} alt={settings.tutorName} className="w-full h-full object-cover" />
              ) : (
                <img src={`${basePath}/hero.jpg`} alt="Tutor" className="w-full h-full object-cover" />
              )}
            </div>
            {/* Decorative element */}
            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-accent rounded-full -z-10" />
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-secondary rounded-full -z-10 opacity-20" />
          </div>
        </section>

        {/* About Section */}
        <section className="py-20 bg-accent px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-6">
              Hola! I'm {settings?.tutorName || "your tutor"}.
            </h2>
            <div className="prose prose-lg mx-auto text-muted-foreground whitespace-pre-wrap">
              {settings?.tutorBio || "I am a native Spanish speaker with years of experience teaching students from all over the world. My approach is conversational, warm, and focused on making you feel comfortable making mistakes—because that's how we learn."}
            </div>
          </div>
        </section>

        {/* Pricing / Packages */}
        <section className="py-24 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-serif font-bold text-foreground mb-4">Lesson Packages</h2>
            <p className="text-lg text-muted-foreground">Choose the format that fits your learning style.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {lessonTypes?.filter(lt => lt.isActive).map(lt => (
              <div key={lt.id} className="bg-card border border-border p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                <h3 className="text-2xl font-bold text-foreground mb-2">{lt.name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-serif font-bold">${(lt.priceCents / 100).toFixed(2)}</span>
                  <span className="text-muted-foreground">/ {lt.durationMinutes} min</span>
                </div>
                <p className="text-muted-foreground mb-8">{lt.description}</p>
                <Link href="/sign-up" className="block w-full text-center py-3 rounded-xl bg-accent text-foreground font-medium hover:bg-primary hover:text-primary-foreground transition">
                  Book this lesson
                </Link>
              </div>
            ))}
            {lessonTypes?.length === 0 && (
              <div className="col-span-3 text-center text-muted-foreground">
                No lesson types available right now.
              </div>
            )}
          </div>
        </section>

        {/* Testimonials */}
        {testimonials && testimonials.length > 0 && (
          <section className="py-24 bg-secondary text-secondary-foreground px-6">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-4xl font-serif font-bold mb-16 text-center">What my students say</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {testimonials.slice(0, 3).map(t => (
                  <div key={t.id} className="bg-white/10 p-8 rounded-3xl backdrop-blur-sm border border-white/20">
                    <div className="flex gap-1 mb-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <svg key={i} className={`w-5 h-5 ${i < t.rating ? "text-[#f59e0b]" : "text-white/30"}`} fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-lg italic mb-6 leading-relaxed">"{t.text}"</p>
                    <p className="font-bold">— {t.studentName}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQs */}
        {faqs && faqs.length > 0 && (
          <section className="py-24 px-6 max-w-3xl mx-auto">
            <h2 className="text-4xl font-serif font-bold text-center mb-12">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem key={faq.id} value={`item-${faq.id}`}>
                  <AccordionTrigger className="text-left text-lg font-medium">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        {/* CTA */}
        <section className="py-24 bg-primary text-primary-foreground px-6 text-center">
          <h2 className="text-4xl font-serif font-bold mb-6">Ready to start?</h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            Book your first lesson today and let's start your journey to fluency together.
          </p>
          <Link href="/sign-up" className="bg-background text-primary px-8 py-4 rounded-full font-bold text-lg hover:bg-accent transition shadow-lg">
            Create an Account
          </Link>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-card py-12 px-6 border-t border-border text-center text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 rounded mb-6 grayscale opacity-50" />
          <p className="mb-4">Contact: <a href={`mailto:${contactEmail}`} className="text-foreground hover:underline">{contactEmail}</a></p>
          <p>© {new Date().getFullYear()} El Sol Spanish Tutoring. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
