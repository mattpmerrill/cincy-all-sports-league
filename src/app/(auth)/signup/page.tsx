import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthDivider } from "@/features/auth/components/auth-divider";
import { GoogleButton } from "@/features/auth/components/google-button";
import { SignUpForm } from "@/features/auth/components/signup-form";
import { getCurrentUser } from "@/features/auth/guards";
import { safeNextPath } from "@/features/auth/safe-next";

export const metadata: Metadata = { title: "Create account" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), "/me");
  if (await getCurrentUser()) redirect(next);

  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Join the league"
      description="Create an account, then claim your team."
      footer={
        <>
          Already have an account?{" "}
          <Link href={loginHref} className="text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton next={next} label="Sign up with Google" />
      <AuthDivider />
      <SignUpForm next={next} />
    </AuthCard>
  );
}
