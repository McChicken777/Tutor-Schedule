import { Link } from "wouter";

const LAST_UPDATED = "August 23, 2026";

export default function Terms() {
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
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-8">Terms of Service</h1>

        <div className="space-y-8 text-foreground/90 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:font-serif [&_h2]:text-foreground [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ul]:space-y-1 [&_strong]:text-foreground">

          <section>
            <p>
              These Terms of Service ("Terms") govern your use of LaCastia (the "Platform," "we," "us"),
              operated by <strong>[LEGAL BUSINESS NAME — e.g. "Mellisa Ortiz, sole trader" or a registered
              company name]</strong>. By creating an account or using the Platform, you agree to these
              Terms. If you do not agree, do not use the Platform.
            </p>
          </section>

          <section>
            <h2>1. What LaCastia Is</h2>
            <p>
              LaCastia is a scheduling and practice-management tool that connects independent tutors with
              their own students. <strong>LaCastia is not a school, tutoring agency, or employer of any
              tutor.</strong> Tutors using the Platform are independent — they set their own prices,
              availability, lesson policies, and are solely responsible for the content and quality of the
              lessons they provide. LaCastia does not review, endorse, or guarantee any tutor's
              qualifications, teaching quality, or conduct.
            </p>
            <p>
              LaCastia does not process, collect, or hold payment for lessons. Payment for lessons is
              arranged directly between the tutor and the student, entirely outside the Platform. Any
              pricing, packages, or balances shown in the app are records the tutor maintains for their own
              bookkeeping, not a payment processing service, and LaCastia is not a party to that payment
              arrangement and has no obligation to mediate or refund it.
            </p>
          </section>

          <section>
            <h2>2. Eligibility and Accounts</h2>
            <p>
              You must be at least 18 years old to create and hold your own account. If a student is under
              18, their account must be created and controlled by a parent or legal guardian, who is
              responsible for supervising the student's use of the Platform, for the accuracy of any
              information provided, and for accepting these Terms and our Privacy Policy on the student's
              behalf.
            </p>
            <p>
              You're responsible for keeping your login credentials secure and for all activity under your
              account. You agree to provide accurate information and to keep it up to date.
            </p>
          </section>

          <section>
            <h2>3. Tutor Signup Codes</h2>
            <p>
              Each tutor is given a unique signup code. A student connects to a specific tutor by entering
              that tutor's code, which links the student's account to that tutor. A student account can
              only be linked to one tutor at a time. Tutors are responsible for who they share their code
              with.
            </p>
          </section>

          <section>
            <h2>4. Lessons Take Place on Google Meet</h2>
            <p>
              Lessons booked through LaCastia are conducted using Google Meet, a third-party video service
              operated by Google. By joining or hosting a lesson, you are also subject to Google's own{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline text-primary">Terms of Service</a>{" "}
              and{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary">Privacy Policy</a>.
              LaCastia does not control, and is not responsible for, Google Meet's availability,
              performance, recording features, or how Google handles data during a call. If a tutor's
              Google Calendar is connected, LaCastia uses it only to check availability and to create the
              Meet link for a booked lesson.
            </p>
          </section>

          <section>
            <h2>5. Homework and File Retention</h2>
            <p>
              Students and tutors can exchange homework assignments, notes, and file attachments through
              the Platform. <strong>Uploaded homework file attachments are automatically and permanently
              deleted from our storage within 30 days of the associated lesson date.</strong> This deletion
              is permanent and cannot be undone — if you want to keep a copy of a file past that window,
              download it yourself before then. Text-based homework notes and feedback may be retained
              longer as part of the lesson record, for as long as the associated account remains active.
            </p>
          </section>

          <section>
            <h2>6. Messages, Reviews, and Conduct</h2>
            <p>
              You're responsible for the content you post — messages, homework submissions, reviews, and
              (for tutors) testimonials and FAQ content. You agree not to use the Platform to:
            </p>
            <ul>
              <li>Harass, threaten, or abuse another user;</li>
              <li>Post unlawful, deceptive, or infringing content;</li>
              <li>Attempt to access another user's account or data without authorization;</li>
              <li>Use the Platform for anything other than tutoring-related scheduling and communication.</li>
            </ul>
            <p>
              The Platform includes an in-app way to report a message or file. We may review reports and
              take action, including suspending or terminating an account, at our discretion.
            </p>
          </section>

          <section>
            <h2>7. Notifications</h2>
            <p>
              The Platform can send optional push notifications (e.g. new messages, upcoming lesson
              reminders). These can be disabled at any time from your device or browser settings.
            </p>
          </section>

          <section>
            <h2>8. Suspension and Termination</h2>
            <p>
              We may suspend or terminate any account that violates these Terms, poses a safety risk, or
              for any other reason at our reasonable discretion. Because LaCastia does not process lesson
              payments, we have no payments to refund on termination — any financial arrangement between a
              tutor and student remains between them.
            </p>
          </section>

          <section>
            <h2>9. Disclaimer of Warranties</h2>
            <p>
              The Platform is provided "as is" and "as available," without warranties of any kind, express
              or implied, including that it will be uninterrupted, error-free, or secure. We make no
              warranty about the quality, safety, or outcome of any tutoring provided by any tutor on the
              Platform.
            </p>
          </section>

          <section>
            <h2>10. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, LaCastia and its operator will not be liable for any
              indirect, incidental, special, consequential, or punitive damages, or any loss of data,
              revenue, or goodwill, arising from your use of the Platform, any lesson conducted through it,
              any payment arrangement between a tutor and student, or any third-party service (including
              Google Meet and Google Calendar) used in connection with it. To the extent any liability
              cannot be excluded, our total liability for any claim relating to the Platform is limited to
              the greater of the amount you paid us directly in the past 12 months (which, since we do not
              charge for lesson payments, may be zero) or [PLACEHOLDER AMOUNT, e.g. €100].
            </p>
          </section>

          <section>
            <h2>11. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless LaCastia and its operator from any claim, loss, or
              expense (including reasonable legal fees) arising from your use of the Platform, your
              content, your violation of these Terms, or your interactions with another user (including any
              lesson or payment dispute between a tutor and student).
            </p>
          </section>

          <section>
            <h2>12. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes, we'll update the
              "Last updated" date above and, where appropriate, notify users through the Platform.
              Continuing to use the Platform after a change means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2>13. Governing Law</h2>
            <p>
              These Terms are governed by the laws of <strong>[PLACEHOLDER — your country/state of
              operation]</strong>, without regard to conflict-of-law principles. Any dispute arising from
              these Terms or the Platform will be subject to the exclusive jurisdiction of the courts of{" "}
              <strong>[PLACEHOLDER — your city/country]</strong>.
            </p>
          </section>

          <section>
            <h2>14. Contact</h2>
            <p>
              Questions about these Terms? Contact us at{" "}
              <strong>[PLACEHOLDER — support/contact email]</strong>.
            </p>
          </section>

        </div>
      </main>
    </div>
  );
}
