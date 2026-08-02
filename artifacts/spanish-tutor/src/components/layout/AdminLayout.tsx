import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { LogOut, LayoutDashboard, MessageSquare, HelpCircle, Settings, Flag, Users, ArrowLeftCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PingDot from "@/components/ui/ping-dot";
import { useGetAdminDashboard } from "@workspace/api-client-react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { data: dashboard } = useGetAdminDashboard();
  const hasOpenReports = (dashboard?.openReportsCount ?? 0) > 0;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const navItems = [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Testimonials", href: "/admin/testimonials", icon: MessageSquare },
    { label: "FAQs", href: "/admin/faqs", icon: HelpCircle },
    { label: "Settings", href: "/admin/settings", icon: Settings },
    { label: "Reports", href: "/admin/reports", icon: Flag },
    { label: "Accounts", href: "/admin/accounts", icon: Users },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card flex-shrink-0 flex flex-col md:sticky md:top-0 md:h-[100dvh] md:self-start">
        <div className="p-6">
          <Link href="/admin" className="flex items-center gap-3">
            <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 rounded" />
            <span className="font-serif text-xl font-bold text-foreground">Loquu Admin</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <Link
            href="/teacher"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-foreground mb-2 pb-4 border-b border-border"
          >
            <ArrowLeftCircle className="w-5 h-5" />
            <span className="flex-1">Back to Teacher Portal</span>
          </Link>
          {navItems.map((item) => {
            const active = location === item.href;
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
                {item.href === "/admin/reports" && hasOpenReports && <PingDot />}
              </Link>
            );
          })}
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
