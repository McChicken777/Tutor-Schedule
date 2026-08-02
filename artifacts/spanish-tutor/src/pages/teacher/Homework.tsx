import { useState } from "react";
import { useListTeacherHomework, useUpdateHomework, useDeleteHomeworkFile } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListTeacherHomeworkQueryKey } from "@workspace/api-client-react";
import AnnotationWorkspace from "@/components/homework/AnnotationWorkspace";
import ErrorState from "@/components/ErrorState";
import PingDot from "@/components/ui/ping-dot";
import ReportButton from "@/components/reports/ReportButton";
import { printFile } from "@/lib/printFile";
import { truncateFileName } from "@/lib/truncateFileName";
import { FileText, Download, Paperclip, PenLine, Printer, X } from "lucide-react";

interface HomeworkFileItem {
  id: number;
  slot: string;
  key: string;
  name: string;
  mime: string;
  linkedFileId: number | null;
  originalFileId: number | null;
}

export default function TeacherHomework() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const { data: homeworkList, isLoading, error, refetch } = useListTeacherHomework({ reviewed: tab === "reviewed" });
  const { data: needsReviewList } = useListTeacherHomework({ reviewed: false });
  const hasNeedsReview = (needsReviewList?.length ?? 0) > 0;

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex items-start justify-between gap-4 mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Homework Inbox</h1>
        <ReportButton role="teacher" target={{ type: "general" }} variant="header" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="pending" className="flex items-center gap-1.5">
            Needs Review {hasNeedsReview && <PingDot />}
          </TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !homeworkList || homeworkList.length === 0 ? (
            <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground">
              No {tab} homework found.
            </div>
          ) : (
            <div className="space-y-6">
              {homeworkList.map(hw => (
                <HomeworkCard key={hw.id} hw={hw} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FileList({
  files,
  onDelete,
}: {
  files: HomeworkFileItem[];
  onDelete?: (fileId: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {files.map((f) => (
        <div key={f.id} className="inline-flex items-center bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium overflow-hidden">
          <a href={`/api/files/homework-file/${f.id}`} target="_blank" rel="noreferrer" title={f.name} className="flex items-center px-3 py-2">
            <Paperclip className="w-4 h-4 mr-2" /> {truncateFileName(f.name)}
          </a>
          <button
            className="px-2 py-2 hover:bg-accent-foreground/10"
            onClick={() => printFile(`/api/files/homework-file/${f.id}`)}
            aria-label={`Print ${f.name}`}
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
          <ReportButton role="teacher" target={{ type: "homework_file", id: f.id }} className="px-2 py-2 rounded-none" />
          {onDelete && (
            <button className="px-2 py-2 hover:bg-destructive/10" onClick={() => onDelete(f.id)} aria-label={`Remove ${f.name}`}>
              <X className="w-3.5 h-3.5 text-destructive" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function HomeworkCard({ hw }: { hw: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateHomework();
  const deleteFileMutation = useDeleteHomeworkFile();

  const [feedback, setFeedback] = useState(hw.tutorFeedback || "");
  const [grade, setGrade] = useState(hw.grade || "");
  const [annotating, setAnnotating] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTeacherHomeworkQueryKey() });

  const handleSave = () => {
    updateMutation.mutate({ id: hw.id, data: { tutorFeedback: feedback, grade } }, {
      onSuccess: () => {
        toast({ title: "Feedback saved" });
        invalidate();
      }
    });
  };

  const handleDeleteFile = (fileId: number) => {
    deleteFileMutation.mutate({ id: hw.id, fileId }, {
      onSuccess: () => invalidate(),
    });
  };

  const assignedFiles: HomeworkFileItem[] = hw.assignedFiles ?? [];
  const submissionFiles: HomeworkFileItem[] = hw.submissionFiles ?? [];
  const reviewFiles: HomeworkFileItem[] = hw.reviewFiles ?? [];
  const canAnnotate = submissionFiles.some((f) => f.mime === "application/pdf" || f.mime.startsWith("image/"));

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-border">
        <div>
          <h3 className="font-bold text-foreground text-lg">{hw.studentName}</h3>
          <p className="text-muted-foreground">{hw.lessonTypeName} on {format(new Date(hw.lessonDate), "MMM d, yyyy")}</p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          Submitted {hw.submittedAt ? format(new Date(hw.submittedAt), "MMM d") : "Unknown"}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Assignment
          </h4>
          {hw.assignedText && (
            <div className="bg-accent/50 p-4 rounded-xl text-sm whitespace-pre-wrap mb-4">{hw.assignedText}</div>
          )}
          {hw.assignedLinkUrl && (
            <a href={hw.assignedLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-sm mb-4">
              <Download className="w-4 h-4 mr-1" /> Link
            </a>
          )}
          <FileList files={assignedFiles} />

          <h4 className="font-medium text-foreground mb-2 flex items-center gap-2 mt-4">
            <FileText className="w-4 h-4 text-primary" /> Submission
          </h4>
          {hw.submittedText && (
            <div className="bg-accent/50 p-4 rounded-xl text-sm whitespace-pre-wrap mb-4">{hw.submittedText}</div>
          )}
          {hw.submittedLinkUrl && (
            <a href={hw.submittedLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-sm mb-4">
              <Download className="w-4 h-4 mr-1" /> Link
            </a>
          )}
          <FileList files={submissionFiles} />
          {canAnnotate && (
            <Button variant="outline" size="sm" onClick={() => setAnnotating(true)} className="mb-4">
              <PenLine className="w-4 h-4 mr-2" /> Annotate
            </Button>
          )}

          {reviewFiles.length > 0 && (
            <>
              <h4 className="font-medium text-foreground mb-2 mt-2">Marked-up version</h4>
              <FileList files={reviewFiles} onDelete={handleDeleteFile} />
            </>
          )}
        </div>

        <div className="space-y-4">
          <h4 className="font-medium text-foreground mb-2">Your Feedback</h4>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Write your feedback here..."
            className="h-32"
          />
          <div className="flex gap-4">
            <div className="flex-1">
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade (e.g. A, 90%, Great)" />
            </div>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {hw.reviewedAt ? "Update" : "Submit Review"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={annotating} onOpenChange={setAnnotating}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Annotate Submission</DialogTitle>
          </DialogHeader>
          {annotating && <AnnotationWorkspace hw={hw} onClose={() => setAnnotating(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
