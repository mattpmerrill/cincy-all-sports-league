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

export type ProductUpdateEmailProps = LaunchEmailProps;

export const PRODUCT_UPDATE_SUBJECT = "New in Cincy's League: the Week tab, records and more";
export const PRODUCT_UPDATE_PREHEADER =
  "See every game your teams play this week, their records, and when you're facing a rival.";

/** What shipped. One source for the HTML and plain-text versions. */
export const PRODUCT_UPDATE_FEATURES: readonly LaunchStep[] = [
  {
    title: "The Week tab",
    body: "A new tab on the bottom bar shows every game this week: your teams' and everyone else's, day by day, with scores as they come in. Tap a team at the top to see only their games, or flip to next week.",
  },
  {
    title: "Team records",
    body: "Your teams and athletes now show their record, like 10-4 or 53-22-7 in hockey. Look for it under each pick on your team page and on every sport page.",
  },
  {
    title: "Head to head",
    body: "When one of your teams plays a team another league member owns, the game gets a Showdown badge on the Week tab. Bragging rights are on the line. (Psst: it's a hint at something bigger coming soon.)",
  },
  {
    title: "A new slide-out menu",
    body: "Tap your picture in the top corner and a menu slides in from the right, with big buttons for My team, your profile, Free agents and Rules. Rules moved off the bottom bar to make room for Week.",
  },
];

export const PRODUCT_UPDATE_NOTES: readonly { lead: string; body: string }[] = [
  {
    lead: "Don't see the Week tab?",
    body: "If the league is on your Home Screen, swipe the app closed and open it again. In a browser, refresh the page.",
  },
  {
    lead: "Records fill in over the day.",
    body: "They update with the scores every half hour. Sports that haven't started yet show a record once their season does.",
  },
];

/** The roll call. 20 of 21 teams are in the app; one is not, and the whole league will hear it. */
export const SHOUT_OUT = {
  cheer:
    "Huge congrats to everyone who signed up and claimed a team. 20 of our 21 teams are now in the app. You all showed up.",
  shame:
    "Well, almost all of you. Papi, this one's for you: you are the last and only league member not in the app. Everyone is waiting. Your team is right there, unclaimed and lonely. Sign up, claim it, and end the shame.",
};

export function ProductUpdateEmail({ displayName, hasTeam, siteUrl }: ProductUpdateEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{PRODUCT_UPDATE_SUBJECT}</title>
      </Head>
      <Preview>{PRODUCT_UPDATE_PREHEADER}</Preview>
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
              Your week, all in one place
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
              Every game, every record, and every time you&apos;re up against a rival.
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
              We&apos;ve been busy. Here&apos;s what&apos;s new in the app this week.
            </Text>

            <SectionTitle>What&apos;s new</SectionTitle>
            {PRODUCT_UPDATE_FEATURES.map((feature, i) => (
              <Step key={feature.title} n={i + 1} step={feature} />
            ))}

            <SectionTitle>Roll call</SectionTitle>
            <Text style={{ ...para, paddingTop: "4px" }}>{SHOUT_OUT.cheer}</Text>
            <Text
              style={{
                ...para,
                fontSize: "15px",
                marginTop: "14px",
                padding: "12px 14px",
                borderRadius: "8px",
                backgroundColor: palette.brandTint,
              }}
            >
              <strong>{SHOUT_OUT.shame}</strong>
            </Text>

            <SectionTitle>Good to know</SectionTitle>
            {PRODUCT_UPDATE_NOTES.map((note) => (
              <Note key={note.lead}>
                <strong>{note.lead}</strong> {note.body}
              </Note>
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
                You&apos;ll need your team to see it on the Week tab.{" "}
                <Link href={`${siteUrl}/me`} style={{ color: palette.brand, fontWeight: 700 }}>
                  Claim it on your profile
                </Link>{" "}
                and an admin will approve it.
              </Text>
            )}

            <Section style={{ paddingTop: "28px", textAlign: "center" }}>
              <Button
                href={`${siteUrl}/week`}
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
                See this week
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
              Ideas or bugs? Drop them in the{" "}
              <Link href={`${siteUrl}/feed`} style={{ color: palette.brand }}>
                league feed
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
