import { useState } from "react";
import { format, isToday } from "date-fns";
import {
  useListAdminMessageThreads,
  useListAdminStudentMessages,
  useSendAdminMessage,
  getListAdminMessageThreadsQueryKey,
  getListAdminStudentMessagesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/ErrorState";
import { useQueryClient } from "@tanstack/react-query";
import { Send, MessageSquare } from "lucide-react";

function formatThreadTime(date: Date): string {
  return isToday(date) ? format(date, "h:mm a") : format(date, "MMM d");
}

export default function AdminMessages() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: threads, isLoading, error, refetch } = useListAdminMessageThreads({
    query: { refetchInterval: 15000, queryKey: getListAdminMessageThreadsQueryKey() },
  });

  const selected = threads?.find((t) => t.studentId === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-full sm:w-80 border-r border-border flex-shrink-0 flex flex-col min-h-0">
        <div className="p-6 pb-4">
          <h1 className="text-2xl font-serif font-bold text-foreground">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} className="p-4" />
          ) : !threads || threads.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No messages yet. Students can start a conversation from their dashboard.
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.studentId}
                onClick={() => setSelectedId(t.studentId)}
                className={`w-full text-left px-6 py-4 border-b border-border transition-colors ${
                  selectedId === t.studentId ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-foreground truncate">{t.studentName}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatThreadTime(new Date(t.lastMessageAt))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground truncate">{t.lastMessageBody}</p>
                  {t.unreadCount > 0 && (
                    <span className="flex-shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="flex-1 min-h-0 hidden sm:flex flex-col">
        {selected ? (
          <ConversationPane
            key={selected.studentId}
            studentId={selected.studentId}
            studentName={selected.studentName}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageSquare className="w-10 h-10 opacity-40" />
            <p>Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationPane({ studentId, studentName }: { studentId: number; studentName: string }) {
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();
  const { data: messages, isLoading } = useListAdminStudentMessages(studentId, {
    query: { refetchInterval: 10000, queryKey: getListAdminStudentMessagesQueryKey(studentId) },
  });
  const sendMutation = useSendAdminMessage();

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    sendMutation.mutate(
      { id: studentId, data: { body } },
      {
        onSuccess: () => {
          setDraft("");
          qc.invalidateQueries({ queryKey: getListAdminStudentMessagesQueryKey(studentId) });
          qc.invalidateQueries({ queryKey: getListAdminMessageThreadsQueryKey() });
        },
      },
    );
  };

  return (
    <>
      <div className="p-6 border-b border-border">
        <h2 className="font-bold text-foreground">{studentName}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          messages?.map((m) => (
            <div key={m.id} className={`flex ${m.senderRole === "admin" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  m.senderRole === "admin"
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-foreground"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-xs mt-1 ${m.senderRole === "admin" ? "opacity-70" : "text-muted-foreground"}`}>
                  {format(new Date(m.createdAt), "MMM d, h:mm a")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-border flex items-end gap-3">
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
    </>
  );
}
