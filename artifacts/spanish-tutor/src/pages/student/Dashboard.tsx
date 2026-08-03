import { useGetStudentDashboard, useListLessonTypes } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, isBefore, addMinutes, differenceInMinutes } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, ArrowRight, Video, Clock, Gift, Bell } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";

export default function StudentDashboard() {
  const { data: dashboard, isLoading, error, refetch } = useGetStudentDashboard();
  const { data: lessonTypes } = useListLessonTypes();

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={refetch} fullPage />;
  if (!dashboard) return null;

  const nextBooking = dashboard.nextBooking;
  const dueHomework = dashboard.recentHomework?.filter((hw: any) => hw.reminderActive) ?? [];

  const trialLessonType = lessonTypes?.find((lt) => lt.isTrial);
  const hasUnusedTrial = dashboard.trialAvailable && !!trialLessonType;
  
  // Logic for Join Class button
  let canJoin = false;
  let isEnded = false;
  if (nextBooking) {
    const startTime = new Date(nextBooking.startTime);
    const endTime = new Date(nextBooking.endTime);
    const now = new Date();
    // active 15 min before
    if (differenceInMinutes(startTime, now) <= 15 && isBefore(now, endTime)) {
      canJoin = true;
    }
    if (isBefore(endTime, now)) {
      isEnded = true;
    }
  }

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Welcome back</h1>

      {dueHomework.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-700 dark:text-amber-400 flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-foreground">You have homework due</p>
              <p className="text-sm text-muted-foreground">
                {dueHomework.length === 1
                  ? `${dueHomework[0].lessonTypeName}, assigned ${format(new Date(dueHomework[0].lessonDate), "MMM d")}`
                  : `${dueHomework.length} lessons are waiting on your homework`}
                {" "}— complete it now to stay on track.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/homework">Complete it now</Link>
          </Button>
        </div>
      )}

      {hasUnusedTrial && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-primary/10 border border-primary/20 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-foreground">You have a free first lesson waiting</p>
              <p className="text-sm text-muted-foreground">
                {trialLessonType!.durationMinutes} minutes, on us — no credits needed.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/book">Book it now</Link>
          </Button>
        </div>
      )}

      {/* Hero / Next Class */}
      {nextBooking ? (
        <div className="bg-primary text-primary-foreground rounded-3xl p-8 mb-8">
          <h2 className="text-xl font-medium mb-2 opacity-90">Next Class</h2>
          <div className="text-3xl md:text-5xl font-bold mb-4">
            {format(new Date(nextBooking.startTime), "EEEE, MMMM d")}
            <span className="block text-2xl md:text-3xl mt-2 opacity-90">
              {format(new Date(nextBooking.startTime), "h:mm a")} - {format(new Date(nextBooking.endTime), "h:mm a")}
            </span>
          </div>
          <p className="text-lg opacity-90 mb-8 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {nextBooking.lessonTypeName}
          </p>

          <div className="flex flex-wrap gap-4">
            <Button
              variant={canJoin ? "secondary" : "outline"}
              size="lg"
              className={!canJoin ? "bg-white/20 text-white border-white/30 hover:bg-white/30" : ""}
              disabled={!canJoin || isEnded || !nextBooking.meetLink}
              asChild={canJoin && !isEnded && nextBooking.meetLink ? true : false}
            >
              {canJoin && !isEnded && nextBooking.meetLink ? (
                <a href={nextBooking.meetLink} target="_blank" rel="noreferrer">
                  <Video className="w-5 h-5 mr-2" />
                  Join Class
                </a>
              ) : (
                <>
                  <Video className="w-5 h-5 mr-2" />
                  {isEnded ? "Class Ended" : "Join Class"}
                </>
              )}
            </Button>
            <Button variant="outline" size="lg" className="bg-transparent border-white/30 text-white hover:bg-white/10" asChild>
              <Link href={`/bookings/${nextBooking.id}`}>View Details</Link>
            </Button>
          </div>
          {!canJoin && !isEnded && (
            <p className="text-sm opacity-80 mt-3">
              Join link will be active 15 minutes before class starts.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-3xl p-8 mb-8 text-center">
          <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">No upcoming classes</h2>
          <p className="text-muted-foreground mb-6">You don't have any lessons scheduled yet.</p>
          <Button asChild size="lg">
            <Link href="/book">Book a Lesson</Link>
          </Button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-10">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Credits Remaining</h3>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.totalRemainingCredits}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending Homework</h3>
          <p className="text-4xl font-serif font-bold text-foreground">{dashboard.pendingHomeworkCount}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-center items-start">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Packages</h3>
          <Link href="/book" className="text-primary font-medium hover:underline flex items-center gap-1">
            Buy more credits <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Recent Homework */}
      {dashboard.recentHomework && dashboard.recentHomework.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-serif font-bold text-foreground">Recent Homework</h2>
            <Link href="/homework" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {dashboard.recentHomework.slice(0, 3).map((hw: any) => (
              <div key={hw.id} className={`bg-card border rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${hw.reminderActive ? "border-amber-500/40" : "border-border"}`}>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-accent rounded-xl text-primary">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">{hw.lessonTypeName}</h4>
                    <p className="text-sm text-muted-foreground">{format(new Date(hw.lessonDate), "MMMM d, yyyy")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {hw.reminderActive && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                      <Bell className="w-3 h-3" /> Reminder
                    </span>
                  )}
                  {hw.reviewedAt ? (
                    <span className="text-sm font-medium px-3 py-1 rounded-md bg-secondary/10 text-secondary">Reviewed</span>
                  ) : (
                    <span className="text-sm font-medium px-3 py-1 rounded-md bg-accent text-muted-foreground">Pending Review</span>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/bookings/${hw.bookingId}`}>View</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
