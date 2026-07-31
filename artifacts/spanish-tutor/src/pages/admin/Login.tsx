import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { describeError } from "@/lib/errors";

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const loginMutation = useAdminLogin();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data: values }, {
      onSuccess: () => {
        setLocation("/admin");
      },
    });
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card p-8 rounded-2xl shadow-lg border border-border">
        <div className="flex flex-col items-center mb-8">
          <img src={`${basePath}/logo.svg`} alt="Logo" className="w-12 h-12 rounded mb-4" />
          <h1 className="text-2xl font-serif font-bold text-foreground">Admin Login</h1>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admin Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Enter password..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {loginMutation.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3" role="alert">
                <p className="text-sm font-medium text-destructive">
                  {loginMutation.error.status === 401
                    ? "That password didn't match."
                    : describeError(loginMutation.error).message}
                </p>
                {loginMutation.error.status !== 401 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    This isn't a wrong password — the server couldn't be reached or errored.
                  </p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Logging in..." : "Log in"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
