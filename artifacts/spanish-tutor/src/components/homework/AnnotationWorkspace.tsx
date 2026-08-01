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
  onClose: () => void;
}

export default function AnnotationWorkspace({ hw, onClose }: AnnotationWorkspaceProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const uploadMutation = useFileUpload();
  const attachMutation = useAttachTestHomeworkFile();
  const relinkMutation = useRelinkTestHomeworkFile();

  const [remainingIds, setRemainingIds] = useState<number[]>(() => hw.submissionFiles.map((f) => f.id));
  const [showOriginal, setShowOriginal] = useState(hw.assignedFiles.length > 0);

  const currentFileId = remainingIds[0];
  const currentFile = hw.submissionFiles.find((f) => f.id === currentFileId);
  // Keyed off the full (non-shrinking) submission list so the original-file guess
  // doesn't shift as files are saved-and-removed from the review queue.
  const originalIndex = hw.submissionFiles.findIndex((f) => f.id === currentFileId);

  const resolvedOriginal =
    (currentFile?.linkedFileId != null ? hw.assignedFiles.find((f) => f.id === currentFile.linkedFileId) : undefined) ??
    hw.assignedFiles[originalIndex] ??
    hw.assignedFiles[0];

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminTestHomeworkQueryKey() });

  const handleRelink = (assignedFileId: number) => {
    if (!currentFileId) return;
    relinkMutation.mutate(
      { id: hw.id, fileId: currentFileId, data: { linkedFileId: assignedFileId } },
      {
        onSuccess: () => {
          invalidate();
        },
      },
    );
  };

  const handleAnnotationSave = async (blob: Blob, mimeType: string) => {
    if (!currentFileId) return;
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
          linkedFileId: currentFileId,
        },
      });
      invalidate();
      const remaining = remainingIds.filter((id) => id !== currentFileId);
      setRemainingIds(remaining);
      if (remaining.length === 0) {
        toast({ title: "All submitted files reviewed" });
        onClose();
      } else {
        toast({ title: "Marked-up file saved", description: `${remaining.length} file${remaining.length === 1 ? "" : "s"} left to review.` });
      }
    } catch (err) {
      toast({ title: "Failed to save annotation", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  if (!currentFile) {
    return <div className="text-muted-foreground text-sm p-6 text-center">No submitted files to annotate.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {hw.submissionFiles.length > 1 && (
        <p className="text-sm text-muted-foreground">{remainingIds.length} file{remainingIds.length === 1 ? "" : "s"} left to review.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
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
            key={currentFileId}
            fileUrl={`/api/files/test-homework-file/${currentFile.id}`}
            mimeType={currentFile.mime}
            onSave={handleAnnotationSave}
            onCancel={onClose}
            saveLabel={remainingIds.length > 1 ? "Save this page" : "Save & finish"}
          />
        </div>
      </div>
    </div>
  );
}
