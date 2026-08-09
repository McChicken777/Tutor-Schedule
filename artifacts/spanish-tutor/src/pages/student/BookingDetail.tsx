import { useRoute } from "wouter";
import { 
  useGetStudentBooking, 
  useCancelBooking, 
  useSubmitHomework, 
  useSubmitReview 
} from "@workspace/api-client-react";
import { format, differenceInMinutes, isBefore } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetStudentBookingQueryKey,
  getGetStudentDashboardQueryKey,
  getListStudentBookingsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/use-file-upload";
import MultiFilePicker from "@/components/homework/MultiFilePicker";
import ErrorState from "@/components/ErrorState";
import { Video, ArrowLeft, Star, Download, MessageSquare, FileText } from "lucide-react";
import { Link } from "wouter";

export default function BookingDetail() {
  const [, params] = useRoute("/bookings/:id");
  const rawId = parseInt(params?.id || "", 10);
  const id = Number.isFinite(rawId) && rawId > 0 ? rawId : null;
  const { data: booking, isLoading, error, refetch } = useGetStudentBooking(id ?? 0, { query: { enabled: !!id, queryKey: getGetStudentBookingQueryKey(id ?? 0) } });
  const qc = useQueryClient();
  const { toast } = useToast();

  const cancelMutation = useCancelBooking();
  const homeworkMutation = useSubmitHomework();
  const reviewMutation = useSubmitReview();
  const uploadMutation = useFileUpload();

  const [hwText, setHwText] = useState("");
  const [hwUrl, setHwUrl] = useState("");
  const [hwFiles, setHwFiles] = useState<File[]>([]);

  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  if (!id) return <ErrorState error={{ status: 404 }} fullPage />;

  if (error) return <ErrorState error={error} onRetry={refetch} fullPage />;

  if (isLoading || !booking) {
    return (
      <div className="p-6 md:p-10 space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const startTime = new Date(booking.startTime);
  const endTime = new Date(booking.endTime);
  const now = new Date();
  
  let canJoin = false;
  let isEnded = false;
  if (differenceInMinutes(startTime, now) <= 15 && isBefore(now, endTime)) canJoin = true;
  if (isBefore(endTime, now)) isEnded = true;

  const hoursUntilLesson = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const withinNoRefundWindow = hoursUntilLesson < 24;

  const handleCancel = () => {
    cancelMutation.mutate({ id, data: {} }, {
      onSuccess: () => {
        toast({ title: "Booking cancelled" });
        qc.invalidateQueries({ queryKey: getGetStudentBookingQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
        qc.invalidateQueries({ queryKey: getListStudentBookingsQueryKey() });
      }
    });
  };

  const handleHomeworkSubmit = async () => {
    try {
      const uploaded = [];
      for (const file of hwFiles) {
        uploaded.push(
          await uploadMutation.mutateAsync({
            file,
            context: "homework-submission",
            bookingId: id,
          }),
        );
      }

      homeworkMutation.mutate({
        id,
        data: {
          submittedText: hwText,
          submittedLinkUrl: hwUrl,
          files: uploaded.map((u) => ({ key: u.key, name: u.fileName, mime: u.mimeType })),
        },
      }, {
        onSuccess: () => {
          toast({ title: "Homework submitted" });
          qc.invalidateQueries({ queryKey: getGetStudentBookingQueryKey(id) });
        }
      });
    } catch (err) {
      toast({ title: "File upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const handleReviewSubmit = () => {
    reviewMutation.mutate({ id, data: { rating, comment: reviewComment } }, {
      onSuccess: () => {
        toast({ title: "Review submitted" });
        qc.invalidateQueries({ queryKey: getGetStudentBookingQueryKey(id) });
      }
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full max-w-4xl mx-auto w-full">
      <Link href="/bookings" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 font-medium">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to bookings
      </Link>

      <div className="bg-card border border-border rounded-3xl p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div>
            <span className={`inline-block px-3 py-1 rounded-md text-sm font-medium mb-4 ${
              booking.status === 'completed' ? 'bg-secondary/10 text-secondary' :
              booking.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
              'bg-primary/10 text-primary'
            }`}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
            </span>
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2">{booking.lessonTypeName}</h1>
            <p className="text-xl text-muted-foreground">
              {format(startTime, "EEEE, MMMM d, yyyy")}
            </p>
            <p className="text-foreground font-medium mt-1">
              {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")} ({booking.durationMinutes} min)
            </p>
          </div>

          {booking.status === "upcoming" && (
            <div className="flex flex-col gap-3">
              <Button 
                size="lg"
                disabled={!canJoin || isEnded || !booking.meetLink}
                asChild={canJoin && !isEnded && booking.meetLink ? true : false}
              >
                {canJoin && !isEnded && booking.meetLink ? (
                  <a href={booking.meetLink} target="_blank" rel="noreferrer">
                    <Video className="w-5 h-5 mr-2" /> Join Class
                  </a>
                ) : (
                  <>
                    <Video className="w-5 h-5 mr-2" /> {isEnded ? "Ended" : "Join Class"}
                  </>
                )}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="text-destructive hover:bg-destructive/10">Cancel Lesson</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel Lesson?</DialogTitle>
                  </DialogHeader>
                  <p className="text-muted-foreground my-4">
                    Are you sure you want to cancel this lesson? This action cannot be undone.
                    {withinNoRefundWindow && (
                      <span className="block mt-2 font-medium text-destructive">
                        You're cancelling less than 24 hours before your lesson — this lesson will not go back into your balance.
                      </span>
                    )}
                  </p>
                  <div className="flex justify-end gap-3">
                    <Button variant="destructive" onClick={handleCancel} disabled={cancelMutation.isPending}>Yes, cancel</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>

      {booking.notes && (
        <div className="bg-card border border-border rounded-3xl p-8 mb-8">
          <h2 className="text-2xl font-serif font-bold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" /> Class Recap
          </h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Homework Section */}
        <div className="bg-card border border-border rounded-3xl p-8">
          <h2 className="text-2xl font-serif font-bold text-foreground mb-6 flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" /> Homework
          </h2>
          
          {booking.homework?.noHomework ? (
            <p className="text-muted-foreground">No homework was assigned for this lesson.</p>
          ) : (
            <>
              {booking.homework?.assignedText || booking.homework?.assignedLinkUrl || (booking.homework?.assignedFiles?.length ?? 0) > 0 ? (
                <div className="mb-6 pb-6 border-b border-border">
                  <h3 className="font-bold text-foreground mb-2">Assigned by your teacher</h3>
                  {booking.homework?.assignedText && (
                    <p className="bg-primary/5 p-4 rounded-xl text-foreground whitespace-pre-wrap">{booking.homework.assignedText}</p>
                  )}
                  {booking.homework?.assignedLinkUrl && (
                    <a href={booking.homework.assignedLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary mt-2 hover:underline">
                      <Download className="w-4 h-4 mr-1" /> View link
                    </a>
                  )}
                  {booking.homework?.assignedFiles?.map((f) => (
                    <a key={f.id} href={`/api/files/homework-file/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary mt-2 mr-4 hover:underline">
                      <FileText className="w-4 h-4 mr-1" /> {f.name}
                    </a>
                  ))}
                </div>
              ) : null}

              {booking.homework?.submittedAt ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-foreground mb-2">Your Submission</h3>
                    {booking.homework.submittedText && (
                      <p className="bg-accent/50 p-4 rounded-xl text-muted-foreground whitespace-pre-wrap">{booking.homework.submittedText}</p>
                    )}
                    {booking.homework.submittedLinkUrl && (
                      <a href={booking.homework.submittedLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary mt-2 hover:underline">
                        <Download className="w-4 h-4 mr-1" /> View link
                      </a>
                    )}
                    {booking.homework.submissionFiles.map((f) => (
                      <a key={f.id} href={`/api/files/homework-file/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary mt-2 mr-4 hover:underline">
                        <FileText className="w-4 h-4 mr-1" /> {f.name}
                      </a>
                    ))}
                  </div>

                  {booking.homework.tutorFeedback ? (
                    <div>
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-secondary" /> Tutor Feedback
                      </h3>
                      <div className="bg-secondary/5 p-4 rounded-xl border border-secondary/20">
                        <p className="text-foreground whitespace-pre-wrap mb-2">{booking.homework.tutorFeedback}</p>
                        {booking.homework.grade && <p className="font-bold text-secondary mb-2">Grade: {booking.homework.grade}</p>}
                        {booking.homework.reviewFiles.map((f) => (
                          <a key={f.id} href={`/api/files/homework-file/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center text-secondary hover:underline text-sm mr-4">
                            <FileText className="w-4 h-4 mr-1" /> View marked-up version
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Waiting for tutor review.</p>
                  )}
                </div>
              ) : booking.status === "completed" || booking.status === "upcoming" ? (
                <div className="space-y-4">
                  <p className="text-muted-foreground">Submit your homework before the next class or after completion.</p>
                  <Textarea
                    placeholder="Type your homework or notes here..."
                    className="min-h-[120px] bg-background"
                    value={hwText}
                    onChange={e => setHwText(e.target.value)}
                  />
                  <Input
                    placeholder="Link to file (Google Doc, PDF URL, etc.)"
                    value={hwUrl}
                    onChange={e => setHwUrl(e.target.value)}
                  />
                  <MultiFilePicker files={hwFiles} onFilesChange={setHwFiles} allowCamera />
                  <Button
                    onClick={handleHomeworkSubmit}
                    disabled={homeworkMutation.isPending || uploadMutation.isPending || (!hwText && !hwUrl && hwFiles.length === 0)}
                  >
                    {uploadMutation.isPending ? "Uploading..." : homeworkMutation.isPending ? "Submitting..." : "Submit Homework"}
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">No homework.</p>
              )}
            </>
          )}
        </div>

        {/* Review Section */}
        {booking.status === "completed" && (
          <div className="bg-card border border-border rounded-3xl p-8">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-6 flex items-center gap-2">
              <Star className="w-6 h-6 text-[#f59e0b]" /> Review
            </h2>
            
            {booking.review ? (
              <div>
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-5 h-5 ${i < booking.review!.rating ? "text-[#f59e0b] fill-current" : "text-muted"}`} />
                  ))}
                </div>
                {booking.review.comment && (
                  <p className="text-muted-foreground italic">"{booking.review.comment}"</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground">How was your lesson?</p>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} onClick={() => setRating(star)} className="focus:outline-none">
                      <Star className={`w-8 h-8 ${rating >= star ? "text-[#f59e0b] fill-current" : "text-muted"}`} />
                    </button>
                  ))}
                </div>
                <Textarea 
                  placeholder="Leave a comment (optional)..." 
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  className="bg-background"
                />
                <Button onClick={handleReviewSubmit} disabled={reviewMutation.isPending}>Submit Review</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
