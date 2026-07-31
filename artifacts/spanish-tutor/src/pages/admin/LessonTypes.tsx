import {
  useListAdminLessonTypes,
  useUpdateLessonType,
  useCreateLessonType,
  useCreateCreditBundle,
  useUpdateCreditBundle,
  useDeleteCreditBundle,
  type CreditBundle,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListAdminLessonTypesQueryKey, getListLessonTypesQueryKey } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

function CreditBundleManager({ lessonTypeId, bundles }: { lessonTypeId: number; bundles: CreditBundle[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const createBundleMutation = useCreateCreditBundle();
  const updateBundleMutation = useUpdateCreditBundle();
  const deleteBundleMutation = useDeleteCreditBundle();

  const [rows, setRows] = useState<Record<number, { credits: number; priceCents: number }>>({});
  const [newTier, setNewTier] = useState({ credits: 5, priceCents: 0 });

  useEffect(() => {
    setRows(Object.fromEntries(bundles.map((b) => [b.id, { credits: b.credits, priceCents: b.priceCents }])));
  }, [bundles]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminLessonTypesQueryKey() });
    qc.invalidateQueries({ queryKey: getListLessonTypesQueryKey() });
  };

  const handleSaveRow = (id: number) => {
    const row = rows[id];
    if (!row) return;
    updateBundleMutation.mutate({ id, data: row }, {
      onSuccess: () => {
        toast({ title: "Package updated" });
        invalidate();
      }
    });
  };

  const handleDeleteRow = (id: number) => {
    deleteBundleMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Package removed" });
        invalidate();
      }
    });
  };

  const handleAddTier = () => {
    createBundleMutation.mutate({ data: { lessonTypeId, credits: newTier.credits, priceCents: newTier.priceCents } }, {
      onSuccess: () => {
        toast({ title: "Package added" });
        setNewTier({ credits: 5, priceCents: 0 });
        invalidate();
      }
    });
  };

  return (
    <div className="space-y-3 p-3 bg-accent/30 rounded-xl border border-border">
      <p className="text-sm font-medium">Credit Packages</p>
      {bundles.map((b) => {
        const row = rows[b.id] ?? { credits: b.credits, priceCents: b.priceCents };
        return (
          <div key={b.id} className="flex items-center gap-2">
            <Input
              type="number"
              className="w-20"
              value={row.credits}
              onChange={(e) => setRows({ ...rows, [b.id]: { ...row, credits: Number(e.target.value) } })}
              aria-label="Credits"
            />
            <span className="text-xs text-muted-foreground shrink-0">credits for €</span>
            <Input
              type="number"
              className="w-24"
              value={row.priceCents / 100}
              onChange={(e) => setRows({ ...rows, [b.id]: { ...row, priceCents: Math.round(Number(e.target.value) * 100) } })}
              aria-label="Price"
            />
            <Button size="sm" variant="outline" onClick={() => handleSaveRow(b.id)} disabled={updateBundleMutation.isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleDeleteRow(b.id)} disabled={deleteBundleMutation.isPending}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <Input
          type="number"
          className="w-20"
          value={newTier.credits}
          onChange={(e) => setNewTier({ ...newTier, credits: Number(e.target.value) })}
          aria-label="New tier credits"
        />
        <span className="text-xs text-muted-foreground shrink-0">credits for €</span>
        <Input
          type="number"
          className="w-24"
          value={newTier.priceCents / 100}
          onChange={(e) => setNewTier({ ...newTier, priceCents: Math.round(Number(e.target.value) * 100) })}
          aria-label="New tier price"
        />
        <Button size="sm" onClick={handleAddTier} disabled={createBundleMutation.isPending}>
          Add tier
        </Button>
      </div>
    </div>
  );
}

export default function AdminLessonTypes() {
  const { data: lessonTypes, isLoading, error, refetch } = useListAdminLessonTypes();
  const updateMutation = useUpdateLessonType();
  const createMutation = useCreateLessonType();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [newLesson, setNewLesson] = useState({ name: "", durationMinutes: 30, priceCents: 0, description: "", isTrial: false });
  const [editForm, setEditForm] = useState({ name: "", durationMinutes: 30, priceCents: 0, description: "" });

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateMutation.mutate({ id, data: { isActive } }, {
      onSuccess: () => {
        toast({ title: isActive ? "Lesson activated" : "Lesson deactivated" });
        qc.invalidateQueries({ queryKey: getListAdminLessonTypesQueryKey() });
        qc.invalidateQueries({ queryKey: getListLessonTypesQueryKey() });
      }
    });
  };

  const handleToggleTrial = (id: number, isTrial: boolean) => {
    updateMutation.mutate({ id, data: { isTrial } }, {
      onSuccess: () => {
        toast({ title: isTrial ? "Set as the free trial lesson" : "No longer the free trial lesson" });
        qc.invalidateQueries({ queryKey: getListAdminLessonTypesQueryKey() });
        qc.invalidateQueries({ queryKey: getListLessonTypesQueryKey() });
      }
    });
  };

  const openEdit = (lt: { id: number; name: string; durationMinutes: number; priceCents: number; description: string }) => {
    setEditForm({ name: lt.name, durationMinutes: lt.durationMinutes, priceCents: lt.priceCents, description: lt.description });
    setEditingId(lt.id);
  };

  const handleEditSave = () => {
    if (editingId == null) return;
    updateMutation.mutate({ id: editingId, data: editForm }, {
      onSuccess: () => {
        toast({ title: "Lesson updated" });
        qc.invalidateQueries({ queryKey: getListAdminLessonTypesQueryKey() });
        qc.invalidateQueries({ queryKey: getListLessonTypesQueryKey() });
        setEditingId(null);
      }
    });
  };

  const handleCreate = () => {
    createMutation.mutate({ data: { ...newLesson, isActive: true } }, {
      onSuccess: () => {
        toast({ title: "Lesson created" });
        qc.invalidateQueries({ queryKey: getListAdminLessonTypesQueryKey() });
        setIsCreateOpen(false);
        setNewLesson({ name: "", durationMinutes: 30, priceCents: 0, description: "", isTrial: false });
      }
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Lesson Types</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>Create Lesson</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Lesson Type</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <Input value={newLesson.name} onChange={e => setNewLesson({...newLesson, name: e.target.value})} placeholder="e.g. Conversational Spanish" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Duration (min)</label>
                  <Input type="number" value={newLesson.durationMinutes} onChange={e => setNewLesson({...newLesson, durationMinutes: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Price (€)</label>
                  <Input type="number" value={newLesson.priceCents / 100} onChange={e => setNewLesson({...newLesson, priceCents: Math.round(Number(e.target.value) * 100)})} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea value={newLesson.description} onChange={e => setNewLesson({...newLesson, description: e.target.value})} />
              </div>
              <div className="flex items-center justify-between p-3 bg-accent/50 rounded-xl border border-border">
                <div>
                  <p className="font-medium text-sm">Free trial lesson</p>
                  <p className="text-xs text-muted-foreground">New students automatically get 1 free credit for this lesson.</p>
                </div>
                <Switch checked={newLesson.isTrial} onCheckedChange={(v) => setNewLesson({ ...newLesson, isTrial: v })} />
              </div>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !newLesson.name} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editingId != null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lesson Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Duration (min)</label>
                <Input type="number" value={editForm.durationMinutes} onChange={e => setEditForm({...editForm, durationMinutes: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Price (€)</label>
                <Input type="number" value={editForm.priceCents / 100} onChange={e => setEditForm({...editForm, priceCents: Math.round(Number(e.target.value) * 100)})} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} />
            </div>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending || !editForm.name} className="w-full">Save Changes</Button>
            {editingId != null && (
              <CreditBundleManager
                lessonTypeId={editingId}
                bundles={lessonTypes?.find(lt => lt.id === editingId)?.creditBundles ?? []}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {lessonTypes?.map(lt => (
            <div key={lt.id} className={`bg-card border border-border p-6 rounded-3xl transition ${!lt.isActive ? "opacity-60" : ""}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-foreground">{lt.name}</h3>
                  {lt.isTrial && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary">Free Trial</span>
                  )}
                </div>
                <Switch checked={lt.isActive} onCheckedChange={(v) => handleToggleActive(lt.id, v)} />
              </div>
              <p className="text-primary font-medium mb-2">{lt.durationMinutes} minutes • €{(lt.priceCents/100).toFixed(2)}</p>
              <p className="text-muted-foreground text-sm mb-4">{lt.description}</p>
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <span className="text-sm text-muted-foreground">Free trial lesson</span>
                <Switch checked={lt.isTrial} onCheckedChange={(v) => handleToggleTrial(lt.id, v)} />
              </div>
              <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => openEdit(lt)}>
                Edit
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
