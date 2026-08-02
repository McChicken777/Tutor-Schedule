import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useGetTeacherMe } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary";
import { toast } from "@/hooks/use-toast";
import { describeError } from "@/lib/errors";

import Landing from "@/pages/public/Landing";
import SignInPage from "@/pages/public/SignIn";
import SignUpPage from "@/pages/public/SignUp";
import StudentDashboard from "@/pages/student/Dashboard";
import StudentBookings from "@/pages/student/Bookings";
import BookingDetail from "@/pages/student/BookingDetail";
import BookLesson from "@/pages/student/Book";
import StudentMessages from "@/pages/student/Messages";
import StudentHomework from "@/pages/student/Homework";

import TeacherSignIn from "@/pages/teacher/sign-in";
import TeacherSignUp from "@/pages/teacher/sign-up";
import TeacherOnboarding from "@/pages/teacher/onboarding";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminBookings from "@/pages/admin/Bookings";
import AdminLessonTypes from "@/pages/admin/LessonTypes";
import AdminHomework from "@/pages/admin/Homework";
import AdminStudents from "@/pages/admin/Students";
import AdminTestimonials from "@/pages/admin/Testimonials";
import AdminFaqs from "@/pages/admin/Faqs";
import AdminSettings from "@/pages/admin/Settings";
import AdminMessages from "@/pages/admin/Messages";
import AdminAvailability from "@/pages/admin/Availability";

import NotFound from "@/pages/not-found";

import StudentLayout from "@/components/layout/StudentLayout";
import AdminLayout from "@/components/layout/AdminLayout";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Query/mutation failures are surfaced per-screen via ErrorState, but during
// development it's far quicker to see every failure in one place, tagged with
// the endpoint that produced it, than to hunt for the screen that swallowed it.
function logFailure(kind: string, error: unknown, key: unknown) {
  if (!import.meta.env.DEV) return;
  const status = (error as { status?: number } | null)?.status;
  console.error(
    `[${kind} failed]${status ? ` ${status}` : ""}`,
    Array.isArray(key) ? key[0] : key,
    error,
  );
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => logFailure("query", error, query.queryKey),
  }),
  mutationCache: new MutationCache({
    // Most call sites only pass onSuccess, so before this a failed save just
    // did nothing at all. Toasting centrally means every mutation reports its
    // failure, and individual screens only need custom handling when they want
    // something *more* than the message.
    onError: (error, _vars, _ctx, mutation) => {
      logFailure("mutation", error, mutation.options.mutationKey);
      const { title, message } = describeError(error);
      toast({ title, description: message, variant: "destructive" });
    },
  }),
});

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(14, 60%, 54%)",
    colorForeground: "hsl(30, 18%, 14%)",
    colorMutedForeground: "hsl(30, 15%, 45%)",
    colorDanger: "hsl(0, 70%, 50%)",
    colorBackground: "hsl(40, 33%, 98%)",
    colorInput: "hsl(40, 20%, 88%)",
    colorInputForeground: "hsl(30, 18%, 14%)",
    colorNeutral: "hsl(40, 20%, 88%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-background rounded-2xl w-[440px] max-w-full overflow-hidden border border-border shadow-md",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-serif font-bold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-background px-2",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function TeacherOnboardingGate() {
  return (
    <>
      <Show when="signed-in">
        <TeacherOnboarding />
      </Show>
      <Show when="signed-out">
        <Redirect to="/teacher/sign-in" />
      </Show>
    </>
  );
}

// Teachers share the same Clerk app/session as students, so an already
// signed-in user hitting these routes must never see the Clerk widget (it
// auto-redirects an authenticated session to the app's default landing,
// i.e. the student dashboard) — route them to onboarding instead, which
// itself forwards on to /admin if they already have a teacher row.
function TeacherSignInGate() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/teacher/onboarding" />
      </Show>
      <Show when="signed-out">
        <TeacherSignIn />
      </Show>
    </>
  );
}

function TeacherSignUpGate() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/teacher/onboarding" />
      </Show>
      <Show when="signed-out">
        <TeacherSignUp />
      </Show>
    </>
  );
}

function StudentPortal({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <StudentLayout>{children}</StudentLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function RequireTeacherRow({ children }: { children: React.ReactNode }) {
  const { data: teacher, isLoading, error } = useGetTeacherMe();

  if (isLoading) {
    return <div className="min-h-[100dvh] bg-background" />;
  }
  if (!teacher) {
    if ((error as { status?: number } | null)?.status === 404) {
      return <Redirect to="/teacher/onboarding" />;
    }
    return <div className="min-h-[100dvh] bg-background" />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

function TeacherPortal({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <RequireTeacherRow>{children}</RequireTeacherRow>
      </Show>
      <Show when="signed-out">
        <Redirect to="/teacher/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to manage your lessons",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get started with your Spanish journey",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <ErrorBoundary>
          <Switch>
            {/* Public */}
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />

            {/* Teacher registration */}
            <Route path="/teacher/sign-in/*?" component={TeacherSignInGate} />
            <Route path="/teacher/sign-up/*?" component={TeacherSignUpGate} />
            <Route path="/teacher/onboarding" component={TeacherOnboardingGate} />

            {/* Teacher Portal (Clerk + teacher-row gated) */}
            <Route path="/admin">
              <TeacherPortal><AdminDashboard /></TeacherPortal>
            </Route>
            <Route path="/admin/bookings">
              <TeacherPortal><AdminBookings /></TeacherPortal>
            </Route>
            <Route path="/admin/lesson-types">
              <TeacherPortal><AdminLessonTypes /></TeacherPortal>
            </Route>
            <Route path="/admin/homework">
              <TeacherPortal><AdminHomework /></TeacherPortal>
            </Route>
            <Route path="/admin/students">
              <TeacherPortal><AdminStudents /></TeacherPortal>
            </Route>
            <Route path="/admin/testimonials">
              <TeacherPortal><AdminTestimonials /></TeacherPortal>
            </Route>
            <Route path="/admin/faqs">
              <TeacherPortal><AdminFaqs /></TeacherPortal>
            </Route>
            <Route path="/admin/settings">
              <TeacherPortal><AdminSettings /></TeacherPortal>
            </Route>
            <Route path="/admin/messages">
              <TeacherPortal><AdminMessages /></TeacherPortal>
            </Route>
            <Route path="/admin/availability">
              <TeacherPortal><AdminAvailability /></TeacherPortal>
            </Route>

            {/* Student Portal */}
            <Route path="/dashboard">
              <StudentPortal><StudentDashboard /></StudentPortal>
            </Route>
            <Route path="/bookings">
              <StudentPortal><StudentBookings /></StudentPortal>
            </Route>
            <Route path="/bookings/:id">
              <StudentPortal><BookingDetail /></StudentPortal>
            </Route>
            <Route path="/book">
              <StudentPortal><BookLesson /></StudentPortal>
            </Route>
            <Route path="/messages">
              <StudentPortal><StudentMessages /></StudentPortal>
            </Route>
            <Route path="/homework">
              <StudentPortal><StudentHomework /></StudentPortal>
            </Route>
            <Route component={NotFound} />
          </Switch>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
