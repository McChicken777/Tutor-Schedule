import { ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, LayoutDashboard, Calendar, BookOpen, MessageCircle, FileText, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import PingDot from "@/components/ui/ping-dot";
import PurchaseCreditsDialog from "@/components/PurchaseCreditsDialog";
import {
  useGetStudentDashboard,
  useCompleteTour,
  getGetStudentDashboardQueryKey,
  useListStudentTestHomework,
} from "@workspace/api-client-react";

const TOUR_STEPS = [
  { title: "Your dashboard", description: "See your next class and remaining credits at a glance." },
  { title: "Bookings", description: "All your upcoming and past lessons live here." },
  { title: "Book a lesson", description: "Book your free trial or a new lesson in a few clicks." },
  { title: "Messages", description: "Message your teacher directly, anytime." },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: dashboard } = useGetStudentDashboard();
  const { data: testHomeworkList } = useListStudentTestHomework();
  const hasPendingTestHomework = (testHomeworkList ?? []).some((hw: any) => {
    const hasAssignment = hw.assignedText || (hw.assignedFiles?.length ?? 0) > 0;
    const needsSubmission = hasAssignment && !hw.submittedAt;
    const needsReviewSeen =
      !!hw.reviewedAt && (!hw.studentReviewSeenAt || new Date(hw.studentReviewSeenAt).getTime() < new Date(hw.reviewedAt).getTime());
    return needsSubmission || needsReviewSeen;
  });
  const completeTourMutation = useCompleteTour();
  const qc = useQueryClient();
  const [tourStep, setTourStep] = useState(0);
  const tourActive = !!dashboard && !dashboard.hasSeenTour;
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const totalRemainingCredits = dashboard?.totalRemainingCredits ?? 0;
  const isLowOnCredits = !!dashboard && totalRemainingCredits <= 1;

  const handleTourComplete = () => {
    completeTourMutation.mutate(undefined, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() }),
    });
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Bookings", href: "/bookings", icon: Calendar },
    { label: "Book a Lesson", href: "/book", icon: BookOpen },
    { label: "Messages", href: "/messages", icon: MessageCircle },
    { label: "Homework", href: "/homework", icon: FileText },
    { label: "Test Homework", href: "/test-homework", icon: FlaskConical },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card flex-shrink-0 flex flex-col md:sticky md:top-0 md:h-[100dvh] md:self-start">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 rounded" />
            <span className="font-serif text-xl font-bold text-foreground">Loquu</span>
          </Link>
        </div>

        <button onClick={() => setPurchaseOpen(true)} className="w-full text-left px-6 pb-4 block">
          <div
            className={`rounded-xl border px-4 py-3 transition-colors ${
              isLowOnCredits ? "bg-destructive/10 border-destructive/30" : "bg-primary/10 border-primary/20"
            }`}
          >
            <p className={`text-xs ${isLowOnCredits ? "text-destructive" : "text-muted-foreground"}`}>
              {isLowOnCredits ? "Low on credits" : "Credits Remaining"}
            </p>
            <p className={`text-2xl font-bold ${isLowOnCredits ? "text-destructive" : "text-primary"}`}>
              {dashboard ? totalRemainingCredits : "–"}
            </p>
          </div>
        </button>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item, index) => {
            const active = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
            const isTourStep = tourActive && index === tourStep;
            return (
              <div key={item.href} className="relative">
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isTourStep ? "relative z-50 ring-2 ring-primary ring-offset-2 ring-offset-card" : ""
                  } ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/test-homework" && hasPendingTestHomework && <PingDot />}
                </Link>
                {isTourStep && (
                  <div className="absolute z-50 top-full left-0 mt-2 md:top-0 md:left-full md:ml-3 md:mt-0 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-5 shadow-xl text-left">
                    <div className="flex items-center gap-1.5 mb-3">
                      {TOUR_STEPS.map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 rounded-full transition-all ${i === tourStep ? "w-5 bg-primary" : "w-1.5 bg-border"}`}
                        />
                      ))}
                    </div>
                    <h3 className="font-bold text-foreground mb-1">{TOUR_STEPS[tourStep].title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{TOUR_STEPS[tourStep].description}</p>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleTourComplete}
                        className="text-sm text-muted-foreground hover:text-foreground font-medium"
                      >
                        Skip
                      </button>
                      <div className="flex items-center gap-2">
                        {tourStep > 0 && (
                          <Button variant="outline" size="sm" onClick={() => setTourStep((s) => s - 1)}>
                            Back
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => {
                            if (tourStep === TOUR_STEPS.length - 1) handleTourComplete();
                            else setTourStep((s) => s + 1);
                          }}
                        >
                          {tourStep === TOUR_STEPS.length - 1 ? "Got it" : "Next"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {tourActive &&
          createPortal(<div className="fixed inset-0 z-40 bg-black/50" />, document.body)}

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 mb-4 px-2">
            <img 
              src={user?.imageUrl} 
              alt={user?.fullName || "User"} 
              className="w-10 h-10 rounded-full border-2 border-border object-cover" 
            />
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-foreground truncate">{user?.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-full overflow-hidden">
        {children}
      </main>

      <PurchaseCreditsDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} />
    </div>
  );
}
