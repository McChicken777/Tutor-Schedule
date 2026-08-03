import { useState } from "react";
import { useListAdminTestimonials, useCreateTestimonial, useUpdateTestimonial, useDeleteTestimonial } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListAdminTestimonialsQueryKey, getListTestimonialsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Star, Trash2 } from "lucide-react";

export default function AdminTestimonials() {
  const { data: testimonials, isLoading, error, refetch } = useListAdminTestimonials();
  const createMutation = useCreateTestimonial();
  const updateMutation = useUpdateTestimonial();
  const deleteMutation = useDeleteTestimonial();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({ studentName: "", text: "", rating: 5 });

  const handleToggleVisible = (id: number, isVisible: boolean) => {
    updateMutation.mutate({ id, data: { isVisible } }, {
      onSuccess: () => {
        toast({ title: isVisible ? "Published" : "Hidden" });
        qc.invalidateQueries({ queryKey: getListAdminTestimonialsQueryKey() });
        qc.invalidateQueries({ queryKey: getListTestimonialsQueryKey() });
      },
      onError: () => toast({ title: "Couldn't update testimonial", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Delete this testimonial?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Deleted" });
          qc.invalidateQueries({ queryKey: getListAdminTestimonialsQueryKey() });
          qc.invalidateQueries({ queryKey: getListTestimonialsQueryKey() });
        },
        onError: () => toast({ title: "Couldn't delete testimonial", variant: "destructive" }),
      });
    }
  }

  const handleCreate = () => {
    createMutation.mutate({ data: { ...newTestimonial, isVisible: true } }, {
      onSuccess: () => {
        toast({ title: "Testimonial added" });
        qc.invalidateQueries({ queryKey: getListAdminTestimonialsQueryKey() });
        qc.invalidateQueries({ queryKey: getListTestimonialsQueryKey() });
        setIsCreateOpen(false);
        setNewTestimonial({ studentName: "", text: "", rating: 5 });
      },
      onError: () => toast({ title: "Couldn't add testimonial", variant: "destructive" }),
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
        </div>
      )}
    </div>
  );
}
