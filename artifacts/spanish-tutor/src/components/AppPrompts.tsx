import InstallAppPrompt from "@/components/InstallAppPrompt";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";

// Both prompts are opt-in nudges that live in the same corner, so they share a
// single stacking container rather than each positioning itself and risking an
// overlap when both are eligible at once. Rendered only from the student and
// teacher layouts — never from the public landing page.
export default function AppPrompts() {
  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:right-6 z-40 md:w-80 flex flex-col gap-3 pointer-events-none [&>*]:pointer-events-auto">
      <InstallAppPrompt />
      <PushNotificationPrompt />
    </div>
  );
}
