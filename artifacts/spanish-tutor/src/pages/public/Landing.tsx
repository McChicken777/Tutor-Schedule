import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

// Minimal, static landing page. This used to pull one shared tutor's live
// bio/pricing/testimonials/FAQ from public, unauthenticated endpoints — but
// browsing is now fully code-gated (each tutor is an independent business,
// and there's no public multi-tutor marketplace), so that data no longer
// exists at a public endpoint. A full SaaS marketing redesign (selling the
// platform itself to prospective tutors, with tutor-authored testimonials)
// is a deferred follow-up — this is just enough to route people to the
// right sign-up path in the meantime.
export default function Landing() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <header className="fixed top-0 inset-x-0 bg-background/85 backdrop-blur-md z-50 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <img src={`${basePath}/logo.png`} alt="Logo" className="w-9 h-9 sm:w-11 sm:h-11 shrink-0" />
            <span className="font-serif text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
              LaCastia
            </span>
          </div>
          <nav className="flex items-center gap-3 sm:gap-6 shrink-0">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              Log in
            </Link>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="pt-40 pb-24 px-6 max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="flex items-center gap-3 text-sm font-medium text-primary mb-6">
              <span className="w-8 h-px bg-primary" />
              For tutors and their students
            </p>
            <h1 className="text-5xl md:text-6xl font-serif font-bold text-foreground leading-[1.05] tracking-tight mb-8">
              Everything your lessons need, in one place.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-md mb-10">
              Booking, availability, homework, and messages — built for independent tutors to manage
              the students they already have.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  I have a tutor's code
                  <ArrowRight className="ml-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/teacher/sign-up">I'm a tutor</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6 border-y border-border bg-accent/40">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-10">
            <div>
              <span className="font-serif text-4xl text-primary/50">01</span>
              <h3 className="text-xl font-bold text-foreground mt-3 mb-2">Your tutor signs up</h3>
              <p className="text-muted-foreground">They set up their lesson types, availability, and get a signup code to share.</p>
            </div>
            <div>
              <span className="font-serif text-4xl text-primary/50">02</span>
              <h3 className="text-xl font-bold text-foreground mt-3 mb-2">You enter their code</h3>
              <p className="text-muted-foreground">Create your account and enter the code your tutor gave you — that connects you to them.</p>
            </div>
            <div>
              <span className="font-serif text-4xl text-primary/50">03</span>
              <h3 className="text-xl font-bold text-foreground mt-3 mb-2">Book and go</h3>
              <p className="text-muted-foreground">See their availability, book lessons, message them, and track homework — all in one place.</p>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-24 px-6 border-t border-border">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground leading-[1.05]">
              Ready to get started?
            </h2>
            <div className="flex flex-col items-start md:items-end gap-4">
              <p className="text-muted-foreground max-w-sm md:text-right">
                Students need a code from their tutor. Tutors can register in a couple of minutes.
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
