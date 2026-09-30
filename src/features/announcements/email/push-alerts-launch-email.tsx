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

export type PushAlertsLaunchEmailProps = LaunchEmailProps;

export const PUSH_ALERTS_LAUNCH_SUBJECT = "Push alerts are live in Cincy's All-Sports League";
export const PUSH_ALERTS_LAUNCH_PREHEADER =
  "Trade offers, replies and your team's points, right on your phone. Turn them on in a minute.";

/** What can send an alert. One source for the HTML and plain-text versions. */
export const PUSH_ALERT_TYPES: readonly LaunchStep[] = [
  {
    title: "Trade offers and results",
    body: "A new offer on your listing, your offer accepted or rejected, or someone beating your offer.",
  },
  {
    title: "Replies and reactions",
    body: "Someone replies to your post or reacts to it in the feed.",
  },
  {
    title: "Your team's points",
    body: 'One alert when your team gains points after a score update, like "Chicago Bears +3".',
  },
];

export const PUSH_ALERTS_STEPS: readonly LaunchStep[] = [
  {
    title: "Open your profile",
    body: "Tap your avatar in the top corner and find Push alerts. If you own a team, you'll also see a Turn on alerts card on the Standings, Feed and Trades pages.",
  },
  {
    title: "Tap Turn on alerts",
    body: "Your phone or browser asks to allow notifications. Tap Allow. The first time can take a few seconds.",
  },
  {
    title: "Send yourself a test alert",
    body: "Tap Send a test alert on the same screen to see it land.",
  },
  {
    title: "Pick what you want",
    body: "Each type has its own switch. Turn off the ones you don't need.",
  },
];

export const PUSH_ALERTS_NOTES: readonly { lead: string; body: string }[] = [
  {
    lead: "On an iPhone, use the Home Screen version.",
    body: "Alerts only work for apps on your Home Screen. Add the league from Safari (Share, then Add to Home Screen), open it from there, sign in again, then turn alerts on. The steps are in the Home Screen email.",
  },
  {
    lead: "Android and computers should work too.",
    body: "It's been tested on iPhone and on Chrome for computers. If you try Android or another browser and it doesn't work, tell us in the feed.",
  },
  {
    lead: "Your emails haven't changed.",
    body: "Trade emails and the Monday recap work as before. Alerts are separate, so you can have both, either or neither.",
  },
  {
    lead: "You're in control.",
    body: "Turn a type off and it stops on every device. Signing out on a device stops alerts there.",
  },
  {
    lead: "Blocked by mistake?",
    body: "On an iPhone, go to Settings, Notifications, Cincy's League. In a browser, allow notifications for cincysports.xyz in the site settings.",
  },
];

export function PushAlertsLaunchEmail({
  displayName,
  hasTeam,
  siteUrl,
}: PushAlertsLaunchEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{PUSH_ALERTS_LAUNCH_SUBJECT}</title>
      </Head>
      <Preview>{PUSH_ALERTS_LAUNCH_PREHEADER}</Preview>
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
              Push alerts are live
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
              The league can now buzz your phone, even when the app is closed.
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
              Big news: you can now get push alerts from the league on your phone or computer.
              Here&apos;s what you can get and how to turn them on.
            </Text>

            <SectionTitle>What you can get alerts for</SectionTitle>
            {PUSH_ALERT_TYPES.map((type, i) => (
              <Step key={type.title} n={i + 1} step={type} />
            ))}

            <SectionTitle>How to turn them on</SectionTitle>
            {PUSH_ALERTS_STEPS.map((step, i) => (
              <Step key={step.title} n={i + 1} step={step} />
            ))}

            <SectionTitle>Good to know</SectionTitle>
            {PUSH_ALERTS_NOTES.map((note) => (
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
                You&apos;ll need your team first.{" "}
                <Link href={`${siteUrl}/me`} style={{ color: palette.brand, fontWeight: 700 }}>
                  Claim it on your profile
                </Link>{" "}
                and an admin will approve it.
              </Text>
            )}

            <Section style={{ paddingTop: "28px", textAlign: "center" }}>
              <Button
                href={`${siteUrl}/me`}
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
                Turn on alerts
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
              Stuck? Ask in the{" "}
              <Link href={`${siteUrl}/feed`} style={{ color: palette.brand }}>
                league feed
              </Link>{" "}
              and someone will help you out.
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
