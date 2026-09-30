/** One-off: email every league member that trades are live. Modes: see announcement-runner.ts. */
import { renderTradesLaunchEmail } from "../src/features/announcements/email/render";
import { TRADES_LAUNCH_SUBJECT } from "../src/features/announcements/email/trades-launch-email";
import { runAnnouncement } from "./announcement-runner";

runAnnouncement({
  campaign: "announce-trades-2026-09-29",
  subject: TRADES_LAUNCH_SUBJECT,
  render: renderTradesLaunchEmail,
});
