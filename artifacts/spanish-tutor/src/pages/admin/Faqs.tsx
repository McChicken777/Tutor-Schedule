import { useState } from "react";
import { useListAdminFaqs, useCreateFaq, useUpdateFaq, useDeleteFaq } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListAdminFaqsQueryKey, getListFaqsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, Pencil } from "lucide-react";

export default function AdminFaqs() {
  const { data: faqs, isLoading, error, refetch } = useListAdminFaqs();
  const createMutation = useCreateFaq();
  const updateMutation = useUpdateFaq();
  const deleteMutation = useDeleteFaq();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "", displayOrder: 0 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ question: "", answer: "", displayOrder: 0 });

  const handleToggleVisible = (id: number, isVisible: boolean) => {
    updateMutation.mutate({ id, data: { isVisible } }, {
      onSuccess: () => {
        toast({ title: isVisible ? "Published" : "Hidden" });
        qc.invalidateQueries({ queryKey: getListAdminFaqsQueryKey() });
        qc.invalidateQueries({ queryKey: getListFaqsQueryKey() });
      },
      onError: () => toast({ title: "Couldn't update FAQ", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Delete this FAQ?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Deleted" });
          qc.invalidateQueries({ queryKey: getListAdminFaqsQueryKey() });
          qc.invalidateQueries({ queryKey: getListFaqsQueryKey() });
        },
        onError: () => toast({ title: "Couldn't delete FAQ", variant: "destructive" }),
      });
    }
  }

  const handleCreate = () => {
    createMutation.mutate({ data: { ...newFaq, isVisible: true } }, {
      onSuccess: () => {
        toast({ title: "FAQ added" });
        qc.invalidateQueries({ queryKey: getListAdminFaqsQueryKey() });
        qc.invalidateQueries({ queryKey: getListFaqsQueryKey() });
        setIsCreateOpen(false);
        setNewFaq({ question: "", answer: "", displayOrder: 0 });
      },
      onError: () => toast({ title: "Couldn't add FAQ", variant: "destructive" }),
    });
  };

  const openEdit = (faq: { id: number; question: string; answer: string; displayOrder: number }) => {
    setEditForm({ question: faq.question, answer: faq.answer, displayOrder: faq.displayOrder });
    setEditingId(faq.id);
  };

  const handleEditSave = () => {
    if (editingId == null) return;
    updateMutation.mutate({ id: editingId, data: editForm }, {
      onSuccess: () => {
        toast({ title: "FAQ updated" });
        qc.invalidateQueries({ queryKey: getListAdminFaqsQueryKey() });
        qc.invalidateQueries({ queryKey: getListFaqsQueryKey() });
        setEditingId(null);
      },
      onError: () => toast({ title: "Couldn't save changes", variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">FAQs</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>Add FAQ</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New FAQ</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Question</label>
                <Input value={newFaq.question} onChange={e => setNewFaq({...newFaq, question: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Answer</label>
                <Textarea value={newFaq.answer} onChange={e => setNewFaq({...newFaq, answer: e.target.value})} className="h-32" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Display Order</label>
                <Input type="number" value={newFaq.displayOrder} onChange={e => setNewFaq({...newFaq, displayOrder: Number(e.target.value)})} />
              </div>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !newFaq.question || !newFaq.answer} className="w-full">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editingId != null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit FAQ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Question</label>
              <Input value={editForm.question} onChange={e => setEditForm({...editForm, question: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Answer</label>
              <Textarea value={editForm.answer} onChange={e => setEditForm({...editForm, answer: e.target.value})} className="h-32" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Display Order</label>
              <Input type="number" value={editForm.displayOrder} onChange={e => setEditForm({...editForm, displayOrder: Number(e.target.value)})} />
            </div>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending || !editForm.question || !editForm.answer} className="w-full">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="space-y-4">
          {faqs?.map(faq => (
            <div key={faq.id} className={`bg-card border border-border p-6 rounded-2xl transition relative group ${!faq.isVisible ? "opacity-60" : ""}`}>
              <div className="absolute top-4 right-4 flex items-center gap-3">
                <Switch checked={faq.isVisible} onCheckedChange={(v) => handleToggleVisible(faq.id, v)} />
                <button onClick={() => openEdit(faq)} className="text-muted-foreground hover:text-foreground transition opacity-0 group-hover:opacity-100">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(faq.id)} className="text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <h3 className="font-bold text-foreground text-lg mb-2 pr-24">{faq.question}</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{faq.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
