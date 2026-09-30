import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { fonts, palette } from "@/ui/email/palette";
import {
  base,
  type LaunchEmailProps,
  type LaunchStep,
  Note,
  para,
  SectionTitle,
  Step,
} from "./parts";

export type FreeAgentsLaunchEmailProps = LaunchEmailProps;

export const FREE_AGENTS_LAUNCH_SUBJECT = "Free agents are live in Cincy's All-Sports League";
export const FREE_AGENTS_LAUNCH_PREHEADER =
  "Drop a player and pick up one nobody owns, in the same sport. Here's how it works.";

/** One source for the steps, shared by the HTML and plain-text versions. */
export const FREE_AGENTS_STEPS: readonly LaunchStep[] = [
  {
    title: "Open Free agents",
    body: "Tap the Trades tab, then Free agents at the top. You can also tap Free agents on any sport page, or Drop / add on one of your picks on your team page.",
  },
  {
    title: "Pick a sport",
    body: "You'll see your current pick and every team or player nobody owns in that sport, best first. Type a name to search.",
  },
  {
    title: "Tap Add",
    body: "Find the one you want and tap Add next to it.",
  },
  {
    title: "Confirm the swap",
    body: 'A box asks "Drop this one, add that one?" and tells you what happens to your points. Tap Confirm and it\'s done on the spot.',
  },
  {
    title: "See it in the feed",
    body: "Every move shows up in the league feed and under Recent moves on the Free agents page.",
  },
];

export const FREE_AGENTS_NOTES: readonly string[] = [
  "It's one for one, in the same sport. You drop one pick and add one free agent, so you always keep one pick in every sport.",
  "Points your old pick already earned stay with your team. Your new pick only scores from the moment you add it.",
  "First come, first served. If someone grabs your target a second before you, you'll see a message and can pick another.",
  "Once a sport's season is over, moves in that sport are closed.",
  "Dropping a pick also cancels any trade listing of yours that includes it, and withdraws your offers that give it.",
  "There's no limit on how many moves you can make.",
];

export function FreeAgentsLaunchEmail({
  displayName,
  hasTeam,
  siteUrl,
}: FreeAgentsLaunchEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{FREE_AGENTS_LAUNCH_SUBJECT}</title>
      </Head>
      <Preview>{FREE_AGENTS_LAUNCH_PREHEADER}</Preview>
      <Body style={{ ...base, backgroundColor: palette.page, padding: "24px 12px" }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto" }}>
          {/* Type on the ink block, not a hosted image: it needs no asset shipped to the site. */}
          <Section
            style={{
              backgroundColor: palette.ink,
              borderRadius: "12px 12px 0 0",
              padding: "36px 24px 32px",
            }}
          >
            <Text
              style={{
                ...base,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: palette.line,
              }}
            >
              New in the league
            </Text>
            <Text
              style={{
                ...base,
                fontSize: "34px",
                fontWeight: 800,
                lineHeight: "40px",
                color: palette.onBrand,
                padding: "8px 0 0",
              }}
            >
              Free agents are live
            </Text>
            <Text
              style={{
                ...base,
                fontSize: "16px",
                lineHeight: "24px",
                color: palette.line,
                padding: "10px 0 0",
              }}
            >
              Drop one pick, pick up one nobody owns.
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: palette.card,
              borderRadius: "0 0 12px 12px",
              padding: "8px 24px 28px",
            }}
          >
            <Text style={{ ...para, paddingTop: "20px" }}>{`Hi ${displayName},`}</Text>
            <Text style={{ ...para, paddingTop: "8px" }}>
              Big news: you can now swap any of your picks for a free agent, right in the app. A
              free agent is any team or player nobody in the league owns. Drop the Texas Rangers,
              pick up the St. Louis Cardinals, done. Here&apos;s how it works.
            </Text>

            <SectionTitle>How to make a move</SectionTitle>
            {FREE_AGENTS_STEPS.map((step, i) => (
              <Step key={step.title} n={i + 1} step={step} />
            ))}

            <SectionTitle>Good to know</SectionTitle>
            {FREE_AGENTS_NOTES.map((note) => (
              <Note key={note}>{note}</Note>
            ))}

            {hasTeam ? null : (
              <Text
                style={{
                  ...para,
                  fontSize: "15px",
                  marginTop: "20px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  backgroundColor: palette.brandTint,
                }}
              >
                You&apos;ll need your team first.{" "}
                <Link href={`${siteUrl}/me`} style={{ color: palette.brand, fontWeight: 700 }}>
                  Claim it on your profile
                </Link>{" "}
                and an admin will approve it.
              </Text>
            )}

            <Section style={{ paddingTop: "28px", textAlign: "center" }}>
              <Button
                href={`${siteUrl}/free-agents`}
                style={{
                  backgroundColor: palette.brand,
                  color: palette.onBrand,
                  borderRadius: "8px",
                  padding: "14px 28px",
                  fontFamily: fonts.sans,
                  fontSize: "16px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Make your first move
              </Button>
            </Section>
            <Text
              style={{
                ...base,
                fontSize: "14px",
                color: palette.muted,
                textAlign: "center",
                paddingTop: "14px",
              }}
            >
              The full rules are on the{" "}
              <Link href={`${siteUrl}/rules`} style={{ color: palette.brand }}>
                Rules page
              </Link>
              .
            </Text>
          </Section>

          <Text
            style={{
              ...base,
              fontSize: "12px",
              lineHeight: "18px",
              color: palette.muted,
              textAlign: "center",
              padding: "16px 12px 0",
            }}
          >
            You&apos;re getting this one-time announcement because you have an account with
            Cincy&apos;s All-Sports League.{" "}
            <Link href={siteUrl} style={{ color: palette.muted }}>
              cincysports.xyz
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
