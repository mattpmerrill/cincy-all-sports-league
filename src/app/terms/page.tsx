import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/ui/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Plain terms for using Cincy's All-Sports League.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="September 28, 2026">
      <LegalSection title="The short version">
        <p>
          Cincy&apos;s All-Sports League is a free, casual site for a family and friends fantasy
          league. Use it for fun and be decent to each other.
        </p>
      </LegalSection>

      <LegalSection title="Using the site">
        <LegalList>
          <li>You use the site at your own risk.</li>
          <li>Be respectful. No harassment, spam or trying to break things.</li>
          <li>Claim only the team that is yours.</li>
          <li>Keep your sign-in details to yourself.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Scores and standings">
        <p>
          Scores come from public sports data and are calculated automatically. They can be late or
          wrong. Admins may correct results and standings at any time. Their call is final.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          Admins can remove accounts or team claims, for example if someone breaks these terms. You
          can ask an admin to delete your account at any time. See the{" "}
          <a href="/privacy" className="text-brand underline-offset-4 hover:underline">
            Privacy Policy
          </a>{" "}
          for details.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The site is provided as is, with no promises that it will always be up or error free. We
          are not liable for losses that come from using it.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update these terms. The date at the top shows the latest version. Using the site
          after a change means you accept it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
