import { useState } from "react";
import { format } from "date-fns";
import {
  useListReports,
  useUpdateReport,
  useBanReportedUser,
  getListReportsQueryKey,
  getGetAdminDashboardQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ErrorState from "@/components/ErrorState";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Flag, Ban } from "lucide-react";

const TABS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "actioned", label: "Actioned" },
  { value: "all", label: "All" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const TARGET_LABEL: Record<string, string> = {
  message: "Message",
  homework_file: "Homework file",
  general: "General",
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  resolved: "bg-secondary/10 text-secondary",
  actioned: "bg-destructive/10 text-destructive",
};

export default function AdminReports() {
  const [tab, setTab] = useState<TabValue>("open");
  const qc = useQueryClient();
  const { toast } = useToast();

  const statusFilter = tab === "all" ? undefined : tab;
  const { data: reports, isLoading, error, refetch } = useListReports(
    { status: statusFilter },
    { query: { queryKey: getListReportsQueryKey({ status: statusFilter }) } },
  );

  const updateMutation = useUpdateReport();
  const banMutation = useBanReportedUser();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListReportsQueryKey({ status: statusFilter }) });
    qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
  };

  const handleToggleStatus = (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === "open" ? "resolved" : "open";
    updateMutation.mutate(
      { id, data: { status: nextStatus } },
      {
        onSuccess: () => {
          toast({ title: nextStatus === "resolved" ? "Marked resolved" : "Reopened" });
          invalidate();
        },
      },
    );
  };

  const handleBan = (id: number) => {
    banMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Account banned" });
          invalidate();
        },
        onError: () => {
          toast({ title: "Couldn't ban account", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Reports</h1>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="w-full">
        <TabsList className="mb-8">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !reports || reports.length === 0 ? (
            <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground flex flex-col items-center gap-3">
              <Flag className="w-8 h-8 opacity-40" />
              Nothing here yet.
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((r) => (
                <div key={r.id} className="bg-card border border-border rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[r.status]}`}>
                          {r.status[0].toUpperCase() + r.status.slice(1)}
                        </span>
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent text-foreground">
                          {TARGET_LABEL[r.targetType]}
                        </span>
                      </div>
                      <p className="font-bold text-foreground">
                        {r.reporterName} <span className="font-normal text-muted-foreground">({r.reporterRole})</span>
                      </p>
                      {r.reportedUserName && (
                        <p className="text-sm text-muted-foreground">
                          Reported: {r.reportedUserName} ({r.reportedUserRole})
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{format(new Date(r.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(r.id, r.status)}
                        disabled={updateMutation.isPending}
                      >
                        {r.status === "open" ? "Mark resolved" : "Reopen"}
                      </Button>
                      {r.reportedUserRole && r.status !== "actioned" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={banMutation.isPending}>
                              <Ban className="w-4 h-4 mr-1.5" /> Ban this user
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ban {r.reportedUserName}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This immediately locks the account out of the app. It can be unbanned later from the Accounts page.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleBan(r.id)}>Ban account</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                  {r.targetPreview && (
                    <p className="text-sm text-muted-foreground bg-accent/50 rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap break-words">
                      "{r.targetPreview}"
                    </p>
                  )}
                  <p className="text-foreground whitespace-pre-wrap">{r.body}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
