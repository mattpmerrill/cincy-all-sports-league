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
import type { CSSProperties } from "react";
import { fonts, palette } from "@/ui/email/palette";

export type TradeEmailProps = {
  /** The subject line doubles as the heading. */
  heading: string;
  /** Paragraphs from the domain email builders. */
  lines: string[];
  viewUrl: string;
  /** Where a member turns trade emails off: their profile page. */
  settingsUrl: string;
  preheader: string;
};

const base: CSSProperties = { fontFamily: fonts.sans, color: palette.ink, margin: 0 };

export function TradeEmail(props: TradeEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{props.heading}</title>
      </Head>
      <Preview>{props.preheader}</Preview>
      <Body style={{ ...base, backgroundColor: palette.page, padding: "24px 12px" }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto" }}>
          <Section
            style={{
              backgroundColor: palette.brand,
              borderRadius: "12px 12px 0 0",
              padding: "22px 24px",
            }}
          >
            <Text
              style={{
                ...base,
                color: palette.onBrand,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Cincy&apos;s All-Sports League
            </Text>
            <Text
              style={{
                ...base,
                color: palette.onBrand,
                fontSize: "22px",
                fontWeight: 800,
                lineHeight: "28px",
                paddingTop: "6px",
              }}
            >
              {props.heading}
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: palette.card,
              borderRadius: "0 0 12px 12px",
              padding: "8px 24px 28px",
            }}
          >
            {props.lines.map((line) => (
              <Text
                key={line}
                style={{ ...base, fontSize: "16px", lineHeight: "24px", paddingTop: "12px" }}
              >
                {line}
              </Text>
            ))}
            <Section style={{ textAlign: "center", padding: "28px 0 8px" }}>
              <Button
                href={props.viewUrl}
                style={{
                  backgroundColor: palette.brand,
                  color: palette.onBrand,
                  fontFamily: fonts.sans,
                  fontSize: "16px",
                  fontWeight: 700,
                  borderRadius: "8px",
                  padding: "14px 28px",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                View trade
              </Button>
            </Section>
          </Section>

          <Section style={{ padding: "20px 12px 0" }}>
            <Text style={{ ...base, fontSize: "12px", lineHeight: "18px", color: palette.muted }}>
              You are getting this because you have an account on Cincy&apos;s All-Sports League and
              trade emails are on. You can turn them off on your{" "}
              <Link href={props.settingsUrl} style={{ color: palette.muted }}>
                profile page
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
