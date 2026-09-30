import { render } from "@react-email/components";
import { createElement } from "react";
import {
  FREE_AGENTS_NOTES,
  FREE_AGENTS_STEPS,
  FreeAgentsLaunchEmail,
  type FreeAgentsLaunchEmailProps,
} from "./free-agents-launch-email";
import type { LaunchEmailProps, LaunchStep } from "./parts";
import {
  LAUNCH_NOTES,
  LAUNCH_STEPS,
  TradesLaunchEmail,
  type TradesLaunchEmailProps,
} from "./trades-launch-email";

type LaunchText = {
  intro: string;
  stepsHeading: string;
  steps: readonly LaunchStep[];
  notes: readonly string[];
  /** The button's label and the site path it opens. */
  cta: { label: string; path: string };
};

/** Plain text for clients that skip HTML, built from the same steps and notes. */
function renderText(
  { displayName, hasTeam, siteUrl }: LaunchEmailProps,
  { intro, stepsHeading, steps, notes, cta }: LaunchText,
): string {
  return [
    `Hi ${displayName},`,
    "",
    intro,
    "",
    stepsHeading,
    ...steps.map((s, i) => `${i + 1}. ${s.title}. ${s.body}`),
    "",
    "GOOD TO KNOW",
    ...notes.map((n) => `* ${n}`),
    ...(hasTeam
      ? []
      : ["", `You'll need your team first. Claim it on your profile: ${siteUrl}/me`]),
    "",
    `${cta.label}: ${siteUrl}${cta.path}`,
    `Full rules: ${siteUrl}/rules`,
    "",
    "You're getting this one-time announcement because you have an account with Cincy's All-Sports League.",
  ].join("\n");
}

export async function renderTradesLaunchEmail(
  props: TradesLaunchEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(TradesLaunchEmail, props));
  const text = renderText(props, {
    intro:
      "Big news: you can now trade players with other teams, right in the app. Here's how it works.",
    stepsHeading: "HOW TRADES WORK",
    steps: LAUNCH_STEPS,
    notes: LAUNCH_NOTES,
    cta: { label: "Make your first trade", path: "/trades" },
  });
  return { html, text };
}

export async function renderFreeAgentsLaunchEmail(
  props: FreeAgentsLaunchEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(FreeAgentsLaunchEmail, props));
  const text = renderText(props, {
    intro:
      "Big news: you can now swap any of your picks for a free agent, right in the app. A free agent is any team or player nobody in the league owns. Drop the Texas Rangers, pick up the St. Louis Cardinals, done. Here's how it works.",
    stepsHeading: "HOW TO MAKE A MOVE",
    steps: FREE_AGENTS_STEPS,
    notes: FREE_AGENTS_NOTES,
    cta: { label: "Make your first move", path: "/free-agents" },
  });
  return { html, text };
}
