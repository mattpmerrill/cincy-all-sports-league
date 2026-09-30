/** One-off: email every league member that free agents are live. Modes: see announcement-runner.ts. */
import { FREE_AGENTS_LAUNCH_SUBJECT } from "../src/features/announcements/email/free-agents-launch-email";
import { renderFreeAgentsLaunchEmail } from "../src/features/announcements/email/render";
import { runAnnouncement } from "./announcement-runner";

runAnnouncement({
  campaign: "announce-free-agents-2026-09-29",
  subject: FREE_AGENTS_LAUNCH_SUBJECT,
  render: renderFreeAgentsLaunchEmail,
});
