import { useState } from "react";
import { useListAdminBookings, useUpdateAdminBooking, useCompleteBooking } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListAdminBookingsQueryKey } from "@workspace/api-client-react";

export default function AdminBookings() {
  const [statusFilter, setStatusFilter] = useState<string>("upcoming");
  const { data: bookings, isLoading } = useListAdminBookings({ status: statusFilter !== "all" ? statusFilter : undefined });
  const updateMutation = useUpdateAdminBooking();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [completingId, setCompletingId] = useState<number | null>(null);
  const [recap, setRecap] = useState("");
  const [homeworkText, setHomeworkText] = useState("");
  const [homeworkFileUrl, setHomeworkFileUrl] = useState("");
  const completeMutation = useCompleteBooking();

  const handleStatusChange = (id: number, newStatus: string) => {
    updateMutation.mutate({ id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        qc.invalidateQueries({ queryKey: getListAdminBookingsQueryKey() });
      }
    });
  };

  const openComplete = (id: number) => {
    setRecap("");
    setHomeworkText("");
    setHomeworkFileUrl("");
    setCompletingId(id);
  };

  const handleComplete = () => {
    if (completingId == null || !recap.trim()) return;
    completeMutation.mutate({
      id: completingId,
      data: {
        notes: recap,
        homeworkAssignedText: homeworkText || undefined,
        homeworkAssignedFileUrl: homeworkFileUrl || undefined,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Lesson completed" });
        qc.invalidateQueries({ queryKey: getListAdminBookingsQueryKey() });
        setCompletingId(null);
      }
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Manage Bookings</h1>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bookings</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : !bookings || bookings.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground">
          No bookings found.
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map(booking => (
            <div key={booking.id} className="bg-card border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition">
              <div>
                <h3 className="font-bold text-foreground text-lg mb-1">{booking.studentName}</h3>
                <p className="text-muted-foreground text-sm mb-2">{booking.studentEmail}</p>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-foreground">{booking.lessonTypeName}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    {format(new Date(booking.startTime), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {booking.status === "upcoming" ? (
                  <Select
                    value={booking.status}
                    onValueChange={(v) => handleStatusChange(booking.id, v)}
                    disabled={updateMutation.isPending}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    booking.status === "completed" ? "bg-secondary/10 text-secondary" : "bg-destructive/10 text-destructive"
                  }`}>
                    {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                  </span>
                )}
                {booking.status === "upcoming" && (
                  <Button variant="outline" onClick={() => openComplete(booking.id)}>
                    Complete Lesson
                  </Button>
                )}
                {booking.status === "upcoming" && booking.meetLink && (
                  <Button asChild variant="secondary">
                    <a href={booking.meetLink} target="_blank" rel="noreferrer">Join</a>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={completingId != null} onOpenChange={(open) => { if (!open) setCompletingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Lesson</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Recap</label>
              <p className="text-xs text-muted-foreground mb-2">A quick summary of what you covered — the student will see this.</p>
              <Textarea value={recap} onChange={e => setRecap(e.target.value)} placeholder="What did you work on today?" className="h-28" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Homework (optional)</label>
              <Textarea value={homeworkText} onChange={e => setHomeworkText(e.target.value)} placeholder="What should they do before next class?" className="h-24" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Homework link (optional)</label>
              <Input value={homeworkFileUrl} onChange={e => setHomeworkFileUrl(e.target.value)} placeholder="Link to a worksheet, doc, etc." />
            </div>
            <Button onClick={handleComplete} disabled={completeMutation.isPending || !recap.trim()} className="w-full">
              {completeMutation.isPending ? "Completing..." : "Complete Lesson"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
