import { useEffect, useState } from "react";
import {
  useListLessonTypes,
  useGetStudentDashboard,
  useSendStudentMessage,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PurchaseCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLessonTypeId?: number;
}

export default function PurchaseCreditsDialog({ open, onOpenChange, initialLessonTypeId }: PurchaseCreditsDialogProps) {
  const { toast } = useToast();
  const { data: lessonTypes } = useListLessonTypes();
  const { data: dashboard } = useGetStudentDashboard();
  const sendMutation = useSendStudentMessage();

  const purchasableTypes = (lessonTypes || []).filter((lt) => !lt.isTrial);

  const [selectedTypeId, setSelectedTypeId] = useState<number | undefined>(initialLessonTypeId);

  useEffect(() => {
    if (!open) return;
    if (initialLessonTypeId != null) {
      setSelectedTypeId(initialLessonTypeId);
      return;
    }
    if (selectedTypeId != null) return;
    const mostRecent = dashboard?.packages?.find((p) =>
      purchasableTypes.some((lt) => lt.id === p.lessonTypeId),
    )?.lessonTypeId;
    setSelectedTypeId(mostRecent ?? purchasableTypes[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLessonTypeId, lessonTypes]);

  const selectedType = purchasableTypes.find((lt) => lt.id === selectedTypeId);
  const bundles = [...(selectedType?.creditBundles || [])].sort((a, b) => a.credits - b.credits);

  const handleRequest = (credits: number, priceCents: number) => {
    if (!selectedType) return;
    const price = (priceCents / 100).toFixed(2);
    const body = `Hi! I'd like to purchase the ${credits}-credit package (€${price}) for ${selectedType.name}.`;
    sendMutation.mutate(
      { data: { body } },
      {
        onSuccess: () => {
          toast({ title: "Request sent", description: `${selectedType.name} will follow up about payment.` });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buy Credits</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {purchasableTypes.length > 1 && (
            <Select
              value={selectedTypeId != null ? String(selectedTypeId) : undefined}
              onValueChange={(v) => setSelectedTypeId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a lesson type" />
              </SelectTrigger>
              <SelectContent>
                {purchasableTypes.map((lt) => (
                  <SelectItem key={lt.id} value={String(lt.id)}>
                    {lt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selectedType && (
            <p className="text-sm text-muted-foreground">
              Single lesson: €{(selectedType.priceCents / 100).toFixed(2)} for {selectedType.durationMinutes} minutes.
            </p>
          )}

          {bundles.length === 0 ? (
            <div className="p-6 bg-accent rounded-2xl text-center text-sm text-muted-foreground">
              No credit packages are available for this lesson type yet. Message your teacher directly to arrange credits.
            </div>
          ) : (
            <div className="grid gap-3">
              {bundles.map((bundle) => {
                const perCredit = bundle.priceCents / bundle.credits / 100;
                return (
                  <div
                    key={bundle.id}
                    className="flex items-center justify-between p-4 rounded-2xl border border-border bg-card"
                  >
                    <div>
                      <p className="font-bold text-foreground">
                        {bundle.credits} credit{bundle.credits === 1 ? "" : "s"} — €{(bundle.priceCents / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">€{perCredit.toFixed(2)} / lesson</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleRequest(bundle.credits, bundle.priceCents)}
                      disabled={sendMutation.isPending}
                    >
                      Request this package
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
