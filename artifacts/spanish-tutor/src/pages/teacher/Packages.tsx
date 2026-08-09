import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTeacherPackageRequests,
  useResolvePackageRequest,
  getListTeacherPackageRequestsQueryKey,
  getListTeacherStudentsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { useToast } from "@/hooks/use-toast";
import { LessonMark } from "@/components/LessonBalanceBadge";
import { formatEuros } from "@/lib/money";
import { Inbox } from "lucide-react";

export default function TeacherPackages() {
  const { data: requests, isLoading, error, refetch } = useListTeacherPackageRequests();
  const resolveMutation = useResolvePackageRequest();
  const qc = useQueryClient();
  const { toast } = useToast();

  const resolve = (id: number, status: "paid" | "declined") => {
    resolveMutation.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListTeacherPackageRequestsQueryKey() });
          qc.invalidateQueries({ queryKey: getListTeacherStudentsQueryKey() });
          toast({
            title: status === "paid" ? "Lessons added to their balance" : "Request declined",
          });
        },
        onError: () => toast({ title: "Couldn't update the request", variant: "destructive" }),
      },
    );
  };

  if (isLoading) return <div className="p-6 md:p-10"><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="p-6 md:p-10"><ErrorState error={error} onRetry={refetch} /></div>;

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const resolved = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="p-6 md:p-10 max-w-4xl">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-1">Package requests</h1>
      <p className="text-muted-foreground mb-8">
        Students pay you directly. Mark a request as paid once the money arrives — that adds the
        lessons to their balance.
      </p>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-3 py-12 border border-dashed border-border rounded-2xl">
          <Inbox className="w-8 h-8 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No requests waiting.</p>
        </div>
      ) : (
        <div className="space-y-3 mb-12">
          {pending.map((r) => (
            <div
              key={r.id}
              className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center gap-4"
            >
              <LessonMark durationMinutes={r.durationMinutes ?? 0} />
              <div className="flex-1 min-w-[12rem]">
                <p className="font-semibold text-foreground">
                  {r.studentName ?? "Student"} — {r.quantity} × {r.lessonTypeName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatEuros(r.totalCents)} · requested {format(new Date(r.requestedAt), "MMM d")}
                </p>
                {r.note && <p className="text-sm text-muted-foreground mt-1 italic">"{r.note}"</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resolveMutation.isPending}
                  onClick={() => resolve(r.id, "declined")}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  disabled={resolveMutation.isPending}
                  onClick={() => resolve(r.id, "paid")}
                >
                  Mark as paid
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-foreground mb-4">History</h2>
          <div className="border-t border-border">
            {resolved.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 py-3 border-b border-border text-sm"
              >
                <span className="font-medium text-foreground flex-1 min-w-[10rem]">
                  {r.studentName ?? "Student"} — {r.quantity} × {r.lessonTypeName}
                </span>
                <span className="text-muted-foreground">{formatEuros(r.totalCents)}</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                    r.status === "paid"
                      ? "bg-secondary/10 text-secondary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.status === "paid" ? "Paid" : "Declined"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {r.resolvedAt ? format(new Date(r.resolvedAt), "MMM d") : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
