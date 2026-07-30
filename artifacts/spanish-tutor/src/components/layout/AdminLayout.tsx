import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, Users, BookOpen, Settings, LayoutDashboard, Calendar, CalendarOff, FileText, MessageSquare, MessageCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminLogout, useGetAdminDashboard } from "@workspace/api-client-react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const logout = useAdminLogout();
  const { data: dashboard } = useGetAdminDashboard();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/admin/login");
      }
    });
  };

  const navItems = [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Bookings", href: "/admin/bookings", icon: Calendar },
    { label: "Availability", href: "/admin/availability", icon: CalendarOff },
    { label: "Students", href: "/admin/students", icon: Users },
    { label: "Messages", href: "/admin/messages", icon: MessageCircle },
    { label: "Homework", href: "/admin/homework", icon: FileText },
    { label: "Lesson Types", href: "/admin/lesson-types", icon: BookOpen },
    { label: "Testimonials", href: "/admin/testimonials", icon: MessageSquare },
    { label: "FAQs", href: "/admin/faqs", icon: HelpCircle },
    { label: "Settings", href: "/admin/settings", icon: Settings },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card flex-shrink-0 flex flex-col">
        <div className="p-6">
          <Link href="/admin" className="flex items-center gap-3">
            <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 rounded" />
            <span className="font-serif text-xl font-bold text-foreground">Loquu</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location === item.href;
            const badgeCount = item.href === "/admin/homework" ? dashboard?.pendingHomeworkCount ?? 0 : 0;
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
                {badgeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
            disabled={logout.isPending}
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
