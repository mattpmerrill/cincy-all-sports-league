import { render } from "@react-email/components";
import { createElement } from "react";
import {
  LAUNCH_NOTES,
  LAUNCH_STEPS,
  TradesLaunchEmail,
  type TradesLaunchEmailProps,
} from "./trades-launch-email";

/** Plain text for clients that skip HTML, built from the same steps and notes. */
function renderText({ displayName, hasTeam, siteUrl }: TradesLaunchEmailProps): string {
  return [
    `Hi ${displayName},`,
    "",
    "Big news: you can now trade players with other teams, right in the app. Here's how it works.",
    "",
    "HOW TRADES WORK",
    ...LAUNCH_STEPS.map((s, i) => `${i + 1}. ${s.title}. ${s.body}`),
    "",
    "GOOD TO KNOW",
    ...LAUNCH_NOTES.map((n) => `* ${n}`),
    ...(hasTeam
      ? []
      : ["", `You'll need your team first. Claim it on your profile: ${siteUrl}/me`]),
    "",
    `Make your first trade: ${siteUrl}/trades`,
    `Full rules: ${siteUrl}/rules`,
    "",
    "You're getting this one-time announcement because you have an account with Cincy's All-Sports League.",
  ].join("\n");
}

export async function renderTradesLaunchEmail(
  props: TradesLaunchEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(TradesLaunchEmail, props));
  return { html, text: renderText(props) };
}
