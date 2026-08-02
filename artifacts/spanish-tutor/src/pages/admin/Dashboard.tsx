import { useGetAdminDashboard } from "@workspace/api-client-react";
import { Users, GraduationCap, Calendar, FileText, Flag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";

export default function AdminDashboard() {
  const { data: dashboard, isLoading, error, refetch } = useGetAdminDashboard();

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={refetch} fullPage />;
  if (!dashboard) return null;

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <Users className="w-5 h-5 text-primary" />
            <span className="font-medium">Teachers</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.totalTeachers}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <GraduationCap className="w-5 h-5 text-secondary" />
            <span className="font-medium">Students</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.totalStudents}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span className="font-medium">Bookings This Week</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.totalBookingsThisWeek}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <FileText className="w-5 h-5 text-[#f59e0b]" />
            <span className="font-medium">Pending Homework</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.totalPendingHomework}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <Flag className="w-5 h-5 text-destructive" />
            <span className="font-medium">Open Reports</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.openReportsCount}</p>
        </div>
      </div>
    </div>
  );
}
