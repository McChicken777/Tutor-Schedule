import { useListCreditBundles, useSendStudentMessage } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PurchaseCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PurchaseCreditsDialog({ open, onOpenChange }: PurchaseCreditsDialogProps) {
  const { toast } = useToast();
  const { data: bundlesRaw } = useListCreditBundles();
  const sendMutation = useSendStudentMessage();

  const bundles = [...(bundlesRaw || [])].sort((a, b) => a.credits - b.credits);

  const handleRequest = (credits: number, priceCents: number) => {
    const price = (priceCents / 100).toFixed(2);
    const body = `Hi! I'd like to purchase the ${credits}-credit package (€${price}).`;
    sendMutation.mutate(
      { data: { body } },
      {
        onSuccess: () => {
          toast({ title: "Request sent", description: "Your teacher will follow up about payment." });
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
          <p className="text-sm text-muted-foreground">
            Credits are shared across all lesson types — buy a package and spend it on any lesson you like.
          </p>

          {bundles.length === 0 ? (
            <div className="p-6 bg-accent rounded-2xl text-center text-sm text-muted-foreground">
              No credit packages are available yet. Message your teacher directly to arrange credits.
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
                      <p className="text-xs text-muted-foreground">€{perCredit.toFixed(2)} / credit</p>
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
