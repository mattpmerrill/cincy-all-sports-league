/** One-off: email every league member that push alerts are live. Modes: see announcement-runner.ts. */
import { PUSH_ALERTS_LAUNCH_SUBJECT } from "../src/features/announcements/email/push-alerts-launch-email";
import { renderPushAlertsLaunchEmail } from "../src/features/announcements/email/render";
import { runAnnouncement } from "./announcement-runner";

runAnnouncement({
  campaign: "announce-push-alerts-2026-09-30",
  subject: PUSH_ALERTS_LAUNCH_SUBJECT,
  render: renderPushAlertsLaunchEmail,
});
