import {
  useListAdminTeacherAccounts,
  useListAdminStudentAccounts,
  useBanTeacherAccount,
  useUnbanTeacherAccount,
  useBanStudentAccount,
  useUnbanStudentAccount,
  getListAdminTeacherAccountsQueryKey,
  getListAdminStudentAccountsQueryKey,
} from "@workspace/api-client-react";
import type { AdminAccount } from "@workspace/api-client-react";
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
import { Users, Ban } from "lucide-react";

export default function AdminAccounts() {
  return (
    <div className="p-6 md:p-10 bg-background min-h-full">
      <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Accounts</h1>

      <Tabs defaultValue="teachers" className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
        </TabsList>

        <TabsContent value="teachers">
          <TeacherAccountsTable />
        </TabsContent>
        <TabsContent value="students">
          <StudentAccountsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TeacherAccountsTable() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: accounts, isLoading, error, refetch } = useListAdminTeacherAccounts();
  const banMutation = useBanTeacherAccount();
  const unbanMutation = useUnbanTeacherAccount();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminTeacherAccountsQueryKey() });

  const handleBan = (id: number) => {
    banMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Teacher banned" });
          invalidate();
        },
      },
    );
  };

  const handleUnban = (id: number) => {
    unbanMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Teacher unbanned" });
          invalidate();
        },
      },
    );
  };

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <AccountsTable
      accounts={accounts ?? []}
      onBan={handleBan}
      onUnban={handleUnban}
      isPending={banMutation.isPending || unbanMutation.isPending}
    />
  );
}

function StudentAccountsTable() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: accounts, isLoading, error, refetch } = useListAdminStudentAccounts();
  const banMutation = useBanStudentAccount();
  const unbanMutation = useUnbanStudentAccount();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminStudentAccountsQueryKey() });

  const handleBan = (id: number) => {
    banMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Student banned" });
          invalidate();
        },
      },
    );
  };

  const handleUnban = (id: number) => {
    unbanMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Student unbanned" });
          invalidate();
        },
      },
    );
  };

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <AccountsTable
      accounts={accounts ?? []}
      onBan={handleBan}
      onUnban={handleUnban}
      isPending={banMutation.isPending || unbanMutation.isPending}
    />
  );
}

function AccountsTable({
  accounts,
  onBan,
  onUnban,
  isPending,
}: {
  accounts: AdminAccount[];
  onBan: (id: number) => void;
  onUnban: (id: number) => void;
  isPending: boolean;
}) {
  if (accounts.length === 0) {
    return (
      <div className="p-12 bg-card border border-border rounded-3xl text-center text-muted-foreground flex flex-col items-center gap-3">
        <Users className="w-8 h-8 opacity-40" />
        No accounts found.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-6 py-3 font-medium">Name</th>
            <th className="px-6 py-3 font-medium">Email</th>
            <th className="px-6 py-3 font-medium">Status</th>
            <th className="px-6 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-b border-border last:border-0">
              <td className="px-6 py-4 text-foreground font-medium">
                {a.name}
                {a.isAdmin && (
                  <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-secondary/10 text-secondary">
                    Admin
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-muted-foreground">{a.email}</td>
              <td className="px-6 py-4">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    a.isBanned ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  }`}
                >
                  {a.isBanned ? "Banned" : "Active"}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                {a.isBanned ? (
                  <Button variant="outline" size="sm" onClick={() => onUnban(a.id)} disabled={isPending}>
                    Unban
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isPending}>
                        <Ban className="w-4 h-4 mr-1.5" /> Ban
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ban {a.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This immediately locks the account out of the app. It can be unbanned later from this page.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onBan(a.id)}>Ban account</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
