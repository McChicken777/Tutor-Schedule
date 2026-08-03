import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { LogOut, Users, BookOpen, LayoutDashboard, Calendar, CalendarOff, FileText, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import PingDot from "@/components/ui/ping-dot";
import { useGetTeacherMe, useGetTeacherDashboard, useListTeacherHomework, useListTeacherMessageThreads } from "@workspace/api-client-react";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { data: teacher } = useGetTeacherMe();
  const { data: dashboard } = useGetTeacherDashboard();
  const { data: needsReviewList } = useListTeacherHomework({ reviewed: false });
  const hasNeedsReview = (needsReviewList?.length ?? 0) > 0;
  const { data: messageThreads } = useListTeacherMessageThreads();
  const hasUnreadMessages = (messageThreads ?? []).some((t) => t.unreadCount > 0);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const navItems = [
    { label: "Bookings", href: "/teacher/bookings", icon: Calendar },
    { label: "Messages", href: "/teacher/messages", icon: MessageCircle },
    { label: "Homework", href: "/teacher/homework", icon: FileText },
    { label: "Dashboard", href: "/teacher", icon: LayoutDashboard },
    { label: "Students", href: "/teacher/students", icon: Users },
    { label: "Availability", href: "/teacher/availability", icon: CalendarOff },
    { label: "Lesson Types", href: "/teacher/lesson-types", icon: BookOpen },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card flex-shrink-0 flex flex-col md:sticky md:top-0 md:h-[100dvh] md:self-start">
        <div className="p-6">
          <Link href="/teacher" className="flex items-center gap-3">
            <img src={`${basePath}/logo.png`} alt="Logo" className="w-11 h-11" />
            <span className="font-serif text-xl font-bold text-foreground">LaCastia</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location === item.href;
            const badgeCount = item.href === "/teacher/homework" ? dashboard?.pendingHomeworkCount ?? 0 : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/teacher/homework" && hasNeedsReview && <PingDot />}
                {item.href === "/teacher/messages" && hasUnreadMessages && <PingDot />}
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
    </div>
  );
}
