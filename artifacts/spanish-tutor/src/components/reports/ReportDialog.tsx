import { useState } from "react";
import { useCreateStudentReport, useCreateTeacherReport } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export type ReportTarget =
  | { type: "message"; id: number }
  | { type: "homework_file"; id: number }
  | { type: "general" };

interface ReportDialogProps {
  role: "student" | "teacher";
  target: ReportTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReportDialog({ role, target, open, onOpenChange }: ReportDialogProps) {
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const studentMutation = useCreateStudentReport();
  const teacherMutation = useCreateTeacherReport();
  const mutation = role === "student" ? studentMutation : teacherMutation;

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    mutation.mutate(
      {
        data: {
          targetType: target.type,
          targetId: target.type === "general" ? null : target.id,
          body: trimmed,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Report submitted", description: "Our team will review it shortly." });
          setBody("");
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: "Couldn't submit report", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>Let us know what's wrong. An admin will review your report.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe the issue..."
          className="min-h-[120px]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || !body.trim()}>
            {mutation.isPending ? "Submitting..." : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
