import type { DigestMatchupBlock, DigestTeamRow } from "@/domain/digest";
import type { DigestEmailProps } from "./weekly-digest-email";
import { formatPoints, movementShort, movementText, signedPoints } from "./format";

const blockLines = (block: DigestMatchupBlock) =>
  [block.mine, ...block.others].flatMap((l) => (l ? [l.text] : []));

const line = (row: DigestTeamRow) => {
  const move = movementShort(row.movement);
  return `${row.rankLabel.padEnd(3)} ${row.teamName} (${formatPoints(row.total)} pts${move ? `, ${move}` : ""})`;
};

const mover = (row: DigestTeamRow) =>
  `${row.teamName}: ${movementText(row.movement)} to ${row.rankLabel}` +
  (row.pointsGained === null ? "" : `, ${signedPoints(row.pointsGained)} pts`);

/** The plain-text alternative: same facts, same order, no markup. */
export function renderDigestText(props: DigestEmailProps): string {
  const { digest } = props;
  const out: string[] = [
    `Cincy's All-Sports League: week of ${props.weekLabel}`,
    "",
    `Hi ${props.displayName},`,
    "",
    digest.hasHistory
      ? `Here is how the ${props.seasonName} standings look after the weekend.`
      : `Here is where the ${props.seasonName} standings stand right now.`,
  ];

  const matchups = digest.matchups;
  if (matchups?.state === "settling") {
    out.push("", "MATCHUPS", matchups.message, "", `${matchups.linkLabel}: ${props.siteUrl}/week`);
  } else if (matchups) {
    for (const block of [matchups.lastWeek, matchups.thisWeek]) {
      if (block) out.push("", block.title.toUpperCase(), ...blockLines(block));
    }
    if (matchups.recordText) out.push("", matchups.recordText);
    out.push("", `${matchups.linkLabel}: ${props.siteUrl}/week`);
  }

  if (digest.recipient) {
    const r = digest.recipient;
    out.push("", `YOUR TEAM: ${r.teamName}`);
    out.push(`Rank ${r.rankLabel}, ${formatPoints(r.total)} points`);
    out.push(
      r.pointsGained === null
        ? "Standings are just getting started"
        : `${signedPoints(r.pointsGained)} points this week, ${movementText(r.movement).toLowerCase()}`,
    );
  }

  out.push("", "TOP 5", ...digest.top5.map(line));
  if (digest.risers.length > 0) out.push("", "RISERS", ...digest.risers.map(mover));
  if (digest.fallers.length > 0) out.push("", "FALLERS", ...digest.fallers.map(mover));

  out.push(
    "",
    `See the full standings: ${props.siteUrl}`,
    "",
    "You are getting this because you have an account on Cincy's All-Sports League and weekly emails are on.",
    `Unsubscribe: ${props.unsubscribeUrl}`,
    `Email settings: ${props.siteUrl}/me`,
  );
  return out.join("\n");
}
