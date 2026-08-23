import { useState } from "react";
import {
  useListTeacherTestimonials,
  useCreateTeacherTestimonial,
  useUpdateTeacherTestimonial,
  useDeleteTeacherTestimonial,
  getListTeacherTestimonialsQueryKey,
  getListStudentTestimonialsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Star, Trash2, Pencil } from "lucide-react";

export default function TeacherTestimonials() {
  const { data: testimonials, isLoading, error, refetch } = useListTeacherTestimonials();
  const createMutation = useCreateTeacherTestimonial();
  const updateMutation = useUpdateTeacherTestimonial();
  const deleteMutation = useDeleteTeacherTestimonial();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({ studentName: "", text: "", rating: 5 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ studentName: "", text: "", rating: 5 });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListTeacherTestimonialsQueryKey() });
    qc.invalidateQueries({ queryKey: getListStudentTestimonialsQueryKey() });
  };

  const handleToggleVisible = (id: number, isVisible: boolean) => {
    updateMutation.mutate({ id, data: { isVisible } }, {
      onSuccess: () => {
        toast({ title: isVisible ? "Published" : "Hidden" });
        invalidateAll();
      },
      onError: () => toast({ title: "Couldn't update testimonial", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this testimonial?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Deleted" });
          invalidateAll();
        },
        onError: () => toast({ title: "Couldn't delete testimonial", variant: "destructive" }),
      });
    }
  };

  const handleCreate = () => {
    createMutation.mutate({ data: { ...newTestimonial, isVisible: true } }, {
      onSuccess: () => {
        toast({ title: "Testimonial added" });
        invalidateAll();
        setIsCreateOpen(false);
        setNewTestimonial({ studentName: "", text: "", rating: 5 });
      },
      onError: () => toast({ title: "Couldn't add testimonial", variant: "destructive" }),
    });
  };

  const openEdit = (t: { id: number; studentName: string; text: string; rating: number }) => {
    setEditForm({ studentName: t.studentName, text: t.text, rating: t.rating });
    setEditingId(t.id);
  };

  const handleEditSave = () => {
    if (editingId == null) return;
    updateMutation.mutate({ id: editingId, data: editForm }, {
      onSuccess: () => {
        toast({ title: "Testimonial updated" });
        invalidateAll();
        setEditingId(null);
      },
      onError: () => toast({ title: "Couldn't save changes", variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Testimonials</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>Add Testimonial</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Testimonial</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Student Name</label>
                <Input value={newTestimonial.studentName} onChange={e => setNewTestimonial({...newTestimonial, studentName: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Rating (1-5)</label>
                <Input type="number" min={1} max={5} value={newTestimonial.rating} onChange={e => setNewTestimonial({...newTestimonial, rating: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Review Text</label>
                <Textarea value={newTestimonial.text} onChange={e => setNewTestimonial({...newTestimonial, text: e.target.value})} className="h-32" />
              </div>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !newTestimonial.studentName || !newTestimonial.text} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editingId != null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Testimonial</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Student Name</label>
              <Input value={editForm.studentName} onChange={e => setEditForm({...editForm, studentName: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Rating (1-5)</label>
              <Input type="number" min={1} max={5} value={editForm.rating} onChange={e => setEditForm({...editForm, rating: Number(e.target.value)})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Review Text</label>
              <Textarea value={editForm.text} onChange={e => setEditForm({...editForm, text: e.target.value})} className="h-32" />
            </div>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending || !editForm.studentName || !editForm.text} className="w-full">Save Changes</Button>
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
          {testimonials?.map(t => (
            <div key={t.id} className={`bg-card border border-border p-6 rounded-3xl transition relative group ${!t.isVisible ? "opacity-60" : ""}`}>
              <div className="absolute top-4 right-4 flex items-center gap-3">
                <Switch checked={t.isVisible} onCheckedChange={(v) => handleToggleVisible(t.id, v)} />
                <button onClick={() => openEdit(t)} className="text-muted-foreground hover:text-foreground transition opacity-0 group-hover:opacity-100">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-1 mb-4 text-[#f59e0b]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < t.rating ? "fill-current" : "text-muted"}`} />
                ))}
              </div>
              <p className="text-foreground italic mb-4">"{t.text}"</p>
              <p className="font-bold text-sm">— {t.studentName}</p>
            </div>
          ))}
          {testimonials?.length === 0 && (
            <p className="text-sm text-muted-foreground">No testimonials yet. Add your first one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
