/** One-off: email every league member the Week tab / records / menu update. Modes: see announcement-runner.ts. */
import { PRODUCT_UPDATE_SUBJECT } from "../src/features/announcements/email/product-update-email";
import { renderProductUpdateEmail } from "../src/features/announcements/email/render";
import { runAnnouncement } from "./announcement-runner";

runAnnouncement({
  campaign: "announce-product-update-2026-10-03",
  subject: PRODUCT_UPDATE_SUBJECT,
  render: renderProductUpdateEmail,
});
