import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Wraps a Clerk <SignUp> widget behind a required, unticked-by-default
// consent checkbox — affirmative opt-in, not a pre-checked box, since a
// pre-checked box isn't valid consent under GDPR. The widget itself stays
// mounted (Clerk's iframe-like internals don't need to be, and shouldn't be,
// torn down/remounted) but is visually and interactively disabled until the
// box is checked.
// "Sign up with Google" leaves the page entirely and comes back (OAuth
// round-trip), remounting this component with fresh React state — without
// persisting the checkbox, that reset the widget to disabled/greyed-out and
// flashed the consent text back in right in the middle of the redirect
// chain. sessionStorage survives that round-trip (cleared when the tab
// closes, which is fine — it only needs to last one signup attempt).
const CONSENT_STORAGE_KEY = "lacastia-signup-consent";

function readStoredConsent(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function SignUpConsentGate({
  children,
  variant = "student",
}: {
  children: ReactNode;
  variant?: "student" | "teacher";
}) {
  const [agreed, setAgreed] = useState(readStoredConsent);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleChange = (checked: boolean) => {
    setAgreed(checked);
    try {
      sessionStorage.setItem(CONSENT_STORAGE_KEY, checked ? "1" : "0");
    } catch {
      // Private browsing etc — consent just won't survive an OAuth
      // round-trip in that case, not worth failing over.
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <label className="flex items-start gap-2.5 w-full max-w-[440px] text-sm text-foreground bg-card/95 border border-border rounded-xl px-4 py-3 cursor-pointer shadow-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => handleChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-primary shrink-0"
        />
        <span className="leading-snug">
          {variant === "teacher"
            ? "I confirm I'm 18 or older. I agree to the "
            : "I confirm I'm 18 or older, or the parent/legal guardian of the student and creating this account on their behalf. I agree to the "}
          <a
            href={`${basePath}/terms`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80"
            onClick={(e) => e.stopPropagation()}
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href={`${basePath}/privacy`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80"
            onClick={(e) => e.stopPropagation()}
          >
            Privacy Policy
          </a>
          , including that lessons take place over Google Meet, which has its own terms and privacy
          policy.
        </span>
      </label>

      <div
        className={cn("w-full flex justify-center transition-opacity", !agreed && "pointer-events-none opacity-40 select-none")}
        aria-hidden={!agreed}
      >
        {children}
      </div>
    </div>
  );
}
