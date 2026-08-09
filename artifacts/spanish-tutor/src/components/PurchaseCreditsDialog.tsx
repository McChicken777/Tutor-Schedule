import {
  useListLessonTypes,
  useListLessonTypePackages,
  useCreatePackageRequest,
  useListStudentPackageRequests,
  getListStudentPackageRequestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LessonMark } from "@/components/LessonBalanceBadge";
import { formatEuros } from "@/lib/money";

interface PurchaseCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PurchaseCreditsDialog({ open, onOpenChange }: PurchaseCreditsDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: lessonTypes } = useListLessonTypes();
  const { data: packages } = useListLessonTypePackages();
  const { data: myRequests } = useListStudentPackageRequests();
  const requestMutation = useCreatePackageRequest();

  const pendingPackageIds = new Set(
    (myRequests ?? []).filter((r) => r.status === "pending").map((r) => r.lessonTypeId),
  );

  // Only paid lesson types can be bought in bulk — the trial has nothing to discount.
  const purchasable = (lessonTypes ?? []).filter((lt) => lt.isActive && !lt.isTrial);

  const handleRequest = (lessonTypePackageId: number) => {
    requestMutation.mutate(
      { data: { lessonTypePackageId } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListStudentPackageRequestsQueryKey() });
          toast({
            title: "Request sent",
            description: "Your tutor will confirm once payment arrives, then the lessons appear in your balance.",
          });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Couldn't send request", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buy lessons</DialogTitle>
          <DialogDescription>
            Pay your tutor directly. Once they confirm, the lessons land in your balance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {purchasable.map((lessonType) => {
            const forThisType = (packages ?? [])
              .filter((p) => p.lessonTypeId === lessonType.id && p.isActive)
              .sort((a, b) => a.quantity - b.quantity);
            const alreadyRequested = pendingPackageIds.has(lessonType.id);

            return (
              <div key={lessonType.id}>
                <div className="flex items-center gap-3 mb-3">
                  <LessonMark durationMinutes={lessonType.durationMinutes} />
                  <div>
                    <p className="font-semibold text-foreground leading-tight">{lessonType.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatEuros(lessonType.priceCents)} for a single lesson
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {forThisType.map((pkg) => {
                    const perLesson = pkg.totalCents / pkg.quantity;
                    const saving = lessonType.priceCents * pkg.quantity - pkg.totalCents;
                    return (
                      <div
                        key={pkg.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {pkg.quantity} lessons — {formatEuros(pkg.totalCents)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatEuros(perLesson)} each
                            {saving > 0 && ` · save ${formatEuros(saving)}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          disabled={requestMutation.isPending || alreadyRequested}
                          onClick={() => handleRequest(pkg.id)}
                        >
                          {alreadyRequested ? "Requested" : "Request"}
                        </Button>
                      </div>
                    );
                  })}
                  {forThisType.length === 0 && (
                    <p className="text-xs text-muted-foreground">No packages available for this lesson yet.</p>
                  )}
                </div>
              </div>
            );
          })}

          {purchasable.length === 0 && (
            <p className="text-sm text-muted-foreground">No lessons are available to buy right now.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
