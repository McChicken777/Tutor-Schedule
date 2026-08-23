import {
  useListTeacherLessonTypes,
  useUpdateLessonType,
  useCreateLessonType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListTeacherLessonTypesQueryKey,
  getListStudentLessonTypesQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import { formatEuros, parseEurosToCents } from "@/lib/money";
import LessonPackagesEditor from "@/components/LessonPackagesEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function TeacherLessonTypes() {
  const { data: lessonTypes, isLoading, error, refetch } = useListTeacherLessonTypes();
  const updateMutation = useUpdateLessonType();
  const createMutation = useCreateLessonType();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [newLesson, setNewLesson] = useState({ name: "", durationMinutes: 45, priceEuros: "16.00", description: "", isTrial: false });
  const [editForm, setEditForm] = useState({ name: "", durationMinutes: 45, priceEuros: "16.00", description: "" });

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateMutation.mutate({ id, data: { isActive } }, {
      onSuccess: () => {
        toast({ title: isActive ? "Lesson activated" : "Lesson deactivated" });
        qc.invalidateQueries({ queryKey: getListTeacherLessonTypesQueryKey() });
        qc.invalidateQueries({ queryKey: getListStudentLessonTypesQueryKey() });
      },
      onError: () => toast({ title: "Couldn't update lesson", variant: "destructive" }),
    });
  };

  const handleToggleTrial = (id: number, isTrial: boolean) => {
    updateMutation.mutate({ id, data: { isTrial } }, {
      onSuccess: () => {
        toast({ title: isTrial ? "Set as the free trial lesson" : "No longer the free trial lesson" });
        qc.invalidateQueries({ queryKey: getListTeacherLessonTypesQueryKey() });
        qc.invalidateQueries({ queryKey: getListStudentLessonTypesQueryKey() });
      },
      onError: () => toast({ title: "Couldn't update lesson", variant: "destructive" }),
    });
  };

  const openEdit = (lt: { id: number; name: string; durationMinutes: number; priceCents: number; description: string }) => {
    setEditForm({
      name: lt.name,
      durationMinutes: lt.durationMinutes,
      priceEuros: (lt.priceCents / 100).toFixed(2),
      description: lt.description,
    });
    setEditingId(lt.id);
  };

  const handleEditSave = () => {
    if (editingId == null) return;
    const priceCents = parseEurosToCents(editForm.priceEuros);
    if (priceCents === null) {
      toast({ title: "Enter a price like 16.00", variant: "destructive" });
      return;
    }
    const { priceEuros, ...rest } = editForm;
    updateMutation.mutate({ id: editingId, data: { ...rest, priceCents } }, {
      onSuccess: () => {
        toast({ title: "Lesson updated" });
        qc.invalidateQueries({ queryKey: getListTeacherLessonTypesQueryKey() });
        qc.invalidateQueries({ queryKey: getListStudentLessonTypesQueryKey() });
        setEditingId(null);
      },
      onError: () => toast({ title: "Couldn't save changes", variant: "destructive" }),
    });
  };

  const handleCreate = () => {
    const priceCents = parseEurosToCents(newLesson.priceEuros);
    if (priceCents === null) {
      toast({ title: "Enter a price like 16.00", variant: "destructive" });
      return;
    }
    const { priceEuros, ...rest } = newLesson;
    createMutation.mutate({ data: { ...rest, priceCents, isActive: true } }, {
      onSuccess: () => {
        toast({ title: "Lesson created" });
        qc.invalidateQueries({ queryKey: getListTeacherLessonTypesQueryKey() });
        setIsCreateOpen(false);
        setNewLesson({ name: "", durationMinutes: 45, priceEuros: "16.00", description: "", isTrial: false });
      },
      onError: () => toast({ title: "Couldn't create lesson", variant: "destructive" }),
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
                  <Input inputMode="decimal" value={newLesson.priceEuros} onChange={e => setNewLesson({...newLesson, priceEuros: e.target.value})} placeholder="16.00" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea value={newLesson.description} onChange={e => setNewLesson({...newLesson, description: e.target.value})} />
              </div>
              <div className="flex items-center justify-between p-3 bg-accent/50 rounded-xl border border-border">
                <div>
                  <p className="font-medium text-sm">Free trial lesson</p>
                  <p className="text-xs text-muted-foreground">New students can book this lesson once, free.</p>
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
                <Input inputMode="decimal" value={editForm.priceEuros} onChange={e => setEditForm({...editForm, priceEuros: e.target.value})} placeholder="16.00" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} />
            </div>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending || !editForm.name} className="w-full">Save Changes</Button>
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
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-muted-foreground">{lt.durationMinutes} minutes</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                  {lt.isTrial ? "Free" : formatEuros(lt.priceCents)}
                </span>
              </div>
              <p className="text-muted-foreground text-sm mb-4">{lt.description}</p>
              {!lt.isTrial && (
                <LessonPackagesEditor lessonTypeId={lt.id} singlePriceCents={lt.priceCents} />
              )}
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
