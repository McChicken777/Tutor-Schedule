import { useState } from "react";
import { useSubmitComplaint } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle } from "lucide-react";

export default function TeacherFeedback() {
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const submitMutation = useSubmitComplaint();

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    submitMutation.mutate(
      { data: { body: trimmed } },
      {
        onSuccess: () => {
          toast({ title: "Feedback sent" });
          setBody("");
        },
      },
    );
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-2 flex items-center gap-3">
        <MessageCircle className="w-7 h-7 text-primary" /> Feedback
      </h1>
      <p className="text-muted-foreground mb-8">
        Send a complaint or suggestion to the platform admin. They'll see it in their inbox.
      </p>

      <div className="bg-card border border-border rounded-3xl p-6 md:p-8">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's on your mind?"
          className="h-40 mb-4"
        />
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitMutation.isPending || !body.trim()}>
            {submitMutation.isPending ? "Sending…" : "Send Feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
}
