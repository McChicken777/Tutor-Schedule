import { useState } from "react";
import { format } from "date-fns";
import {
  useListStudentMessages,
  useSendStudentMessage,
  getListStudentMessagesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Send, MessageSquare } from "lucide-react";

export default function StudentMessages() {
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();
  const { data: messages, isLoading } = useListStudentMessages({
    query: { refetchInterval: 10000, queryKey: getListStudentMessagesQueryKey() },
  });
  const sendMutation = useSendStudentMessage();

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    sendMutation.mutate(
      { data: { body } },
      {
        onSuccess: () => {
          setDraft("");
          qc.invalidateQueries({ queryKey: getListStudentMessagesQueryKey() });
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-6 md:p-10 pb-6 border-b border-border">
        <h1 className="text-3xl font-serif font-bold text-foreground">Messages</h1>
        <p className="text-muted-foreground mt-1">Chat with your teacher</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:px-10 space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !messages || messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 py-16">
            <MessageSquare className="w-10 h-10 opacity-40" />
            <p>Say hello — your teacher will see it here.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.senderRole === "student" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  m.senderRole === "student"
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-foreground"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-xs mt-1 ${m.senderRole === "student" ? "opacity-70" : "text-muted-foreground"}`}>
                  {format(new Date(m.createdAt), "MMM d, h:mm a")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 md:px-10 md:py-6 border-t border-border flex items-end gap-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Write a message..."
          className="min-h-11 h-11 resize-none"
        />
        <Button onClick={handleSend} disabled={sendMutation.isPending || !draft.trim()} size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
