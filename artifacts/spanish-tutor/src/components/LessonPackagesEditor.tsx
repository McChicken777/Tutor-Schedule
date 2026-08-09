import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTeacherLessonTypePackages,
  useCreateLessonTypePackage,
  useUpdateLessonTypePackage,
  useDeleteLessonTypePackage,
  getListTeacherLessonTypePackagesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatEuros, parseEurosToCents } from "@/lib/money";
import { Trash2, Plus } from "lucide-react";

/**
 * Bulk offers for one lesson type. Priced as a total, because that is the
 * figure the student pays and the number the teacher has in mind — the
 * per-lesson rate and the saving are derived from it for display.
 */
export default function LessonPackagesEditor({
  lessonTypeId,
  singlePriceCents,
}: {
  lessonTypeId: number;
  singlePriceCents: number;
}) {
  const { data: allPackages } = useListTeacherLessonTypePackages();
  const createMutation = useCreateLessonTypePackage();
  const updateMutation = useUpdateLessonTypePackage();
  const deleteMutation = useDeleteLessonTypePackage();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState("5");
  const [totalEuros, setTotalEuros] = useState("");

  const packages = (allPackages ?? [])
    .filter((p) => p.lessonTypeId === lessonTypeId && p.isActive)
    .sort((a, b) => a.quantity - b.quantity);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: getListTeacherLessonTypePackagesQueryKey() });

  const handleAdd = () => {
    const qty = Number(quantity);
    const totalCents = parseEurosToCents(totalEuros);
    if (!Number.isInteger(qty) || qty < 2) {
      toast({ title: "Quantity must be 2 or more", variant: "destructive" });
      return;
    }
    if (totalCents === null) {
      toast({ title: "Enter a total like 139.90", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      { data: { lessonTypeId, quantity: qty, totalCents } },
      {
        onSuccess: () => {
          refresh();
          setAdding(false);
          setTotalEuros("");
          setQuantity("5");
        },
      },
    );
  };

  const handlePriceChange = (id: number, value: string) => {
    const totalCents = parseEurosToCents(value);
    if (totalCents === null) {
      toast({ title: "Enter a total like 139.90", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id, data: { totalCents } }, { onSuccess: refresh });
  };

  return (
    <div className="pt-4 border-t border-border">
      <p className="text-sm font-medium text-foreground mb-2">Packages</p>

      {packages.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground mb-2">
          No packages — students can only buy this lesson one at a time.
        </p>
      )}

      <div className="space-y-2 mb-2">
        {packages.map((pkg) => {
          const perLesson = pkg.totalCents / pkg.quantity;
          const saving = singlePriceCents * pkg.quantity - pkg.totalCents;
          return (
            <div key={pkg.id} className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-14 shrink-0">{pkg.quantity} ×</span>
              <Input
                defaultValue={(pkg.totalCents / 100).toFixed(2)}
                onBlur={(e) => {
                  const next = parseEurosToCents(e.target.value);
                  if (next !== null && next !== pkg.totalCents) handlePriceChange(pkg.id, e.target.value);
                }}
                inputMode="decimal"
                className="h-8 w-24"
              />
              <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                {formatEuros(perLesson)} each
                {saving > 0 && ` · saves ${formatEuros(saving)}`}
              </span>
              <button
                type="button"
                onClick={() =>
                  deleteMutation.mutate({ id: pkg.id }, { onSuccess: refresh })
                }
                aria-label="Remove package"
                className="text-muted-foreground hover:text-destructive p-1 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={2}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-8 w-16"
          />
          <span className="text-sm text-muted-foreground">for €</span>
          <Input
            value={totalEuros}
            onChange={(e) => setTotalEuros(e.target.value)}
            placeholder="139.90"
            inputMode="decimal"
            className="h-8 w-24"
          />
          <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add package
        </Button>
      )}
    </div>
  );
}
