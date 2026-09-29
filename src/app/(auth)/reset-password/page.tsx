import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ResetRequestForm } from "@/features/auth/components/reset-request-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Reset password"
      description="Enter your email and we'll send you a link to choose a new password."
      footer={
        <Link href="/login" className="text-brand underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetRequestForm />
    </AuthCard>
  );
}
