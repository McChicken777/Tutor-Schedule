import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useGetTeacherMe, useGetStudentDashboard, useGetStudentProfile } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LoadingScreen } from "@/components/LoadingScreen";
import { toast } from "@/hooks/use-toast";
import { describeError } from "@/lib/errors";
import { isStandalone } from "@/lib/pwa";
import { useSyncPushSubscription } from "@/hooks/use-push-notifications";

import Landing from "@/pages/public/Landing";
import SignInPage from "@/pages/public/SignIn";
import SignUpPage from "@/pages/public/SignUp";
import StudentDashboard from "@/pages/student/Dashboard";
import LinkTeacher from "@/pages/student/LinkTeacher";
import StudentBookings from "@/pages/student/Bookings";
import BookingDetail from "@/pages/student/BookingDetail";
import BookLesson from "@/pages/student/Book";
import StudentMessages from "@/pages/student/Messages";
import StudentHomework from "@/pages/student/Homework";

import TeacherSignIn from "@/pages/teacher/sign-in";
import TeacherSignUp from "@/pages/teacher/sign-up";
import TeacherOnboarding from "@/pages/teacher/onboarding";
import TeacherDashboard from "@/pages/teacher/Dashboard";
import TeacherBookings from "@/pages/teacher/Bookings";
import TeacherLessonTypes from "@/pages/teacher/LessonTypes";
import TeacherPackages from "@/pages/teacher/Packages";
import TeacherHomework from "@/pages/teacher/Homework";
import TeacherStudents from "@/pages/teacher/Students";
import TeacherMessages from "@/pages/teacher/Messages";
import TeacherAvailability from "@/pages/teacher/Availability";
import TeacherSettings from "@/pages/teacher/Settings";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminTestimonials from "@/pages/admin/Testimonials";
import AdminFaqs from "@/pages/admin/Faqs";
import AdminSettings from "@/pages/admin/Settings";
import AdminReports from "@/pages/admin/Reports";
import AdminAccounts from "@/pages/admin/Accounts";

import NotFound from "@/pages/not-found";

import StudentLayout from "@/components/layout/StudentLayout";
import TeacherLayout from "@/components/layout/TeacherLayout";
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
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
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
    logoBox: "h-14 mb-1",
    logoImage: "h-14 w-auto max-w-none",
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

// Transfers the device's push subscription to whoever is signed in now, so a
// second person signing in on a shared device stops receiving the first
// person's notifications.
function PushSubscriptionSync() {
  const { user, isLoaded } = useUser();
  useSyncPushSubscription(isLoaded ? user?.id ?? null : undefined);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      // Clerk briefly reports no user during its routine background session
      // check (e.g. whenever the tab regains focus) — ignore that blip
      // entirely rather than treating it as a sign-out. Only clear the cache
      // when we go from one real signed-in user straight to a *different*
      // real signed-in user (an actual account switch on a shared device);
      // otherwise a focus-triggered false "sign-out" wipes every cached
      // query and drops the whole app back to its loading screens.
      if (userId == null) return;
      if (prevUserIdRef.current != null && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// Signed-in users land on /dashboard, which forwards teachers and admins on to
// their own portals. Launched from the home screen the marketing page would be
// the wrong first screen — it should feel like an app, not a website — so a
// standalone launch goes straight to sign-in instead.
function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        {isStandalone() ? <Redirect to="/sign-in" /> : <Landing />}
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

function isBannedError(error: unknown): boolean {
  return (error as { status?: number; data?: { code?: string } } | null)?.data?.code === "BANNED";
}

function BannedScreen() {
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center text-center p-6 gap-4">
      <h1 className="text-2xl font-serif font-bold text-foreground">Your account has been suspended</h1>
      <p className="text-muted-foreground max-w-md">Contact support if you believe this is a mistake.</p>
      <Button onClick={() => signOut({ redirectUrl: basePath || "/" })}>Sign out</Button>
    </div>
  );
}

function StudentPortal({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <RequireStudentNotBanned>{children}</RequireStudentNotBanned>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function LinkTeacherGate() {
  return (
    <>
      <Show when="signed-in">
        <LinkTeacher />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function RequireStudentNotBanned({ children }: { children: React.ReactNode }) {
  const { data: teacher, isLoading: isTeacherLoading } = useGetTeacherMe();
  const { error } = useGetStudentDashboard();
  const { data: profile, isLoading: isProfileLoading } = useGetStudentProfile();

  if (isTeacherLoading || isProfileLoading) {
    return <LoadingScreen />;
  }
  if (teacher) {
    return <Redirect to={teacher.isAdmin ? "/admin" : "/teacher"} />;
  }
  if (isBannedError(error)) {
    return <BannedScreen />;
  }
  if (profile && profile.teacherId == null) {
    return <Redirect to="/link-teacher" />;
  }

  return <StudentLayout>{children}</StudentLayout>;
}

function RequireTeacherRow({ children }: { children: React.ReactNode }) {
  const { data: teacher, isLoading, error } = useGetTeacherMe();

  if (isLoading) {
    return <LoadingScreen />;
  }
  if (isBannedError(error)) {
    return <BannedScreen />;
  }
  if (!teacher) {
    if ((error as { status?: number } | null)?.status === 404) {
      return <Redirect to="/teacher/onboarding" />;
    }
    return <LoadingScreen />;
  }

  return <TeacherLayout>{children}</TeacherLayout>;
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

function RequireAdminRow({ children }: { children: React.ReactNode }) {
  const { data: teacher, isLoading, error } = useGetTeacherMe();

  if (isLoading) {
    return <LoadingScreen />;
  }
  if (isBannedError(error)) {
    return <BannedScreen />;
  }
  if (!teacher) {
    if ((error as { status?: number } | null)?.status === 404) {
      return <Redirect to="/teacher/onboarding" />;
    }
    return <LoadingScreen />;
  }
  if (!teacher.isAdmin) {
    return <Redirect to="/teacher" />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

function AdminPortal({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <RequireAdminRow>{children}</RequireAdminRow>
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
        <PushSubscriptionSync />
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
            <Route path="/teacher">
              <TeacherPortal><TeacherDashboard /></TeacherPortal>
            </Route>
            <Route path="/teacher/bookings">
              <TeacherPortal><TeacherBookings /></TeacherPortal>
            </Route>
            <Route path="/teacher/packages">
              <TeacherPortal><TeacherPackages /></TeacherPortal>
            </Route>
            <Route path="/teacher/lesson-types">
              <TeacherPortal><TeacherLessonTypes /></TeacherPortal>
            </Route>
            <Route path="/teacher/homework">
              <TeacherPortal><TeacherHomework /></TeacherPortal>
            </Route>
            <Route path="/teacher/students">
              <TeacherPortal><TeacherStudents /></TeacherPortal>
            </Route>
            <Route path="/teacher/messages">
              <TeacherPortal><TeacherMessages /></TeacherPortal>
            </Route>
            <Route path="/teacher/availability">
              <TeacherPortal><TeacherAvailability /></TeacherPortal>
            </Route>
            <Route path="/teacher/settings">
              <TeacherPortal><TeacherSettings /></TeacherPortal>
            </Route>

            {/* Admin Portal (Clerk + teacher-row + isAdmin gated) */}
            <Route path="/admin">
              <AdminPortal><AdminDashboard /></AdminPortal>
            </Route>
            <Route path="/admin/testimonials">
              <AdminPortal><AdminTestimonials /></AdminPortal>
            </Route>
            <Route path="/admin/faqs">
              <AdminPortal><AdminFaqs /></AdminPortal>
            </Route>
            <Route path="/admin/settings">
              <AdminPortal><AdminSettings /></AdminPortal>
            </Route>
            <Route path="/admin/reports">
              <AdminPortal><AdminReports /></AdminPortal>
            </Route>
            <Route path="/admin/accounts">
              <AdminPortal><AdminAccounts /></AdminPortal>
            </Route>

            <Route path="/link-teacher" component={LinkTeacherGate} />

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
