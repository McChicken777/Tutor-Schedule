import { useListComplaints, useUpdateComplaint, getListComplaintsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";

export default function AdminComplaints() {
  const { data: complaints, isLoading, error, refetch } = useListComplaints();
  const updateMutation = useUpdateComplaint();
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleResolve = (id: number, resolved: boolean) => {
    updateMutation.mutate(
      { id, data: { status: resolved ? "resolved" : "open" } },
      {
        onSuccess: () => {
          toast({ title: resolved ? "Marked resolved" : "Reopened" });
          qc.invalidateQueries({ queryKey: getListComplaintsQueryKey() });
        },
      },
    );
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Complaints & Feedback</h1>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !complaints || complaints.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground flex flex-col items-center gap-3">
          <MessageCircle className="w-8 h-8 opacity-40" />
          Nothing here yet.
        </div>
      ) : (
        <div className="space-y-4">
          {complaints.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mb-2 ${
                      c.status === "open" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                    }`}
                  >
                    {c.status === "open" ? "Open" : "Resolved"}
                  </span>
                  <p className="font-bold text-foreground">{c.teacherName}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResolve(c.id, c.status === "open")}
                  disabled={updateMutation.isPending}
                >
                  {c.status === "open" ? "Mark resolved" : "Reopen"}
                </Button>
              </div>
              <p className="text-foreground whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
