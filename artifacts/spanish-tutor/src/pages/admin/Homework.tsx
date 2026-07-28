import { useState } from "react";
import { useListAdminHomework, useUpdateHomework } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListAdminHomeworkQueryKey } from "@workspace/api-client-react";
import { FileText, Download } from "lucide-react";

export default function AdminHomework() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const { data: homeworkList, isLoading } = useListAdminHomework({ reviewed: tab === "reviewed" });
  
  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Homework Inbox</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="pending">Needs Review</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
          ) : !homeworkList || homeworkList.length === 0 ? (
            <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground">
              No {tab} homework found.
            </div>
          ) : (
            <div className="space-y-6">
              {homeworkList.map(hw => (
                <HomeworkCard key={hw.id} hw={hw} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HomeworkCard({ hw }: { hw: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateHomework();
  
  const [feedback, setFeedback] = useState(hw.tutorFeedback || "");
  const [grade, setGrade] = useState(hw.grade || "");

  const handleSave = () => {
    updateMutation.mutate({ id: hw.id, data: { tutorFeedback: feedback, grade } }, {
      onSuccess: () => {
        toast({ title: "Feedback saved" });
        qc.invalidateQueries({ queryKey: getListAdminHomeworkQueryKey({ reviewed: false }) });
        qc.invalidateQueries({ queryKey: getListAdminHomeworkQueryKey({ reviewed: true }) });
      }
    });
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-border">
        <div>
          <h3 className="font-bold text-foreground text-lg">{hw.studentName}</h3>
          <p className="text-muted-foreground">{hw.lessonTypeName} on {format(new Date(hw.lessonDate), "MMM d, yyyy")}</p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          Submitted {hw.submittedAt ? format(new Date(hw.submittedAt), "MMM d") : "Unknown"}
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Submission
          </h4>
          {hw.submittedText && (
            <div className="bg-accent/50 p-4 rounded-xl text-sm whitespace-pre-wrap mb-4">
              {hw.submittedText}
            </div>
          )}
          {hw.fileUrl && (
            <a href={hw.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-4 py-2 bg-accent hover:bg-accent/80 text-foreground rounded-lg text-sm font-medium">
              <Download className="w-4 h-4 mr-2" /> View Attachment
            </a>
          )}
        </div>
        
        <div className="space-y-4">
          <h4 className="font-medium text-foreground mb-2">Your Feedback</h4>
          <Textarea 
            value={feedback} 
            onChange={(e) => setFeedback(e.target.value)} 
            placeholder="Write your feedback here..." 
            className="h-32"
          />
          <div className="flex gap-4">
            <div className="flex-1">
              <Input 
                value={grade} 
                onChange={(e) => setGrade(e.target.value)} 
                placeholder="Grade (e.g. A, 90%, Great)" 
              />
            </div>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {hw.reviewedAt ? "Update" : "Submit Review"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
