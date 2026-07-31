import { useState } from "react";
import {
  useListStudentHomework,
  useSubmitHomework,
  getListStudentHomeworkQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useFileUpload } from "@/hooks/use-file-upload";
import ErrorState from "@/components/ErrorState";
import { FileText, Download, Paperclip, MessageSquare, Bell } from "lucide-react";

export default function StudentHomework() {
  const { data: homeworkList, isLoading, error, refetch } = useListStudentHomework();

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Homework</h1>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !homeworkList || homeworkList.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground">
          No homework yet.
        </div>
      ) : (
        <div className="space-y-6">
          {homeworkList.map((hw: any) => (
            <HomeworkCard key={hw.id} hw={hw} />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkCard({ hw }: { hw: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const submitMutation = useSubmitHomework();
  const uploadMutation = useFileUpload();

  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const hasAssignment = hw.assignedText || hw.assignedFileUrl || hw.assignedFileKey;
  const isSubmitted = !!hw.submittedAt;
  const isReviewed = !!hw.reviewedAt;

  const status = isReviewed ? "Reviewed" : isSubmitted ? "Submitted" : "Not started";
  const statusClass = isReviewed
    ? "bg-secondary/10 text-secondary"
    : isSubmitted
      ? "bg-primary/10 text-primary"
      : "bg-accent text-muted-foreground";

  const handleSubmit = async () => {
    let uploaded: Awaited<ReturnType<typeof uploadMutation.mutateAsync>> | undefined;
    if (file) {
      try {
        uploaded = await uploadMutation.mutateAsync({
          file,
          context: "homework-submission",
          bookingId: hw.bookingId,
        });
      } catch (err) {
        toast({ title: "File upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        return;
      }
    }

    submitMutation.mutate(
      {
        id: hw.bookingId,
        data: {
          submittedText: text,
          fileUrl: url,
          fileKey: uploaded?.key,
          fileName: uploaded?.fileName,
          fileMime: uploaded?.mimeType,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Homework submitted for review" });
          qc.invalidateQueries({ queryKey: getListStudentHomeworkQueryKey() });
        },
      },
    );
  };

  return (
    <div className={`bg-card border rounded-2xl p-6 ${hw.reminderActive ? "border-amber-500/40" : "border-border"}`}>
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-border gap-4">
        <div>
          <h3 className="font-bold text-foreground text-lg">{hw.lessonTypeName}</h3>
          <p className="text-muted-foreground text-sm">{format(new Date(hw.lessonDate), "MMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          {hw.reminderActive && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
              <Bell className="w-3 h-3" /> Reminder
            </span>
          )}
          <span className={`px-3 py-1 rounded-md text-sm font-medium ${statusClass}`}>{status}</span>
        </div>
      </div>

      {hasAssignment ? (
        <div className="mb-6 pb-6 border-b border-border">
          <h4 className="font-medium text-foreground mb-2">Assigned by your teacher</h4>
          {hw.assignedText && (
            <p className="bg-primary/5 p-4 rounded-xl text-foreground whitespace-pre-wrap mb-2">{hw.assignedText}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {hw.assignedFileUrl && (
              <a href={hw.assignedFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-sm">
                <Download className="w-4 h-4 mr-1" /> Link
              </a>
            )}
            {hw.assignedFileKey && (
              <a href={`/api/files/homework/${hw.id}/assigned`} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4 mr-2" /> {hw.assignedFileName || "View attachment"}
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground mb-6 pb-6 border-b border-border">No homework assigned for this lesson.</p>
      )}

      {isSubmitted ? (
        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-foreground mb-2">Your Submission</h4>
            {hw.submittedText && (
              <p className="bg-accent/50 p-4 rounded-xl text-muted-foreground whitespace-pre-wrap mb-2">{hw.submittedText}</p>
            )}
            <div className="flex flex-wrap gap-3">
              {hw.fileUrl && (
                <a href={hw.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-sm">
                  <Download className="w-4 h-4 mr-1" /> Link
                </a>
              )}
              {hw.submittedFileKey && (
                <a href={`/api/files/homework/${hw.id}/submission`} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-1.5 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium">
                  <Paperclip className="w-4 h-4 mr-2" /> {hw.submittedFileName || "View attachment"}
                </a>
              )}
            </div>
          </div>

          {isReviewed ? (
            <div>
              <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-secondary" /> Tutor Feedback
              </h4>
              <div className="bg-secondary/5 p-4 rounded-xl border border-secondary/20">
                <p className="text-foreground whitespace-pre-wrap mb-2">{hw.tutorFeedback}</p>
                {hw.grade && <p className="font-bold text-secondary mb-2">Grade: {hw.grade}</p>}
                {hw.reviewedFileKey && (
                  <a href={`/api/files/homework/${hw.id}/review`} target="_blank" rel="noreferrer" className="inline-flex items-center text-secondary hover:underline text-sm">
                    <FileText className="w-4 h-4 mr-1" /> View marked-up version
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Waiting for tutor review.</p>
          )}
        </div>
      ) : hasAssignment ? (
        <div className="space-y-4">
          <h4 className="font-medium text-foreground">Complete Homework</h4>
          <Textarea
            placeholder="Type your homework or notes here..."
            className="min-h-[120px] bg-background"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Input
            placeholder="Link to file (Google Doc, PDF URL, etc.)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <label className="flex items-center gap-2 border border-dashed border-border rounded-md px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition">
            <Paperclip className="size-4" />
            {file ? file.name : "Attach PDF or image, up to 15MB"}
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || uploadMutation.isPending || (!text && !url && !file)}
          >
            {uploadMutation.isPending ? "Uploading..." : submitMutation.isPending ? "Sending..." : "Send for Review"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
