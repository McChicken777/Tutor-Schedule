import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  LogOut,
  Users,
  BookOpen,
  LayoutDashboard,
  Calendar,
  CalendarOff,
  FileText,
  MessageCircle,
  ShieldCheck,
  MoreHorizontal,
  Wallet,
  Settings,
  Star,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PingDot from "@/components/ui/ping-dot";
import AppPrompts from "@/components/AppPrompts";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useGetTeacherMe,
  useGetTeacherDashboard,
  useListTeacherHomework,
  useListTeacherMessageThreads,
  useListTeacherPackageRequests,
} from "@workspace/api-client-react";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: teacher } = useGetTeacherMe();
  const { data: dashboard } = useGetTeacherDashboard();
  const { data: needsReviewList } = useListTeacherHomework({ reviewed: false });
  const hasNeedsReview = (needsReviewList?.length ?? 0) > 0;
  const { data: messageThreads } = useListTeacherMessageThreads();
  const hasUnreadMessages = (messageThreads ?? []).some((t) => t.unreadCount > 0);
  const pendingReviewCount = dashboard?.pendingHomeworkCount ?? 0;
  const { data: packageRequests } = useListTeacherPackageRequests();
  const hasPendingPackages = (packageRequests ?? []).some((r) => r.status === "pending");
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [moreOpen, setMoreOpen] = useState(false);

  // "/teacher" is a prefix of every other teacher route, so the dashboard has to
  // match exactly; the rest may grow detail sub-routes the way /bookings/:id did
  // on the student side.
  const isActiveHref = (href: string) =>
    href === "/teacher"
      ? location === "/teacher"
      : location === href || location.startsWith(`${href}/`);

  const navItems = [
    { label: "Dashboard", href: "/teacher", icon: LayoutDashboard, primary: true },
    { label: "Bookings", href: "/teacher/bookings", icon: Calendar, primary: true },
    { label: "Messages", href: "/teacher/messages", icon: MessageCircle, primary: true },
    { label: "Homework", href: "/teacher/homework", icon: FileText, primary: true },
    { label: "Students", href: "/teacher/students", icon: Users },
    { label: "Packages", href: "/teacher/packages", icon: Wallet },
    { label: "Availability", href: "/teacher/availability", icon: CalendarOff },
    { label: "Lesson Types", href: "/teacher/lesson-types", icon: BookOpen },
    { label: "Testimonials", href: "/teacher/testimonials", icon: Star },
    { label: "FAQ", href: "/teacher/faqs", icon: HelpCircle },
    { label: "Settings", href: "/teacher/settings", icon: Settings },
  ];
  const primaryItems = navItems.filter((item) => item.primary);
  const moreItems = navItems.filter((item) => !item.primary);
  const moreActive = moreItems.some((item) => isActiveHref(item.href));

  const signOutToHome = () => signOut({ redirectUrl: basePath || "/" });

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-border bg-card">
        <Link href="/teacher" className="flex items-center gap-2">
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
            <DropdownMenuItem
              onClick={signOutToHome}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-full md:w-64 border-r border-border bg-card flex-shrink-0 flex-col md:sticky md:top-0 md:h-[100dvh] md:self-start">
        <div className="p-6">
          <Link href="/teacher" className="flex items-center gap-3">
            <img src={`${basePath}/logo.png`} alt="Logo" className="w-11 h-11" />
            <span className="font-serif text-xl font-bold text-foreground">LaCastia</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActiveHref(item.href);
            const badgeCount = item.href === "/teacher/homework" ? pendingReviewCount : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/teacher/homework" && hasNeedsReview && <PingDot />}
                {item.href === "/teacher/messages" && hasUnreadMessages && <PingDot />}
                {item.href === "/teacher/packages" && hasPendingPackages && <PingDot />}
                {badgeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}

          {teacher?.isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-foreground mt-4 pt-4 border-t border-border"
            >
              <ShieldCheck className="w-5 h-5" />
              <span className="flex-1">Admin Portal</span>
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={signOutToHome}
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

      {/* Mobile bottom tab bar — four daily-use destinations plus More. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        {primaryItems.map((item) => {
          const active = isActiveHref(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3rem] text-[11px] font-medium transition-colors",
                // text-secondary, not text-secondary-foreground: the latter is
                // near-white and would vanish against the card background.
                active ? "text-secondary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <item.icon className="w-5 h-5" />
                {item.href === "/teacher/homework" &&
                  (pendingReviewCount > 0 ? (
                    <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                      {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
                    </span>
                  ) : hasNeedsReview ? (
                    <span className="absolute -top-0.5 -right-1.5">
                      <PingDot />
                    </span>
                  ) : null)}
                {item.href === "/teacher/messages" && hasUnreadMessages && (
                  <span className="absolute -top-0.5 -right-1.5">
                    <PingDot />
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3rem] text-[11px] font-medium transition-colors",
            moreActive || moreOpen ? "text-secondary" : "text-muted-foreground",
          )}
        >
          <span className="relative">
            <MoreHorizontal className="w-5 h-5" />
            {hasPendingPackages && (
              <span className="absolute -top-0.5 -right-1.5">
                <PingDot />
              </span>
            )}
          </span>
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-left">More</SheetTitle>
            <SheetDescription className="sr-only">
              Additional teacher navigation and account actions
            </SheetDescription>
          </SheetHeader>
          <nav className="px-3 pb-4 space-y-1">
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors",
                  isActiveHref(item.href)
                    ? "bg-secondary text-secondary-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/teacher/packages" && hasPendingPackages && <PingDot />}
              </Link>
            ))}

            {teacher?.isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-accent mt-2 pt-4 border-t border-border"
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="flex-1">Admin Portal</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                signOutToHome();
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-accent mt-2 pt-4 border-t border-border"
            >
              <LogOut className="w-5 h-5" />
              <span className="flex-1 text-left">Log out</span>
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      <AppPrompts />
    </div>
  );
}
