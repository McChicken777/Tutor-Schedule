import { SignIn } from "@clerk/react";

export default function TeacherSignInPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-background px-4 bg-cover bg-center"
      style={{ backgroundImage: `url(${basePath}/auth-bg.jpg)` }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm"></div>
      <div className="relative z-10">
        <SignIn routing="path" path={`${basePath}/teacher/sign-in`} signUpUrl={`${basePath}/teacher/sign-up`} />
      </div>
    </div>
  );
}
