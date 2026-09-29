import Link from "next/link";

const link = "text-brand-bright underline-offset-4 hover:underline";

/** Consent line shown under the sign-in and sign-up forms. */
export function LegalConsent() {
  return (
    <p className="text-center text-xs text-text-muted">
      By continuing you agree to the{" "}
      <Link href="/terms" className={link}>
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className={link}>
        Privacy Policy
      </Link>
      .
    </p>
  );
}
