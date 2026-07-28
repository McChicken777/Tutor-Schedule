import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Landing from "@/pages/public/Landing";
import SignInPage from "@/pages/public/SignIn";
import SignUpPage from "@/pages/public/SignUp";
import StudentDashboard from "@/pages/student/Dashboard";
import StudentBookings from "@/pages/student/Bookings";
import BookingDetail from "@/pages/student/BookingDetail";
import BookLesson from "@/pages/student/Book";

import AdminLogin from "@/pages/admin/Login";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminBookings from "@/pages/admin/Bookings";
import AdminLessonTypes from "@/pages/admin/LessonTypes";
import AdminHomework from "@/pages/admin/Homework";
import AdminStudents from "@/pages/admin/Students";
import AdminTestimonials from "@/pages/admin/Testimonials";
import AdminFaqs from "@/pages/admin/Faqs";
import AdminSettings from "@/pages/admin/Settings";

import NotFound from "@/pages/not-found";

import StudentLayout from "@/components/layout/StudentLayout";
import AdminLayout from "@/components/layout/AdminLayout";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient();

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
    fontFamily: "'DM Sans', sans-serif",
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
          <Switch>
            {/* Public */}
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />

            {/* Admin (No Clerk) */}
            <Route path="/admin/login" component={AdminLogin} />
            <Route path="/admin">
              <AdminLayout><AdminDashboard /></AdminLayout>
            </Route>
            <Route path="/admin/bookings">
              <AdminLayout><AdminBookings /></AdminLayout>
            </Route>
            <Route path="/admin/lesson-types">
              <AdminLayout><AdminLessonTypes /></AdminLayout>
            </Route>
            <Route path="/admin/homework">
              <AdminLayout><AdminHomework /></AdminLayout>
            </Route>
            <Route path="/admin/students">
              <AdminLayout><AdminStudents /></AdminLayout>
            </Route>
            <Route path="/admin/testimonials">
              <AdminLayout><AdminTestimonials /></AdminLayout>
            </Route>
            <Route path="/admin/faqs">
              <AdminLayout><AdminFaqs /></AdminLayout>
            </Route>
            <Route path="/admin/settings">
              <AdminLayout><AdminSettings /></AdminLayout>
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

            <Route component={NotFound} />
          </Switch>
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
