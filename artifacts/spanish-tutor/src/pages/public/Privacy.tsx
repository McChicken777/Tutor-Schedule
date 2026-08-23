import { Link } from "wouter";

const LAST_UPDATED = "August 23, 2026";

export default function Privacy() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src={`${basePath}/logo.png`} alt="Logo" className="w-8 h-8" />
            <span className="font-serif text-lg font-bold text-foreground">LaCastia</span>
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Back to home</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-muted-foreground mb-2">Last updated: {LAST_UPDATED}</p>
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-8">Privacy Policy</h1>

        <div className="space-y-8 text-foreground/90 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:font-serif [&_h2]:text-foreground [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ul]:space-y-1 [&_strong]:text-foreground">

          <section>
            <p>
              This Privacy Policy explains what information LaCastia (the "Platform," "we," "us"),
              operated by <strong>[LEGAL BUSINESS NAME — placeholder, see Terms of Service]</strong>,
              collects, how we use it, and the choices you have. It applies to tutors and students who use
              the Platform.
            </p>
          </section>

          <section>
            <h2>1. Information We Collect</h2>
            <p>Directly from you:</p>
            <ul>
              <li>Account details — name and email, via our authentication provider (Clerk);</li>
              <li>Booking information — lesson types, times, and status;</li>
              <li>Messages you send to your tutor or student through the in-app chat;</li>
              <li>Homework submissions, including any files you upload;</li>
              <li>Reviews you leave, and (for tutors) testimonials/FAQ content you write;</li>
              <li>Reports you file about another user's message or file;</li>
              <li>If you enable push notifications, a device token used to deliver them.</li>
            </ul>
            <p>From connected services (tutors only, only if you choose to connect them):</p>
            <ul>
              <li>
                <strong>Google Calendar</strong> — if a tutor connects their calendar, we read free/busy
                time to determine availability, and create calendar events (with a Google Meet link) for
                bookings. We do not read the content or attendees of unrelated events beyond what's needed
                to determine if a time is busy.
              </li>
            </ul>
            <p>Automatically:</p>
            <ul>
              <li>Basic technical/usage data needed to operate and secure the Platform (e.g. request logs).</li>
            </ul>
          </section>

          <section>
            <h2>2. How We Use Information</h2>
            <ul>
              <li>To operate booking, scheduling, and availability;</li>
              <li>To let a tutor and their connected student communicate and exchange homework;</li>
              <li>To send optional notifications you've enabled (new messages, upcoming lesson reminders, homework reminders);</li>
              <li>To keep the Platform safe — reviewing reports, banning accounts that violate our Terms;</li>
              <li>To maintain and improve the Platform.</li>
            </ul>
            <p>We do not sell your personal information, and we do not use it for third-party advertising.</p>
          </section>

          <section>
            <h2>3. Google Calendar and Google Meet</h2>
            <p>
              Lessons are held over Google Meet, and a tutor may optionally connect their Google Calendar
              to power availability and Meet-link creation. Using these features also means Google
              processes data according to its own{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary">Privacy Policy</a>.
              A tutor can disconnect their Google Calendar at any time from their Availability settings,
              which revokes the Platform's access.
            </p>
          </section>

          <section>
            <h2>4. Who We Share Information With</h2>
            <p>
              A tutor sees the information of students connected to them (and vice versa) as needed to
              provide tutoring — name, bookings, messages, homework. We share information with service
              providers who help us run the Platform, only as needed for that purpose:
            </p>
            <ul>
              <li>Clerk — authentication and account management;</li>
              <li>Google — calendar sync and Meet link creation, where a tutor connects their calendar;</li>
              <li>Our hosting/database and push-notification infrastructure.</li>
            </ul>
            <p>
              We may also disclose information if required by law, or to protect the rights, safety, or
              property of LaCastia, our users, or others.
            </p>
          </section>

          <section>
            <h2>5. Data Retention</h2>
            <p>
              <strong>Homework file attachments are automatically and permanently deleted within 30 days
              of the associated lesson date.</strong> Other account and booking data is kept for as long
              as your account is active. If you'd like your account and associated data deleted, contact us
              (below) and we'll delete or anonymize it within a reasonable period, except where we're
              required to retain something by law.
            </p>
          </section>

          <section>
            <h2>6. Children's Privacy</h2>
            <p>
              The Platform is used by students under 18. Any account for a student under 18 must be
              created and controlled by a parent or legal guardian, who consents to this Privacy Policy on
              the student's behalf and is responsible for supervising the account. A parent or guardian can
              contact us at any time to review, correct, or request deletion of their child's information.
            </p>
          </section>

          <section>
            <h2>7. Your Rights</h2>
            <p>
              Depending on where you live, you may have rights to access, correct, export, or delete your
              personal information, or to object to or restrict certain processing (for example, under the
              GDPR if you're in the EU/EEA/UK). To exercise any of these rights, contact us using the
              details below.
            </p>
          </section>

          <section>
            <h2>8. Security</h2>
            <p>
              We use reasonable technical and organizational measures to protect your information.
              No method of storage or transmission is completely secure, and we can't guarantee absolute
              security.
            </p>
          </section>

          <section>
            <h2>9. Cookies</h2>
            <p>
              We use cookies only as needed to keep you signed in and to operate the Platform securely
              (via our authentication provider). We do not use third-party advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we'll
              update the "Last updated" date above and, where appropriate, notify users through the
              Platform.
            </p>
          </section>

          <section>
            <h2>11. Contact</h2>
            <p>
              Questions about this Policy, or want to exercise a data right described above? Contact us at{" "}
              <strong>[PLACEHOLDER — support/contact email]</strong>.
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
