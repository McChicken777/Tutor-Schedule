import { useState } from "react";
import {
  useListAdminTestHomework,
  useCreateTestHomework,
  useUpdateTestHomework,
  useDeleteTestHomework,
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
import AnnotationEditor from "@/components/homework/AnnotationEditor";
import ErrorState from "@/components/ErrorState";
import { FileText, Download, Paperclip, PenLine, Trash2 } from "lucide-react";

type Tab = "assigned" | "pending" | "reviewed";

export default function AdminTestHomework() {
  const [tab, setTab] = useState<Tab>("assigned");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newText, setNewText] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateTestHomework();
  const updateMutation = useUpdateTestHomework();
  const deleteMutation = useDeleteTestHomework();
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
      if (newFile) {
        // Object storage's client can be slow to warm up right after a
        // server restart; one retry absorbs that without bothering the user.
        let uploaded;
        try {
          uploaded = await uploadMutation.mutateAsync({
            file: newFile,
            context: "test-homework-assigned",
            bookingId: created.id,
          });
        } catch {
          uploaded = await uploadMutation.mutateAsync({
            file: newFile,
            context: "test-homework-assigned",
            bookingId: created.id,
          });
        }
        await updateMutation.mutateAsync({
          id: created.id,
          data: {
            assignedFileKey: uploaded.key,
            assignedFileName: uploaded.fileName,
            assignedFileMime: uploaded.mimeType,
          },
        });
      }
      toast({ title: "Test homework created" });
      invalidateAll();
      setIsCreateOpen(false);
      setNewText("");
      setNewFile(null);
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
                <label className="text-sm font-medium mb-1 block">Attachment (optional)</label>
                <Input type="file" onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} />
              </div>
              <Button onClick={handleCreate} disabled={createMutation.isPending || uploadMutation.isPending || (!newText && !newFile)} className="w-full">
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

function TestHomeworkCard({ hw }: { hw: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateTestHomework();
  const deleteMutation = useDeleteTestHomework();
  const uploadMutation = useFileUpload();

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

  const handleAnnotationSave = async (blob: Blob, mimeType: string) => {
    try {
      const file = new File([blob], mimeType === "application/pdf" ? "annotated.pdf" : "annotated.png", { type: mimeType });
      const uploaded = await uploadMutation.mutateAsync({
        file,
        context: "test-homework-review",
        bookingId: hw.id,
      });
      updateMutation.mutate(
        {
          id: hw.id,
          data: {
            tutorFeedback: feedback,
            grade,
            reviewedFileKey: uploaded.key,
            reviewedFileName: uploaded.fileName,
            reviewedFileMime: uploaded.mimeType,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Marked-up file saved" });
            invalidate();
            setAnnotating(false);
          },
        },
      );
    } catch (err) {
      toast({ title: "Failed to save annotation", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const submittedFileMime = hw.submittedFileMime as string | undefined;
  const canAnnotate = !!hw.submittedFileKey && (submittedFileMime === "application/pdf" || submittedFileMime?.startsWith("image/"));

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
          {hw.assignedFileKey && (
            <a
              href={`/api/files/test-homework/${hw.id}/assigned`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center px-4 py-2 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium mb-4"
            >
              <Paperclip className="w-4 h-4 mr-2" /> {hw.assignedFileName || "View file"}
            </a>
          )}

          <h4 className="font-medium text-foreground mb-2 flex items-center gap-2 mt-4">
            <FileText className="w-4 h-4 text-primary" /> Submission
          </h4>
          {hw.submittedText && (
            <div className="bg-accent/50 p-4 rounded-xl text-sm whitespace-pre-wrap mb-4">{hw.submittedText}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {hw.fileUrl && (
              <a href={hw.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-4 py-2 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium">
                <Download className="w-4 h-4 mr-2" /> View Attachment
              </a>
            )}
            {hw.submittedFileKey && (
              <a href={`/api/files/test-homework/${hw.id}/submission`} target="_blank" rel="noreferrer" className="inline-flex items-center px-4 py-2 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium">
                <Paperclip className="w-4 h-4 mr-2" /> {hw.submittedFileName || "View file"}
              </a>
            )}
            {canAnnotate && (
              <Button variant="outline" size="sm" onClick={() => setAnnotating(true)}>
                <PenLine className="w-4 h-4 mr-2" /> Annotate
              </Button>
            )}
          </div>
          {hw.reviewedFileKey && (
            <a href={`/api/files/test-homework/${hw.id}/review`} target="_blank" rel="noreferrer" className="inline-flex items-center text-secondary hover:underline text-sm mt-3">
              <FileText className="w-4 h-4 mr-1" /> View marked-up version
            </a>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Annotate Submission</DialogTitle>
          </DialogHeader>
          {annotating && (
            <AnnotationEditor
              fileUrl={`/api/files/test-homework/${hw.id}/submission`}
              mimeType={submittedFileMime || "application/pdf"}
              onSave={handleAnnotationSave}
              onCancel={() => setAnnotating(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
