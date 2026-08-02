import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useGetTeacherMe, useRegisterTeacher, useClaimTeacher, getGetTeacherMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { describeError } from "@/lib/errors";

const claimSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export default function TeacherOnboardingPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: teacher, error, isLoading } = useGetTeacherMe();
  const [mode, setMode] = useState<"choose" | "claim">("choose");

  const registerMutation = useRegisterTeacher();
  const claimMutation = useClaimTeacher();

  const form = useForm<z.infer<typeof claimSchema>>({
    resolver: zodResolver(claimSchema),
    defaultValues: { password: "" },
  });

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

  function handleClaim(values: z.infer<typeof claimSchema>) {
    claimMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetTeacherMeQueryKey() });
          setLocation("/teacher");
        },
      },
    );
  }

  if (isLoading || teacher) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background" />;
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
          <img src={`${basePath}/logo.svg`} alt="Logo" className="w-12 h-12 rounded mb-4" />
          <h1 className="text-2xl font-serif font-bold text-foreground">Set up your teacher account</h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            This Clerk account isn't linked to a teacher profile yet.
          </p>
        </div>

        {mode === "choose" && (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => setMode("claim")}>
              Claim my existing account
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleRegister}
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? "Registering..." : "Register as a new teacher"}
            </Button>
            {registerMutation.error && (
              <p className="text-sm text-destructive text-center">{describeError(registerMutation.error).message}</p>
            )}
          </div>
        )}

        {mode === "claim" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleClaim)} className="space-y-6">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Existing Admin Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter password..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {claimMutation.error && (
                <p className="text-sm text-destructive">
                  {claimMutation.error.status === 401
                    ? "That password didn't match."
                    : describeError(claimMutation.error).message}
                </p>
              )}
              <div className="space-y-3">
                <Button type="submit" className="w-full" disabled={claimMutation.isPending}>
                  {claimMutation.isPending ? "Claiming..." : "Claim account"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("choose")}>
                  Back
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
