import { useGetAdminDashboard } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Users, Calendar, FileText, TrendingUp, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import ErrorState from "@/components/ErrorState";

export default function AdminDashboard() {
  const { data: dashboard, isLoading, error, refetch } = useGetAdminDashboard();

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid md:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={refetch} fullPage />;
  if (!dashboard) return null;

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Admin Dashboard</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <Calendar className="w-5 h-5 text-primary" />
            <span className="font-medium">Upcoming</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.upcomingBookingsCount}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <Users className="w-5 h-5 text-secondary" />
            <span className="font-medium">Students</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.totalStudents}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <FileText className="w-5 h-5 text-[#f59e0b]" />
            <span className="font-medium">Homework</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.pendingHomeworkCount}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <span className="font-medium">This Week</span>
          </div>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.thisWeekBookings}</p>
        </div>
      </div>

      {/* Today's Bookings */}
      <h2 className="text-2xl font-serif font-bold text-foreground mb-6">Today's Classes</h2>
      {dashboard.todayBookings && dashboard.todayBookings.length > 0 ? (
        <div className="space-y-4">
          {dashboard.todayBookings.map(booking => (
            <div key={booking.id} className="bg-card border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    booking.status === 'completed' ? 'bg-secondary/10 text-secondary' :
                    booking.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                    'bg-primary/10 text-primary'
                  }`}>
                    {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                  </span>
                  <h3 className="font-bold text-foreground text-lg">{booking.studentName}</h3>
                </div>
                <p className="text-muted-foreground">
                  {booking.lessonTypeName}
                </p>
                <p className="text-foreground font-medium mt-1">
                  {format(new Date(booking.startTime), "h:mm a")} - {format(new Date(booking.endTime), "h:mm a")}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {booking.status === "upcoming" && booking.meetLink && (
                  <Button asChild>
                    <a href={booking.meetLink} target="_blank" rel="noreferrer">
                      <Video className="w-4 h-4 mr-2" /> Join
                    </a>
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link href="/admin/bookings">Manage</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 bg-accent rounded-3xl text-center text-muted-foreground">
          No classes scheduled for today. Enjoy your day!
        </div>
      )}
    </div>
  );
}
