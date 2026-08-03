import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, LayoutDashboard, Calendar, BookOpen, MessageCircle, FileText, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import PingDot from "@/components/ui/ping-dot";
import PurchaseCreditsDialog from "@/components/PurchaseCreditsDialog";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useGetStudentDashboard,
  useCompleteTour,
  getGetStudentDashboardQueryKey,
  useListStudentHomework,
} from "@workspace/api-client-react";

const TOUR_STEPS = [
  { title: "Your dashboard", description: "See your next class and remaining credits at a glance." },
  { title: "Bookings", description: "All your upcoming and past lessons live here." },
  { title: "Book a lesson", description: "Book your free first lesson or a new lesson in a few clicks." },
  { title: "Messages", description: "Message your teacher directly, anytime." },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: dashboard } = useGetStudentDashboard();
  const { data: homeworkList } = useListStudentHomework();
  const hasPendingHomework = (homeworkList ?? []).some((hw: any) => {
    if (hw.noHomework) return false;
    const hasAssignment = hw.assignedText || hw.assignedLinkUrl || (hw.assignedFiles?.length ?? 0) > 0;
    const needsSubmission = hasAssignment && !hw.submittedAt;
    const needsReviewSeen =
      !!hw.reviewedAt && (!hw.studentReviewSeenAt || new Date(hw.studentReviewSeenAt).getTime() < new Date(hw.reviewedAt).getTime());
    return needsSubmission || needsReviewSeen;
  });
  const hasUnreadMessages = !!dashboard?.hasUnreadMessages;
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
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {tourActive && <div className="fixed inset-0 z-40 bg-black/50" />}

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-border bg-card">
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src={`${basePath}/logo.png`} alt="Logo" className="w-9 h-9" />
          <span className="font-serif text-lg font-bold text-foreground">LaCastia</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card">
            <img
              src={user?.imageUrl}
              alt={user?.fullName || "User"}
              className="w-9 h-9 rounded-full border-2 border-border object-cover"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground truncate">{user?.fullName}</span>
                <span className="text-xs font-normal text-muted-foreground truncate">
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPurchaseOpen(true)}>
              <UserIcon className="w-4 h-4 mr-2" />
              <span className={isLowOnCredits ? "text-destructive" : ""}>
                {dashboard ? totalRemainingCredits : "–"} credits remaining
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Sidebar */}
      <aside className="hidden md:flex w-full md:w-64 border-r border-border bg-card flex-shrink-0 flex-col md:sticky md:top-0 md:h-[100dvh] md:self-start">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img src={`${basePath}/logo.png`} alt="Logo" className="w-11 h-11" />
            <span className="font-serif text-xl font-bold text-foreground">LaCastia</span>
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
            const active = location === item.href || location.startsWith(`${item.href}/`);
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
                  {item.href === "/homework" && hasPendingHomework && <PingDot />}
                  {item.href === "/messages" && hasUnreadMessages && <PingDot />}
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
      <main className="flex-1 flex flex-col max-w-full overflow-hidden pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item, index) => {
          const active = location === item.href || location.startsWith(`${item.href}/`);
          const isTourStep = tourActive && index === tourStep;
          return (
            <div key={item.href} className="relative flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3rem] text-[11px] font-medium transition-colors ${
                  isTourStep ? "relative z-50" : ""
                } ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <span className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.href === "/homework" && hasPendingHomework && (
                    <span className="absolute -top-0.5 -right-1.5">
                      <PingDot />
                    </span>
                  )}
                  {item.href === "/messages" && hasUnreadMessages && (
                    <span className="absolute -top-0.5 -right-1.5">
                      <PingDot />
                    </span>
                  )}
                </span>
                {item.label === "Book a Lesson" ? "Book" : item.label}
              </Link>
              {isTourStep && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-5 shadow-xl text-left">
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

      <PurchaseCreditsDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} />
      <PushNotificationPrompt />
    </div>
  );
}
