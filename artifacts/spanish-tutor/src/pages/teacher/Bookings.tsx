import { useState } from "react";
import { useListTeacherBookings, useUpdateTeacherBooking, useCompleteBooking, useAttachHomeworkFile } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListTeacherBookingsQueryKey } from "@workspace/api-client-react";
import { useFileUpload } from "@/hooks/use-file-upload";
import MultiFilePicker from "@/components/homework/MultiFilePicker";

export default function TeacherBookings() {
  const [statusFilter, setStatusFilter] = useState<string>("upcoming");
  const { data: bookings, isLoading, error, refetch } = useListTeacherBookings({ status: statusFilter !== "all" ? statusFilter : undefined });
  const updateMutation = useUpdateTeacherBooking();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [completingId, setCompletingId] = useState<number | null>(null);
  const [recap, setRecap] = useState("");
  const [homeworkText, setHomeworkText] = useState("");
  const [homeworkLinkUrl, setHomeworkLinkUrl] = useState("");
  const [homeworkFiles, setHomeworkFiles] = useState<File[]>([]);
  const completeMutation = useCompleteBooking();
  const uploadMutation = useFileUpload();
  const attachMutation = useAttachHomeworkFile();

  const handleStatusChange = (id: number, newStatus: string) => {
    updateMutation.mutate({ id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        qc.invalidateQueries({ queryKey: getListTeacherBookingsQueryKey() });
      },
      onError: () => toast({ title: "Couldn't update status", variant: "destructive" }),
    });
  };

  const openComplete = (id: number) => {
    setRecap("");
    setHomeworkText("");
    setHomeworkLinkUrl("");
    setHomeworkFiles([]);
    setCompletingId(id);
  };

  const isBusy = completeMutation.isPending || uploadMutation.isPending || attachMutation.isPending;

  const handleComplete = async (noHomework: boolean) => {
    if (completingId == null || !recap.trim()) return;
    const bookingId = completingId;

    let result: Awaited<ReturnType<typeof completeMutation.mutateAsync>>;
    try {
      result = await completeMutation.mutateAsync({
        id: bookingId,
        data: {
          notes: recap,
          homework: {
            noHomework,
            assignedText: noHomework ? undefined : homeworkText || undefined,
            assignedLinkUrl: noHomework ? undefined : homeworkLinkUrl || undefined,
          },
        },
      });
    } catch (err) {
      toast({ title: "Failed to complete lesson", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      return;
    }

    // The lesson is now marked complete regardless of what happens below, so
    // close the dialog and refresh the list either way — otherwise a file
    // failure would leave the dialog open implying the lesson wasn't completed.
    qc.invalidateQueries({ queryKey: getListTeacherBookingsQueryKey() });
    setCompletingId(null);

    if (!noHomework && homeworkFiles.length > 0) {
      try {
        for (const file of homeworkFiles) {
          const uploaded = await uploadMutation.mutateAsync({
            file,
            context: "homework-assigned",
            bookingId,
          });
          await attachMutation.mutateAsync({
            id: result.homeworkId,
            data: { slot: "assigned", key: uploaded.key, name: uploaded.fileName, mime: uploaded.mimeType },
          });
        }
        toast({ title: "Lesson completed" });
      } catch (err) {
        toast({
          title: "Lesson completed, but homework files failed to attach",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
        return;
      }
    } else {
      toast({ title: "Lesson completed" });
    }
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
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
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
              <label className="text-sm font-medium mb-1 block">Homework</label>
              <p className="text-xs text-muted-foreground mb-2">Assign homework below, or mark this lesson as having no homework.</p>
              <Textarea value={homeworkText} onChange={e => setHomeworkText(e.target.value)} placeholder="What should they do before next class?" className="h-24" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Homework link (optional)</label>
              <Input value={homeworkLinkUrl} onChange={e => setHomeworkLinkUrl(e.target.value)} placeholder="Link to a worksheet, doc, etc." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Attach files (optional)</label>
              <MultiFilePicker files={homeworkFiles} onFilesChange={setHomeworkFiles} />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleComplete(true)}
                disabled={isBusy || !recap.trim()}
                className="flex-1"
              >
                No Homework & Complete
              </Button>
              <Button
                onClick={() => handleComplete(false)}
                disabled={isBusy || !recap.trim() || (!homeworkText.trim() && !homeworkLinkUrl.trim() && homeworkFiles.length === 0)}
                className="flex-1"
              >
                {isBusy ? "Completing..." : "Assign Homework & Complete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
