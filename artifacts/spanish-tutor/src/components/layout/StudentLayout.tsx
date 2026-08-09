import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { cn } from "@/lib/utils";
import { useStudentTour } from "@/hooks/use-student-tour";
import TourCard from "@/components/tour/TourCard";
import { LogOut, LayoutDashboard, Calendar, BookOpen, MessageCircle, FileText, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import PingDot from "@/components/ui/ping-dot";
import PurchaseCreditsDialog from "@/components/PurchaseCreditsDialog";
import AppPrompts from "@/components/AppPrompts";
import LessonBalanceBadge from "@/components/LessonBalanceBadge";
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
  useListStudentHomework,
} from "@workspace/api-client-react";

// Layering, deliberately all below Radix's z-50 so a dialog, dropdown or sheet
// opened during the tour always renders above it:
//   z-30    app chrome (mobile top bar, bottom nav at rest)
//   z-40    tour backdrop — or AppPrompts, which is suppressed during the tour
//   z-[45]  tour surfaces (mobile card + nav container, desktop popover)
//   z-50    Radix portals
// Note the mobile bottom nav must not carry its own z-index while the tour is
// running: a positioned element with a z-index creates a stacking context, and
// anything inside it — including the highlighted tab — gets trapped beneath the
// backdrop. Hence the shared container below rather than a z-index on the nav.
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
  const tour = useStudentTour();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const balances = dashboard?.lessonBalances ?? [];
  const totalRemainingLessons = balances.reduce((sum, b) => sum + b.remaining, 0);
  const isLowOnLessons = !!dashboard && totalRemainingLessons <= 1;

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Bookings", href: "/bookings", icon: Calendar },
    { label: "Book a Lesson", href: "/book", icon: BookOpen },
    { label: "Messages", href: "/messages", icon: MessageCircle },
    { label: "Homework", href: "/homework", icon: FileText },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {tour.active && <div aria-hidden className="fixed inset-0 z-40 bg-black/50" />}

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
              <span className={isLowOnLessons ? "text-destructive" : ""}>
                {dashboard ? totalRemainingLessons : "–"} lessons remaining
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

        {/* Balances are per lesson length, so the sidebar lists each one rather
            than a single number that would hide which lessons are actually left. */}
        <button onClick={() => setPurchaseOpen(true)} className="w-full text-left px-6 pb-4 block">
          {balances.length > 0 ? (
            <div className="space-y-1.5">
              {balances.map((b) => (
                <LessonBalanceBadge
                  key={b.lessonTypeId}
                  durationMinutes={b.durationMinutes}
                  lessonTypeName={b.lessonTypeName}
                  count={b.remaining}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">No lessons in your balance</p>
              <p className="text-sm font-medium text-primary">Buy a package</p>
            </div>
          )}
        </button>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location === item.href || location.startsWith(`${item.href}/`);
            const isTourStep = tour.isHighlighted(item.href);
            return (
              <div key={item.href} className="relative">
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isTourStep && "relative z-[45] ring-2 ring-primary ring-offset-2 ring-offset-card",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/homework" && hasPendingHomework && <PingDot />}
                  {item.href === "/messages" && hasUnreadMessages && <PingDot />}
                </Link>
                {isTourStep && (
                  <TourCard
                    className="absolute z-[45] top-0 left-full ml-3 w-72 max-w-[calc(100vw-2rem)]"
                    index={tour.index}
                    total={tour.total}
                    title={tour.step.title}
                    description={tour.step.description}
                    isLast={tour.isLast}
                    onNext={tour.next}
                    onBack={tour.back}
                    onSkip={tour.finish}
                  />
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

      {/* Mobile bottom bar, plus the tour card when the tour is running. Both
          live in one fixed container so the card sits above the bar by document
          flow — no measuring, and it survives label wrapping, rotation and
          safe-area changes. The container (not the nav) carries the z-index,
          because a z-index on the nav would trap the highlighted tab beneath
          the tour backdrop. */}
      <div
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 flex flex-col",
          tour.active ? "z-[45]" : "z-30",
        )}
      >
        {tour.active && (
          <TourCard
            className="relative z-10 mx-3 mb-2"
            showCounter
            showClose
            index={tour.index}
            total={tour.total}
            title={tour.step.title}
            description={tour.step.description}
            isLast={tour.isLast}
            onNext={tour.next}
            onBack={tour.back}
            onSkip={tour.finish}
          />
        )}
        <nav className="relative flex items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
          {/* Re-creates the backdrop inside the raised bar, so the tour still
              reads as one continuous dim with a hole at the highlighted tab. */}
          {tour.active && (
            <span aria-hidden className="absolute inset-0 bg-black/50 pointer-events-none" />
          )}
          {navItems.map((item) => {
            const active = location === item.href || location.startsWith(`${item.href}/`);
            const highlighted = tour.isHighlighted(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3rem] text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                  highlighted && "relative z-10 rounded-xl bg-card text-primary ring-2 ring-primary",
                )}
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
            );
          })}
        </nav>
      </div>

      <PurchaseCreditsDialog open={purchaseOpen} onOpenChange={setPurchaseOpen} />
      {/* Suppressed during the tour: AppPrompts is z-40, the same layer as the
          backdrop, and sits exactly where the tour card goes. The install and
          notification nudges can wait until onboarding is done. */}
      {!tour.active && <AppPrompts />}
    </div>
  );
}
