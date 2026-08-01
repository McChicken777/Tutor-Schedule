import { useState } from "react";
import {
  useListAdminTestHomework,
  useCreateTestHomework,
  useUpdateTestHomework,
  useDeleteTestHomework,
  useAttachTestHomeworkFile,
  useDeleteTestHomeworkFile,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListAdminTestHomeworkQueryKey } from "@workspace/api-client-react";
import { useFileUpload } from "@/hooks/use-file-upload";
import MultiFilePicker from "@/components/homework/MultiFilePicker";
import AnnotationWorkspace from "@/components/homework/AnnotationWorkspace";
import ErrorState from "@/components/ErrorState";
import { printFile } from "@/lib/printFile";
import { FileText, Paperclip, PenLine, Trash2, Printer, X } from "lucide-react";

type Tab = "assigned" | "pending" | "reviewed";

interface TestHomeworkFile {
  id: number;
  slot: string;
  key: string;
  name: string;
  mime: string;
  linkedFileId: number | null;
}

export default function AdminTestHomework() {
  const [tab, setTab] = useState<Tab>("assigned");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newText, setNewText] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const qc = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateTestHomework();
  const deleteMutation = useDeleteTestHomework();
  const attachMutation = useAttachTestHomeworkFile();
  const uploadMutation = useFileUpload();

  const params =
    tab === "assigned" ? { submitted: false } : tab === "pending" ? { submitted: true, reviewed: false } : { reviewed: true };
  const { data: homeworkList, isLoading, error, refetch } = useListAdminTestHomework(params);

  const invalidateAll = () => qc.invalidateQueries({ queryKey: getListAdminTestHomeworkQueryKey() });

  const handleCreate = async () => {
    let createdId: number | undefined;
    try {
      const created = await createMutation.mutateAsync({ data: { assignedText: newText } });
      createdId = created.id;
      for (const file of newFiles) {
        const uploaded = await uploadMutation.mutateAsync({
          file,
          context: "test-homework-assigned",
          bookingId: created.id,
        });
        await attachMutation.mutateAsync({
          id: created.id,
          data: { slot: "assigned", key: uploaded.key, name: uploaded.fileName, mime: uploaded.mimeType },
        });
      }
      toast({ title: "Test homework created" });
      invalidateAll();
      setIsCreateOpen(false);
      setNewText("");
      setNewFiles([]);
    } catch (err) {
      if (createdId != null) {
        await deleteMutation.mutateAsync({ id: createdId }).catch(() => {});
        invalidateAll();
      }
      toast({ title: "Failed to create", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Test Homework</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Button onClick={() => setIsCreateOpen(true)}>Create Test Homework</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Test Homework</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Assignment text</label>
                <Textarea value={newText} onChange={(e) => setNewText(e.target.value)} className="h-32" placeholder="What should the student do?" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Attachments (optional)</label>
                <MultiFilePicker files={newFiles} onFilesChange={setNewFiles} />
              </div>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || uploadMutation.isPending || attachMutation.isPending || (!newText && newFiles.length === 0)}
                className="w-full"
              >
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="assigned">Assigned</TabsTrigger>
          <TabsTrigger value="pending">Needs Review</TabsTrigger>
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
              No test homework in this tab.
            </div>
          ) : (
            <div className="space-y-6">
              {homeworkList.map((hw) => (
                <TestHomeworkCard key={hw.id} hw={hw} />
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
  files: TestHomeworkFile[];
  onDelete?: (fileId: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {files.map((f) => (
        <div key={f.id} className="inline-flex items-center bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium overflow-hidden">
          <a href={`/api/files/test-homework-file/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center px-3 py-2">
            <Paperclip className="w-4 h-4 mr-2" /> {f.name}
          </a>
          <button
            className="px-2 py-2 hover:bg-accent-foreground/10"
            onClick={() => printFile(`/api/files/test-homework-file/${f.id}`)}
            aria-label={`Print ${f.name}`}
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
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

function TestHomeworkCard({ hw }: { hw: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateTestHomework();
  const deleteMutation = useDeleteTestHomework();
  const deleteFileMutation = useDeleteTestHomeworkFile();

  const [feedback, setFeedback] = useState(hw.tutorFeedback || "");
  const [grade, setGrade] = useState(hw.grade || "");
  const [annotating, setAnnotating] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminTestHomeworkQueryKey() });

  const handleSave = () => {
    updateMutation.mutate(
      { id: hw.id, data: { tutorFeedback: feedback, grade } },
      {
        onSuccess: () => {
          toast({ title: "Feedback saved" });
          invalidate();
        },
      },
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { id: hw.id },
      {
        onSuccess: () => {
          toast({ title: "Test homework deleted" });
          invalidate();
        },
      },
    );
  };

  const handleDeleteFile = (fileId: number) => {
    deleteFileMutation.mutate(
      { id: hw.id, fileId },
      {
        onSuccess: () => {
          invalidate();
        },
      },
    );
  };

  const assignedFiles: TestHomeworkFile[] = hw.assignedFiles ?? [];
  const submissionFiles: TestHomeworkFile[] = hw.submissionFiles ?? [];
  const reviewFiles: TestHomeworkFile[] = hw.reviewFiles ?? [];
  const canAnnotate = submissionFiles.some((f) => f.mime === "application/pdf" || f.mime.startsWith("image/"));

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-border">
        <div>
          <h3 className="font-bold text-foreground text-lg">Test Homework #{hw.id}</h3>
          <p className="text-muted-foreground">created {format(new Date(hw.createdAt), "MMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm text-muted-foreground">
            {hw.submittedAt ? `Submitted ${format(new Date(hw.submittedAt), "MMM d")}` : "Not submitted"}
          </div>
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={deleteMutation.isPending}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
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
          <FileList files={assignedFiles} onDelete={handleDeleteFile} />

          <h4 className="font-medium text-foreground mb-2 flex items-center gap-2 mt-4">
            <FileText className="w-4 h-4 text-primary" /> Submission
          </h4>
          {hw.submittedText && (
            <div className="bg-accent/50 p-4 rounded-xl text-sm whitespace-pre-wrap mb-4">{hw.submittedText}</div>
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
