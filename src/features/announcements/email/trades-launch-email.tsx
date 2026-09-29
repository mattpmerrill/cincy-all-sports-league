import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { fonts, palette } from "@/ui/email/palette";

export type TradesLaunchEmailProps = {
  displayName: string;
  /** Members without a team are told to claim one first; trading needs a team. */
  hasTeam: boolean;
  siteUrl: string;
};

export const TRADES_LAUNCH_SUBJECT = "Trades are live in Cincy's All-Sports League";
export const TRADES_LAUNCH_PREHEADER =
  "Put players on the block, send offers and swap picks. Here's how it works.";

/** The banner lives on the site (public/email): email clients only show hosted images. */
export const bannerUrl = (siteUrl: string) => `${siteUrl}/email/trades-live.gif`;

export type LaunchStep = { title: string; body: string };

/** One source for the steps, shared by the HTML and plain-text versions. */
export const LAUNCH_STEPS: readonly LaunchStep[] = [
  {
    title: "Put players on the trading block",
    body: "Pick any of your players and every owner in the league can make you an offer.",
  },
  {
    title: "Or go straight to a team",
    body: "Send a direct offer: your player for theirs.",
  },
  {
    title: "Same sport, one for one",
    body: "An NFL team only trades for an NFL team, so everyone keeps one pick in every sport. You can bundle a few sports into one deal, like NFL for NFL plus NBA for NBA.",
  },
  {
    title: "24 hours to haggle",
    body: "Every listing stays open for a day, and other owners can jump in with a better offer, even on a direct one.",
  },
  {
    title: "The owner decides",
    body: "Accept any offer before the clock runs out and the players switch teams on the spot. Confetti included.",
  },
];

export const LAUNCH_NOTES: readonly string[] = [
  "Points your player already earned stay with your team. The new team only scores from the trade on.",
  "Once a sport's season is over, those players are locked in.",
  "Every offer and every done deal shows up in the league feed, so the whole family can weigh in.",
  "A red number on the Trades tab means offers are waiting on you. You'll also get an email, which you can turn off on your profile.",
];

const base: CSSProperties = { fontFamily: fonts.sans, color: palette.ink, margin: 0 };
const para: CSSProperties = { ...base, fontSize: "16px", lineHeight: "24px" };

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...base,
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: palette.brand,
        padding: "28px 0 8px",
      }}
    >
      {children}
    </Text>
  );
}

function Step({ n, step }: { n: number; step: LaunchStep }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td style={{ width: "40px", verticalAlign: "top", paddingTop: "12px" }}>
            {/* A table cell, not a flex box: the one badge shape every mail client draws. */}
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      backgroundColor: palette.brand,
                      color: palette.onBrand,
                      fontFamily: fonts.sans,
                      fontSize: "14px",
                      fontWeight: 800,
                      textAlign: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    {n}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
          <td style={{ verticalAlign: "top", paddingTop: "12px" }}>
            <Text style={{ ...base, fontSize: "16px", fontWeight: 700, lineHeight: "22px" }}>
              {step.title}
            </Text>
            <Text
              style={{
                ...base,
                fontSize: "15px",
                lineHeight: "22px",
                color: palette.muted,
                paddingTop: "2px",
              }}
            >
              {step.body}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function TradesLaunchEmail({ displayName, hasTeam, siteUrl }: TradesLaunchEmailProps) {
  const tradesUrl = `${siteUrl}/trades`;
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{TRADES_LAUNCH_SUBJECT}</title>
      </Head>
      <Preview>{TRADES_LAUNCH_PREHEADER}</Preview>
      <Body style={{ ...base, backgroundColor: palette.page, padding: "24px 12px" }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto" }}>
          <Section style={{ backgroundColor: palette.ink, borderRadius: "12px 12px 0 0" }}>
            <Img
              src={bannerUrl(siteUrl)}
              width="600"
              height="260"
              alt="Confetti falling around the words Trades are live"
              style={{
                display: "block",
                width: "100%",
                maxWidth: "600px",
                height: "auto",
                borderRadius: "12px 12px 0 0",
              }}
            />
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
              Big news: you can now trade players with other teams, right in the app. Here&apos;s
              how it works.
            </Text>

            <SectionTitle>How trades work</SectionTitle>
            {LAUNCH_STEPS.map((step, i) => (
              <Step key={step.title} n={i + 1} step={step} />
            ))}

            <SectionTitle>Good to know</SectionTitle>
            {LAUNCH_NOTES.map((note) => (
              <Text key={note} style={{ ...para, fontSize: "15px", paddingTop: "6px" }}>
                <span style={{ color: palette.brand, fontWeight: 800 }}>&#9679;</span>&nbsp;&nbsp;
                {note}
              </Text>
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
                href={tradesUrl}
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
                Make your first trade
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
