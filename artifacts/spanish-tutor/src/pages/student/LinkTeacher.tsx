import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetStudentProfile,
  useLinkTeacherByCode,
  getGetStudentProfileQueryKey,
  getGetStudentDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeError } from "@/lib/errors";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function LinkTeacherPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [code, setCode] = useState("");

  const { data: profile, isLoading: isProfileLoading } = useGetStudentProfile();
  const linkMutation = useLinkTeacherByCode();

  useEffect(() => {
    if (profile && profile.teacherId != null) setLocation("/dashboard");
  }, [profile, setLocation]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    linkMutation.mutate({ data: { code: code.trim() } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetStudentProfileQueryKey() });
        qc.invalidateQueries({ queryKey: getGetStudentDashboardQueryKey() });
        setLocation("/dashboard");
      },
    });
  }

  if (isProfileLoading || (profile && profile.teacherId != null)) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card p-8 rounded-2xl shadow-lg border border-border">
        <div className="flex flex-col items-center mb-8">
          <img src={`${basePath}/logo.png`} alt="Logo" className="w-12 h-12 mb-4" />
          <h1 className="text-2xl font-serif font-bold text-foreground">Enter your teacher's code</h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Your tutor gave you a signup code — enter it here to connect your account to them.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. AB12CD34"
            autoFocus
            className="text-center tracking-widest uppercase"
          />
          <Button type="submit" className="w-full" disabled={linkMutation.isPending || !code.trim()}>
            {linkMutation.isPending ? "Connecting..." : "Continue"}
          </Button>
          {linkMutation.error && (
            <p className="text-sm text-destructive text-center">{describeError(linkMutation.error).message}</p>
          )}
        </form>
      </div>
    </div>
  );
}
