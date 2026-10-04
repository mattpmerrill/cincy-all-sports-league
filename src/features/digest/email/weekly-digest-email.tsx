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
import type { CSSProperties, ReactNode } from "react";
import type {
  DigestMatchupBlock,
  DigestMatchupLine,
  DigestMatchupsSection,
  DigestTeamRow,
  WeeklyDigest,
} from "@/domain/digest";
import { fonts, palette } from "@/ui/email/palette";
import { formatPoints, movementShort, movementText, signedPoints } from "./format";

export type DigestEmailProps = {
  displayName: string;
  /** "Sep 28": the Monday this digest covers. */
  weekLabel: string;
  seasonName: string;
  digest: WeeklyDigest;
  siteUrl: string;
  unsubscribeUrl: string;
  /** One line of preview text for the inbox list. */
  preheader: string;
};

const base: CSSProperties = { fontFamily: fonts.sans, color: palette.ink, margin: 0 };
const cell: CSSProperties = { padding: "10px 0", borderBottom: `1px solid ${palette.line}` };

const moveColor = (row: DigestTeamRow) =>
  row.movement.direction === "up"
    ? palette.up
    : row.movement.direction === "down"
      ? palette.down
      : palette.muted;

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
        padding: "28px 0 4px",
      }}
    >
      {children}
    </Text>
  );
}

function TeamBlock({ row }: { row: DigestTeamRow }) {
  const gained = row.pointsGained;
  return (
    <Section
      style={{
        backgroundColor: palette.brandTint,
        borderLeft: `4px solid ${palette.brand}`,
        borderRadius: "8px",
        padding: "16px 18px",
        marginTop: "6px",
      }}
    >
      <Text style={{ ...base, fontSize: "13px", color: palette.muted }}>Your team</Text>
      <Text style={{ ...base, fontSize: "20px", fontWeight: 700, padding: "2px 0 10px" }}>
        {row.teamName}
      </Text>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={{ width: "33%", verticalAlign: "top" }}>
              <Text style={{ ...base, fontSize: "28px", fontWeight: 800, lineHeight: "32px" }}>
                {row.rankLabel}
              </Text>
              <Text style={{ ...base, fontSize: "12px", color: palette.muted }}>Rank</Text>
            </td>
            <td style={{ width: "33%", verticalAlign: "top" }}>
              <Text style={{ ...base, fontSize: "28px", fontWeight: 800, lineHeight: "32px" }}>
                {formatPoints(row.total)}
              </Text>
              <Text style={{ ...base, fontSize: "12px", color: palette.muted }}>Points</Text>
            </td>
            {gained === null ? null : (
              <td style={{ width: "34%", verticalAlign: "top" }}>
                <Text
                  style={{
                    ...base,
                    fontSize: "28px",
                    fontWeight: 800,
                    lineHeight: "32px",
                    color: gained > 0 ? palette.up : palette.ink,
                  }}
                >
                  {signedPoints(gained)}
                </Text>
                <Text style={{ ...base, fontSize: "12px", color: palette.muted }}>This week</Text>
              </td>
            )}
          </tr>
        </tbody>
      </table>
      {row.movement.direction === "new" ? null : (
        <Text style={{ ...base, fontSize: "14px", color: moveColor(row), paddingTop: "10px" }}>
          {movementText(row.movement)} since last week
        </Text>
      )}
    </Section>
  );
}

const outcomeColor = (line: DigestMatchupLine) =>
  line.outcome === "win" ? palette.up : line.outcome === "loss" ? palette.down : palette.ink;

/** The recipient's own matchup: the same tinted card as "Your team", so it reads as theirs. */
function MyMatchup({ line }: { line: DigestMatchupLine }) {
  return (
    <Section
      style={{
        backgroundColor: palette.brandTint,
        borderLeft: `4px solid ${palette.brand}`,
        borderRadius: "8px",
        padding: "12px 16px",
        marginTop: "6px",
      }}
    >
      <Text
        style={{
          ...base,
          fontSize: "16px",
          fontWeight: 700,
          lineHeight: "22px",
          color: outcomeColor(line),
        }}
      >
        {line.text}
      </Text>
    </Section>
  );
}

function MatchupBlock({ block }: { block: DigestMatchupBlock }) {
  return (
    <>
      {block.mine ? <MyMatchup line={block.mine} /> : null}
      {block.others.length > 0 ? (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            {block.others.map((line) => (
              <tr key={line.text}>
                <td style={cell}>
                  <Text style={{ ...base, fontSize: "14px", lineHeight: "20px" }}>{line.text}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

function MatchupsSection({
  section,
  siteUrl,
}: {
  section: DigestMatchupsSection;
  siteUrl: string;
}) {
  const link = (
    <Text style={{ ...base, fontSize: "14px", fontWeight: 600, padding: "8px 0 14px" }}>
      <Link href={`${siteUrl}/week`} style={{ color: palette.brand }}>
        {section.linkLabel}
      </Link>
    </Text>
  );
  if (section.state === "settling") {
    return (
      <>
        <SectionTitle>Matchups</SectionTitle>
        <Text style={{ ...base, fontSize: "14px", lineHeight: "20px", paddingTop: "4px" }}>
          {section.message}
        </Text>
        {link}
      </>
    );
  }
  return (
    <>
      {section.lastWeek ? (
        <>
          <SectionTitle>{section.lastWeek.title}</SectionTitle>
          <MatchupBlock block={section.lastWeek} />
        </>
      ) : null}
      {section.thisWeek ? (
        <>
          <SectionTitle>{section.thisWeek.title}</SectionTitle>
          <MatchupBlock block={section.thisWeek} />
        </>
      ) : null}
      {section.recordText ? (
        <Text style={{ ...base, fontSize: "12px", color: palette.muted, paddingTop: "10px" }}>
          {section.recordText}
        </Text>
      ) : null}
      {link}
    </>
  );
}

function TopTable({ rows }: { rows: DigestTeamRow[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.teamId}>
            <td style={{ ...cell, width: "44px", verticalAlign: "middle" }}>
              <Text style={{ ...base, fontSize: "16px", fontWeight: 800, color: palette.brand }}>
                {row.rankLabel}
              </Text>
            </td>
            <td style={{ ...cell, verticalAlign: "middle" }}>
              <Text style={{ ...base, fontSize: "15px", fontWeight: 600 }}>{row.teamName}</Text>
              {row.ownerName ? (
                <Text style={{ ...base, fontSize: "12px", color: palette.muted }}>
                  {row.ownerName}
                </Text>
              ) : null}
            </td>
            <td style={{ ...cell, width: "48px", verticalAlign: "middle", textAlign: "right" }}>
              <Text style={{ ...base, fontSize: "13px", fontWeight: 700, color: moveColor(row) }}>
                {movementShort(row.movement)}
              </Text>
            </td>
            <td style={{ ...cell, width: "64px", verticalAlign: "middle", textAlign: "right" }}>
              <Text style={{ ...base, fontSize: "15px", fontWeight: 700 }}>
                {formatPoints(row.total)}
              </Text>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoverList({ rows }: { rows: DigestTeamRow[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.teamId}>
            <td style={{ ...cell, verticalAlign: "middle" }}>
              <Text style={{ ...base, fontSize: "15px", fontWeight: 600 }}>{row.teamName}</Text>
              <Text style={{ ...base, fontSize: "12px", color: moveColor(row) }}>
                {movementText(row.movement)} to {row.rankLabel}
              </Text>
            </td>
            <td style={{ ...cell, width: "80px", verticalAlign: "middle", textAlign: "right" }}>
              <Text style={{ ...base, fontSize: "14px", fontWeight: 700 }}>
                {row.pointsGained === null ? "" : `${signedPoints(row.pointsGained)} pts`}
              </Text>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WeeklyDigestEmail(props: DigestEmailProps) {
  const { digest } = props;
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{`Week of ${props.weekLabel}`}</title>
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
                fontSize: "24px",
                fontWeight: 800,
                paddingTop: "6px",
              }}
            >
              Week of {props.weekLabel}
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: palette.card,
              borderRadius: "0 0 12px 12px",
              padding: "8px 24px 28px",
            }}
          >
            <Text style={{ ...base, fontSize: "16px", lineHeight: "24px", paddingTop: "16px" }}>
              Hi {props.displayName},
            </Text>
            <Text style={{ ...base, fontSize: "16px", lineHeight: "24px", paddingTop: "8px" }}>
              {digest.hasHistory
                ? `Here is how the ${props.seasonName} standings look after the weekend.`
                : `Here is where the ${props.seasonName} standings stand right now.`}
            </Text>

            {digest.matchups ? (
              <MatchupsSection section={digest.matchups} siteUrl={props.siteUrl} />
            ) : null}

            {digest.recipient ? <TeamBlock row={digest.recipient} /> : null}

            <SectionTitle>Top 5</SectionTitle>
            <TopTable rows={digest.top5} />

            {digest.risers.length > 0 ? (
              <>
                <SectionTitle>Risers</SectionTitle>
                <MoverList rows={digest.risers} />
              </>
            ) : null}
            {digest.fallers.length > 0 ? (
              <>
                <SectionTitle>Fallers</SectionTitle>
                <MoverList rows={digest.fallers} />
              </>
            ) : null}

            <Section style={{ textAlign: "center", padding: "32px 0 8px" }}>
              <Button
                href={props.siteUrl}
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
                See the full standings
              </Button>
            </Section>
          </Section>

          <Section style={{ padding: "20px 12px 0" }}>
            <Text style={{ ...base, fontSize: "12px", lineHeight: "18px", color: palette.muted }}>
              You are getting this because you have an account on Cincy&apos;s All-Sports League and
              weekly emails are on. It goes out every Monday morning.
            </Text>
            <Text style={{ ...base, fontSize: "12px", lineHeight: "18px", color: palette.muted }}>
              <Link href={props.unsubscribeUrl} style={{ color: palette.muted }}>
                Unsubscribe
              </Link>
              {" · "}
              <Link href={`${props.siteUrl}/me`} style={{ color: palette.muted }}>
                Email settings
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
