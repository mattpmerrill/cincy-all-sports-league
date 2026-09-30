import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSection } from "@/ui/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Cincy's All-Sports League collects, why, and how to have it removed.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 29, 2026">
      <LegalSection title="What this site is">
        <p>
          Cincy&apos;s All-Sports League is a private fantasy league site for a family and friends
          league. The standings, team rosters and rules are public. You need an account to claim a
          team.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <LegalList>
          <li>Your email address.</li>
          <li>
            Your display name. If you sign in with Google, this comes from your Google profile. If
            you sign up with email, it is the name you type in.
          </li>
          <li>Your profile photo, if you sign in with Google.</li>
          <li>Which team you claim, and any actions you take as an admin.</li>
        </LegalList>
        <p>
          Passwords are handled by Supabase Auth. This site never sees your password or stores it in
          plain text.
        </p>
      </LegalSection>

      <LegalSection title="How we use Google data">
        <p>
          When you sign in with Google, we ask only for your basic profile: name, email address and
          photo. We use them to create your account and show who you are in the league. We do not
          use them for anything else.
        </p>
        <p>
          We do not ask for or get access to your Gmail, Google Drive, contacts, calendar or any
          other Google data.
        </p>
      </LegalSection>

      <LegalSection title="What other people can see">
        <p>
          Your display name and photo show up on the public leaderboard next to the team you claim.
          Your email address is never shown publicly.
        </p>
      </LegalSection>

      <LegalSection title="Where your data lives">
        <LegalList>
          <li>Supabase stores the database and handles sign-in. It runs in the US.</li>
          <li>Vercel hosts the website.</li>
          <li>
            Game results come from ESPN&apos;s public data. We do not send any personal data to
            ESPN.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Push alerts">
        <p>
          If you turn on push alerts, we store your device&apos;s push address, the keys that
          encrypt alerts for it, and a short device name, such as &quot;iPhone&quot;. We never show
          any of it to anyone. We delete it when you turn alerts off, when you sign out on that
          device, and when your account is deleted. If a device stops accepting alerts, we delete it
          automatically.
        </p>
        <p>
          We also keep a short record of which alerts were sent, for 90 days, so none is sent twice.
        </p>
        <p>
          The text of an alert passes through Apple, Google, Mozilla or Microsoft, whichever runs
          the push service for your browser. It is encrypted on the way, so they can deliver it but
          not read it.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          We use only the sign-in cookies needed to keep you signed in. There are no ads and no
          analytics trackers. We do not sell or share your data.
        </p>
      </LegalSection>

      <LegalSection title="Deleting your account and data">
        <p>
          Ask the league commissioner (an admin) and your account will be removed. Removing an
          account also unlinks it from your team, so the team goes back to being unclaimed.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If this policy changes, we will update this page and the date at the top. Small fixes may
          not get a separate notice.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
