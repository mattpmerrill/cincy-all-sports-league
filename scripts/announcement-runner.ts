/**
 * The send loop every one-off announcement email shares. A script names its campaign, subject
 * and renderer, and gets these modes (`pnpm announce:<name> ...`):
 *
 *   (no flags)                       dry run: who would get it, nothing sent
 *   --only you@x.com                 send one test copy to that address
 *   --send                           send to everyone on the list
 *   --send --except a@x.com          ...minus people who already have it (a tester)
 *
 * Members who turned off the weekly email are skipped: they told the league not to email them.
 * Each send carries an idempotency key per member, so a re-run after a partial failure never
 * delivers twice (Resend remembers keys for 24 hours). Reads NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SECRET_KEY, NEXT_PUBLIC_SITE_URL, RESEND_API_KEY, DIGEST_FROM and the optional
 * DIGEST_REPLY_TO from the environment (pnpm loads .env.local via --env-file), and prints the
 * target project before sending anything.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../src/data/database.types";
import { createDigestRepository } from "../src/data/digest.repository";
import { createEmailSender } from "../src/integrations/resend";
import { maskEmail } from "../src/lib/mask-email";

/** What a renderer is told about one recipient. Emails that do not need a field ignore it. */
export type Recipient = {
  displayName: string;
  /** Whether the member owns a team this season; some emails tell the others to claim one. */
  hasTeam: boolean;
  siteUrl: string;
};

export type Announcement = {
  /** Idempotency key prefix. New for every announcement, so it never collides with an old one. */
  campaign: string;
  subject: string;
  render: (recipient: Recipient) => Promise<{ html: string; text: string }>;
};

// Resend's default limit is 2 requests a second.
const SPACING_MS = 600;

const env = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
    // Links and images must point at the live site, which .env.local does not name.
    NEXT_PUBLIC_SITE_URL: z.url().default("https://www.cincysports.xyz"),
    RESEND_API_KEY: z.string().min(1).optional(),
    DIGEST_FROM: z.string().min(3).default("Cincy's All-Sports League <league@cincysports.xyz>"),
    // Same variable and rule as the app: the From address cannot receive replies.
    DIGEST_REPLY_TO: z.preprocess(
      (v) => v || undefined,
      z.string().trim().pipe(z.email()).optional(),
    ),
  })
  .parse(process.env);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The value after a flag, validated as an email, or null when the flag is absent. */
function emailFlag(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? z.email().parse(args[index + 1]?.trim().toLowerCase()) : null;
}

async function run({ campaign, subject, render }: Announcement) {
  const args = process.argv.slice(2);
  const only = emailFlag(args, "--only");
  const except = emailFlag(args, "--except");
  const send = args.includes("--send");
  if (only && send) throw new Error("Use --only for a test or --send for everyone, not both.");

  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function ownerIds(): Promise<Set<string>> {
    const { data, error } = await db
      .from("fantasy_teams")
      .select("owner_id, seasons!inner(is_active)")
      .eq("seasons.is_active", true)
      .not("owner_id", "is", null);
    if (error) throw error;
    return new Set(data.flatMap((t) => (t.owner_id ? [t.owner_id] : [])));
  }

  console.log(`Project: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}  Site: ${siteUrl}`);
  const [members, owners] = await Promise.all([
    createDigestRepository(db).listConfirmedMembers(),
    ownerIds(),
  ]);
  const optedOut = members.filter((m) => !m.optedIn);
  const recipients = members.filter((m) => m.optedIn && m.email.toLowerCase() !== except);
  console.log(
    `${members.length} confirmed accounts, ${optedOut.length} opted out of league email, ` +
      `${recipients.length} to send (${recipients.filter((m) => owners.has(m.userId)).length} own a team).`,
  );

  const sender = createEmailSender({
    apiKey: env.RESEND_API_KEY,
    from: env.DIGEST_FROM,
    replyTo: env.DIGEST_REPLY_TO,
  });
  const deliver = async (to: string, recipient: Recipient, key: string) => {
    const { html, text } = await render(recipient);
    const result = await sender.sendEmail({ to, subject, html, text, idempotencyKey: key });
    console.log(`${maskEmail(to)}: ${result.ok ? `sent (${result.value.id})` : result.error.code}`);
    return result.ok;
  };

  if (only) {
    const member = members.find((m) => m.email.toLowerCase() === only);
    await deliver(
      only,
      {
        displayName: member?.displayName ?? "there",
        hasTeam: member ? owners.has(member.userId) : true,
        siteUrl,
      },
      // A fresh key per test, so a second look at a tweaked email is not deduplicated away.
      `${campaign}-test-${Date.now()}`,
    );
    return;
  }

  if (!send) {
    for (const m of recipients) {
      console.log(`  would send: ${maskEmail(m.email)}${owners.has(m.userId) ? "" : " (no team)"}`);
    }
    console.log("Dry run. Nothing sent. Add --send to send.");
    return;
  }

  let failed = 0;
  for (const m of recipients) {
    const ok = await deliver(
      m.email,
      { displayName: m.displayName, hasTeam: owners.has(m.userId), siteUrl },
      `${campaign}-${m.userId}`,
    );
    if (!ok) failed++;
    await sleep(SPACING_MS);
  }
  console.log(`Done: ${recipients.length - failed} sent, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

export function runAnnouncement(announcement: Announcement): void {
  run(announcement).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
