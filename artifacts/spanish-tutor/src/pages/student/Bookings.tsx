import { useState } from "react";
import { Link } from "wouter";
import { format, differenceInMinutes, isBefore } from "date-fns";
import { useListStudentBookings } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar, Video, FileText, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";

export default function StudentBookings() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const { data: bookings, isLoading, error, refetch } = useListStudentBookings({ status: tab });

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">My Lessons</h1>
        <Button asChild>
          <Link href="/book">Book New</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !bookings || bookings.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-3xl">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-foreground mb-2">No {tab} lessons found.</p>
              {tab === "upcoming" && (
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/book">Book your first lesson</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => {
                const startTime = new Date(booking.startTime);
                const endTime = new Date(booking.endTime);
                const now = new Date();
                
                let canJoin = false;
                let isEnded = false;
                if (differenceInMinutes(startTime, now) <= 15 && isBefore(now, endTime)) {
                  canJoin = true;
                }
                if (isBefore(endTime, now)) {
                  isEnded = true;
                }

                return (
                  <div key={booking.id} className="bg-card border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${
                          booking.status === 'completed' ? 'bg-secondary/10 text-secondary' :
                          booking.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </span>
                        <h3 className="font-bold text-foreground text-lg">{booking.lessonTypeName}</h3>
                      </div>
                      <p className="text-muted-foreground">
                        {format(startTime, "EEEE, MMMM d, yyyy")}
                      </p>
                      <p className="text-foreground font-medium mt-1">
                        {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {tab === "upcoming" && booking.status === "upcoming" && (
                        <Button 
                          variant={canJoin ? "default" : "outline"} 
                          disabled={!canJoin || isEnded || !booking.meetLink}
                          asChild={canJoin && !isEnded && booking.meetLink ? true : false}
                        >
                          {canJoin && !isEnded && booking.meetLink ? (
                            <a href={booking.meetLink} target="_blank" rel="noreferrer">
                              <Video className="w-4 h-4 mr-2" />
                              Join
                            </a>
                          ) : (
                            <>
                              <Video className="w-4 h-4 mr-2" />
                              {isEnded ? "Class Ended" : "Join Class"}
                            </>
                          )}
                        </Button>
                      )}
                      
                      <Button variant="outline" asChild>
                        <Link href={`/bookings/${booking.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
