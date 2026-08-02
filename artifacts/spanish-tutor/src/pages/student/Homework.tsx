import { useEffect, useState } from "react";
import {
  useListStudentHomework,
  useSubmitHomework,
  useMarkHomeworkReviewSeen,
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
import MultiFilePicker from "@/components/homework/MultiFilePicker";
import FileViewer from "@/components/homework/FileViewer";
import ErrorState from "@/components/ErrorState";
import PingDot from "@/components/ui/ping-dot";
import ReportButton from "@/components/reports/ReportButton";
import { printFile } from "@/lib/printFile";
import { truncateFileName } from "@/lib/truncateFileName";
import { FileText, Download, MessageSquare, Bell, Printer, ChevronDown, ChevronUp } from "lucide-react";

interface HomeworkFileItem {
  id: number;
  slot: string;
  key: string;
  name: string;
  mime: string;
  originalFileId: number | null;
}

export default function StudentHomework() {
  const { data: homeworkList, isLoading, error, refetch } = useListStudentHomework();

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex items-start justify-between gap-4 mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Homework</h1>
        <ReportButton role="student" target={{ type: "general" }} variant="header" />
      </div>

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

function FileList({ files }: { files: HomeworkFileItem[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {files.map((f) => (
        <div key={f.id} className="inline-flex items-center bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium overflow-hidden">
          <a href={`/api/files/homework-file/${f.id}`} target="_blank" rel="noreferrer" title={f.name} className="flex items-center px-3 py-1.5">
            <FileText className="w-4 h-4 mr-2" /> {truncateFileName(f.name)}
          </a>
          <button
            className="px-2 py-1.5 hover:bg-accent-foreground/10"
            onClick={() => printFile(`/api/files/homework-file/${f.id}`)}
            aria-label={`Print ${f.name}`}
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          <ReportButton role="student" target={{ type: "homework_file", id: f.id }} className="px-2 py-1.5 rounded-none" />
        </div>
      ))}
    </div>
  );
}

function ReviewFileGroup({ reviewFiles, assignedFiles }: { reviewFiles: HomeworkFileItem[]; assignedFiles: HomeworkFileItem[] }) {
  const [expanded, setExpanded] = useState(false);
  if (reviewFiles.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-secondary hover:underline"
      >
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {expanded ? "Hide" : "Show"} marked-up file{reviewFiles.length === 1 ? "" : "s"} ({reviewFiles.length})
      </button>
      {expanded && (
        <div className="space-y-4 mt-3">
          {reviewFiles.map((f) => {
            const original = f.originalFileId != null ? assignedFiles.find((a) => a.id === f.originalFileId) : undefined;
            return (
              <div key={f.id}>
                <div className={original ? "grid md:grid-cols-2 gap-4" : ""}>
                  {original && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Original assignment</p>
                      <FileViewer fileUrl={`/api/files/homework-file/${original.id}`} mimeType={original.mime} />
                    </div>
                  )}
                  <div>
                    {original && <p className="text-xs font-medium text-muted-foreground mb-1.5">Tutor's marked-up version</p>}
                    <FileViewer fileUrl={`/api/files/homework-file/${f.id}`} mimeType={f.mime} />
                  </div>
                </div>
                <FileList files={[f]} />
              </div>
            );
          })}
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
  const seenMutation = useMarkHomeworkReviewSeen();

  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const assignedFiles: HomeworkFileItem[] = hw.assignedFiles ?? [];
  const submissionFiles: HomeworkFileItem[] = hw.submissionFiles ?? [];
  const reviewFiles: HomeworkFileItem[] = hw.reviewFiles ?? [];

  const hasAssignment = hw.assignedText || hw.assignedLinkUrl || assignedFiles.length > 0;
  const isSubmitted = !!hw.submittedAt;
  const isReviewed = !!hw.reviewedAt;
  const needsReviewSeen =
    isReviewed && (!hw.studentReviewSeenAt || new Date(hw.studentReviewSeenAt).getTime() < new Date(hw.reviewedAt).getTime());
  const needsSubmission = !hw.noHomework && hasAssignment && !isSubmitted;

  useEffect(() => {
    if (!needsReviewSeen || seenMutation.isPending) return;
    seenMutation.mutate(
      { id: hw.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListStudentHomeworkQueryKey() });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsReviewSeen, hw.id]);

  const status = hw.noHomework ? "No homework" : isReviewed ? "Reviewed" : isSubmitted ? "Submitted" : "Not started";
  const statusClass = isReviewed
    ? "bg-secondary/10 text-secondary"
    : isSubmitted
      ? "bg-primary/10 text-primary"
      : "bg-accent text-muted-foreground";

  const handleSubmit = async () => {
    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(
          await uploadMutation.mutateAsync({
            file,
            context: "homework-submission",
            bookingId: hw.bookingId,
          }),
        );
      }

      submitMutation.mutate(
        {
          id: hw.bookingId,
          data: {
            submittedText: text,
            submittedLinkUrl: url,
            files: uploaded.map((u) => ({ key: u.key, name: u.fileName, mime: u.mimeType })),
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Homework submitted for review" });
            qc.invalidateQueries({ queryKey: getListStudentHomeworkQueryKey() });
          },
        },
      );
    } catch (err) {
      toast({ title: "File upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className={`bg-card border rounded-2xl p-6 ${hw.reminderActive ? "border-amber-500/40" : "border-border"}`}>
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-border gap-4">
        <div>
          <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
            {hw.lessonTypeName}
            {(needsReviewSeen || needsSubmission) && <PingDot />}
          </h3>
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

      {hw.noHomework ? (
        <p className="text-muted-foreground">No homework was assigned for this lesson.</p>
      ) : (
        <>
          {hasAssignment ? (
            <div className="mb-6 pb-6 border-b border-border">
              <h4 className="font-medium text-foreground mb-2">Assigned by your teacher</h4>
              {hw.assignedText && (
                <p className="bg-primary/5 p-4 rounded-xl text-foreground whitespace-pre-wrap mb-2">{hw.assignedText}</p>
              )}
              {hw.assignedLinkUrl && (
                <a href={hw.assignedLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-sm mb-2">
                  <Download className="w-4 h-4 mr-1" /> Link
                </a>
              )}
              <FileList files={assignedFiles} />
            </div>
          ) : (
            <p className="text-muted-foreground mb-6 pb-6 border-b border-border">No homework assigned for this lesson yet.</p>
          )}

          {isSubmitted ? (
            <div className="space-y-6">
              <div>
                <h4 className="font-medium text-foreground mb-2">Your Submission</h4>
                {hw.submittedText && (
                  <p className="bg-accent/50 p-4 rounded-xl text-muted-foreground whitespace-pre-wrap mb-2">{hw.submittedText}</p>
                )}
                {hw.submittedLinkUrl && (
                  <a href={hw.submittedLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-sm mb-2">
                    <Download className="w-4 h-4 mr-1" /> Link
                  </a>
                )}
                <FileList files={submissionFiles} />
              </div>

              {isReviewed ? (
                <div>
                  <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-secondary" /> Tutor Feedback
                  </h4>
                  <div className="bg-secondary/5 p-4 rounded-xl border border-secondary/20 space-y-2">
                    <p className="text-foreground whitespace-pre-wrap">{hw.tutorFeedback}</p>
                    {hw.grade && <p className="font-bold text-secondary">Grade: {hw.grade}</p>}
                    <ReviewFileGroup reviewFiles={reviewFiles} assignedFiles={assignedFiles} />
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
              <MultiFilePicker files={files} onFilesChange={setFiles} allowCamera />
              <Button
                onClick={handleSubmit}
                className="min-h-11"
                disabled={submitMutation.isPending || uploadMutation.isPending || (!text && !url && files.length === 0)}
              >
                {uploadMutation.isPending ? "Uploading..." : submitMutation.isPending ? "Sending..." : "Send for Review"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
