/** One-off: email every league member how to put the app on their phone's Home Screen. Modes: see announcement-runner.ts. */
import { HOME_SCREEN_SUBJECT } from "../src/features/announcements/email/home-screen-email";
import { renderHomeScreenEmail } from "../src/features/announcements/email/render";
import { runAnnouncement } from "./announcement-runner";

runAnnouncement({
  campaign: "announce-home-screen-2026-09-29",
  subject: HOME_SCREEN_SUBJECT,
  render: renderHomeScreenEmail,
});
