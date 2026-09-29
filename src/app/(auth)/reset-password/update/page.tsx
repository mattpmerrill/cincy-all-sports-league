import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { getCurrentUser } from "@/features/auth/guards";
import { Alert } from "@/ui/alert";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from the emailed link, which signs the visitor in via /auth/callback first. */
export default async function UpdatePasswordPage() {
  const user = await getCurrentUser();

  return (
    <AuthCard title="New password" description="Choose a password you haven't used here before.">
      {user ? (
        <UpdatePasswordForm />
      ) : (
        <>
          <Alert variant="error">
            This reset link has expired or was already used. Request a new one to continue.
          </Alert>
          <Link
            href="/reset-password"
            className="text-center text-sm text-brand underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </>
      )}
    </AuthCard>
  );
}
