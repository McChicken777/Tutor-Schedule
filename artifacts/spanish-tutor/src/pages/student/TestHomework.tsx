import { useState } from "react";
import {
  useListStudentTestHomework,
  useSubmitTestHomework,
  getListStudentTestHomeworkQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useFileUpload } from "@/hooks/use-file-upload";
import MultiFilePicker from "@/components/homework/MultiFilePicker";
import ErrorState from "@/components/ErrorState";
import { printFile } from "@/lib/printFile";
import { FileText, MessageSquare, Printer } from "lucide-react";

interface TestHomeworkFile {
  id: number;
  slot: string;
  key: string;
  name: string;
  mime: string;
}

export default function StudentTestHomework() {
  const { data: homeworkList, isLoading, error, refetch } = useListStudentTestHomework();

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Test Homework</h1>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !homeworkList || homeworkList.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground">
          No test homework yet.
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

function FileList({ files }: { files: TestHomeworkFile[] }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {files.map((f) => (
        <div key={f.id} className="inline-flex items-center bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium overflow-hidden">
          <a href={`/api/files/test-homework-file/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center px-3 py-1.5">
            <FileText className="w-4 h-4 mr-2" /> {f.name}
          </a>
          <button
            className="px-2 py-1.5 hover:bg-accent-foreground/10"
            onClick={() => printFile(`/api/files/test-homework-file/${f.id}`)}
            aria-label={`Print ${f.name}`}
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function HomeworkCard({ hw }: { hw: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const submitMutation = useSubmitTestHomework();
  const uploadMutation = useFileUpload();

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const assignedFiles: TestHomeworkFile[] = hw.assignedFiles ?? [];
  const submissionFiles: TestHomeworkFile[] = hw.submissionFiles ?? [];
  const reviewFiles: TestHomeworkFile[] = hw.reviewFiles ?? [];

  const hasAssignment = hw.assignedText || assignedFiles.length > 0;
  const isSubmitted = !!hw.submittedAt;
  const isReviewed = !!hw.reviewedAt;

  const status = isReviewed ? "Reviewed" : isSubmitted ? "Submitted" : "Not started";
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
            context: "test-homework-submission",
            bookingId: hw.id,
          }),
        );
      }

      submitMutation.mutate(
        {
          id: hw.id,
          data: {
            submittedText: text,
            files: uploaded.map((u) => ({ key: u.key, name: u.fileName, mime: u.mimeType })),
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Homework submitted for review" });
            qc.invalidateQueries({ queryKey: getListStudentTestHomeworkQueryKey() });
          },
        },
      );
    } catch (err) {
      toast({ title: "File upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-border gap-4">
        <div>
          <h3 className="font-bold text-foreground text-lg">Test Homework #{hw.id}</h3>
        </div>
        <span className={`px-3 py-1 rounded-md text-sm font-medium ${statusClass}`}>{status}</span>
      </div>

      {hasAssignment ? (
        <div className="mb-6 pb-6 border-b border-border">
          <h4 className="font-medium text-foreground mb-2">Assigned by your teacher</h4>
          {hw.assignedText && (
            <p className="bg-primary/5 p-4 rounded-xl text-foreground whitespace-pre-wrap mb-2">{hw.assignedText}</p>
          )}
          <FileList files={assignedFiles} />
        </div>
      ) : (
        <p className="text-muted-foreground mb-6 pb-6 border-b border-border">No homework assigned yet.</p>
      )}

      {isSubmitted ? (
        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-foreground mb-2">Your Submission</h4>
            {hw.submittedText && (
              <p className="bg-accent/50 p-4 rounded-xl text-muted-foreground whitespace-pre-wrap mb-2">{hw.submittedText}</p>
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
                <FileList files={reviewFiles} />
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
          <MultiFilePicker files={files} onFilesChange={setFiles} allowCamera />
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || uploadMutation.isPending || (!text && files.length === 0)}
          >
            {uploadMutation.isPending ? "Uploading..." : submitMutation.isPending ? "Sending..." : "Send for Review"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
