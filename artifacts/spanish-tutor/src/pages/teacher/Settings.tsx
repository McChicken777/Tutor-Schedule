import { useState } from "react";
import {
  useGetTeacherMe,
  useRegenerateSignupCode,
  getGetTeacherMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw } from "lucide-react";

export default function TeacherSettings() {
  const { data: teacher, isLoading } = useGetTeacherMe();
  const regenerateMutation = useRegenerateSignupCode();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!teacher?.signupCode) return;
    await navigator.clipboard.writeText(teacher.signupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    regenerateMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "New signup code generated", description: "The old code no longer works." });
        qc.invalidateQueries({ queryKey: getGetTeacherMeQueryKey() });
      },
      onError: () => toast({ title: "Couldn't regenerate code", variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
      </div>

      <div className="max-w-xl bg-card p-6 rounded-2xl border border-border space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Student signup code</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Share this code with your students. They'll enter it when they sign up, which connects their
            account to you — they'll only ever see your lessons, availability, and messages.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-12 w-full rounded-xl" />
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-3 rounded-xl border border-border bg-accent/40 font-mono text-lg tracking-widest text-center text-foreground">
              {teacher?.signupCode}
            </div>
            <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy code">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        )}
        {copied && <p className="text-xs text-muted-foreground">Copied to clipboard.</p>}

        <div className="pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={regenerateMutation.isPending}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {regenerateMutation.isPending ? "Regenerating..." : "Regenerate code"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            If your code leaks or a student shares it by mistake, regenerate it — the old code stops working
            immediately, but students already connected to you stay connected.
          </p>
        </div>
      </div>
    </div>
  );
}
