import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAttachTestHomeworkFile,
  useRelinkTestHomeworkFile,
  getListAdminTestHomeworkQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/use-file-upload";
import AnnotationEditor from "./AnnotationEditor";
import FileViewer from "./FileViewer";
import { Eye, EyeOff } from "lucide-react";

interface TestHomeworkFile {
  id: number;
  slot: string;
  key: string;
  name: string;
  mime: string;
  linkedFileId: number | null;
}

interface AnnotationWorkspaceProps {
  hw: {
    id: number;
    assignedFiles: TestHomeworkFile[];
    submissionFiles: TestHomeworkFile[];
  };
  initialSubmissionFileId?: number;
  onClose: () => void;
}

export default function AnnotationWorkspace({ hw, initialSubmissionFileId, onClose }: AnnotationWorkspaceProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const uploadMutation = useFileUpload();
  const attachMutation = useAttachTestHomeworkFile();
  const relinkMutation = useRelinkTestHomeworkFile();

  const [selectedSubmissionFileId, setSelectedSubmissionFileId] = useState<number | undefined>(
    initialSubmissionFileId ?? hw.submissionFiles[0]?.id,
  );
  const [showOriginal, setShowOriginal] = useState(hw.assignedFiles.length > 0);

  const selectedIndex = hw.submissionFiles.findIndex((f) => f.id === selectedSubmissionFileId);
  const selectedFile = hw.submissionFiles[selectedIndex];

  const resolvedOriginal =
    (selectedFile?.linkedFileId != null ? hw.assignedFiles.find((f) => f.id === selectedFile.linkedFileId) : undefined) ??
    hw.assignedFiles[selectedIndex] ??
    hw.assignedFiles[0];

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminTestHomeworkQueryKey() });

  const handleRelink = (assignedFileId: number) => {
    if (!selectedSubmissionFileId) return;
    relinkMutation.mutate(
      { id: hw.id, fileId: selectedSubmissionFileId, data: { linkedFileId: assignedFileId } },
      {
        onSuccess: () => {
          invalidate();
        },
      },
    );
  };

  const handleAnnotationSave = async (blob: Blob, mimeType: string) => {
    if (!selectedSubmissionFileId) return;
    try {
      const file = new File([blob], mimeType === "application/pdf" ? "annotated.pdf" : "annotated.png", { type: mimeType });
      const uploaded = await uploadMutation.mutateAsync({
        file,
        context: "test-homework-review",
        bookingId: hw.id,
      });
      await attachMutation.mutateAsync({
        id: hw.id,
        data: {
          slot: "review",
          key: uploaded.key,
          name: uploaded.fileName,
          mime: uploaded.mimeType,
          linkedFileId: selectedSubmissionFileId,
        },
      });
      toast({ title: "Marked-up file saved" });
      invalidate();
      onClose();
    } catch (err) {
      toast({ title: "Failed to save annotation", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  if (!selectedFile) {
    return <div className="text-muted-foreground text-sm p-6 text-center">No submitted files to annotate.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hw.submissionFiles.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Submitted file:</span>
            {hw.submissionFiles.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setSelectedSubmissionFileId(f.id)}
                className={`px-3 py-1 rounded-md text-sm font-medium border transition ${
                  f.id === selectedSubmissionFileId ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
                }`}
              >
                {i + 1}. {f.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 ml-auto">
          {hw.assignedFiles.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
              {showOriginal ? "Hide original" : "Show original"}
            </Button>
          )}
          {showOriginal && hw.assignedFiles.length > 1 && (
            <select
              className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
              value={resolvedOriginal?.id ?? ""}
              onChange={(e) => handleRelink(Number(e.target.value))}
            >
              {hw.assignedFiles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className={showOriginal && resolvedOriginal ? "grid md:grid-cols-2 gap-4" : ""}>
        {showOriginal && resolvedOriginal && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Original assigned file</p>
            <FileViewer fileUrl={`/api/files/test-homework-file/${resolvedOriginal.id}`} mimeType={resolvedOriginal.mime} />
          </div>
        )}
        <div>
          {showOriginal && resolvedOriginal && <p className="text-xs font-medium text-muted-foreground mb-1.5">Student submission</p>}
          <AnnotationEditor
            key={selectedSubmissionFileId}
            fileUrl={`/api/files/test-homework-file/${selectedFile.id}`}
            mimeType={selectedFile.mime}
            onSave={handleAnnotationSave}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
