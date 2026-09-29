import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthDivider } from "@/features/auth/components/auth-divider";
import { GoogleButton } from "@/features/auth/components/google-button";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentUser } from "@/features/auth/guards";
import { LegalConsent } from "@/features/auth/components/legal-consent";
import { safeNextPath } from "@/features/auth/safe-next";
import { Alert } from "@/ui/alert";

export const metadata: Metadata = { title: "Sign in" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), "/");
  if (await getCurrentUser()) redirect(next);

  const callbackFailed = first(params.error) === "callback";
  const signUpHref = next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back to the league."
      footer={
        <>
          New here?{" "}
          <Link href={signUpHref} className="text-brand underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {callbackFailed ? (
        <Alert variant="error">
          That sign-in link didn&apos;t work. It may have expired, or it was opened in a different
          browser. Please try again.
        </Alert>
      ) : null}
      <GoogleButton next={next} label="Continue with Google" />
      <AuthDivider />
      <LoginForm next={next} />
      <LegalConsent />
    </AuthCard>
  );
}
