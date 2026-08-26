import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetTeacherMe, useRegisterTeacher, getGetTeacherMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/errors";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function TeacherOnboardingPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: teacher, error, isLoading } = useGetTeacherMe();

  const registerMutation = useRegisterTeacher();

  useEffect(() => {
    if (teacher) setLocation("/teacher");
  }, [teacher, setLocation]);

  function handleRegister() {
    registerMutation.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetTeacherMeQueryKey() });
        setLocation("/teacher");
      },
    });
  }

  if (isLoading || teacher) {
    return <LoadingScreen />;
  }

  if (error && error.status !== 404) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
        <p className="text-sm text-destructive">{describeError(error).message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card p-8 rounded-2xl shadow-lg border border-border">
        <div className="flex flex-col items-center mb-8">
          <img src={`${basePath}/logo.png`} alt="Logo" className="w-12 h-12 mb-4" />
          <h1 className="text-2xl font-serif font-bold text-foreground">Set up your teacher account</h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            This Clerk account isn't linked to a teacher profile yet.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-accent/40 px-4 py-3 mb-5 text-sm text-muted-foreground">
          <strong className="text-foreground">This creates a tutor account</strong>, not a student one.
          If you're a student, you don't need to register here — go to{" "}
          <Link href="/sign-up" className="underline text-primary">student sign-up</Link>{" "}
          and enter your tutor's code instead.
        </div>

        <div className="space-y-3">
          <Button className="w-full" onClick={handleRegister} disabled={registerMutation.isPending}>
            {registerMutation.isPending ? "Registering..." : "Register as a new teacher"}
          </Button>
          {registerMutation.error && (
            <p className="text-sm text-destructive text-center">{describeError(registerMutation.error).message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
