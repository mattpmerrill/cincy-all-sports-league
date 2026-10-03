import { render } from "@react-email/components";
import { createElement } from "react";
import {
  FREE_AGENTS_NOTES,
  FREE_AGENTS_STEPS,
  FreeAgentsLaunchEmail,
  type FreeAgentsLaunchEmailProps,
} from "./free-agents-launch-email";
import {
  ANDROID_STEPS,
  HOME_SCREEN_TIPS,
  HomeScreenEmail,
  type HomeScreenEmailProps,
  IPHONE_STEPS,
  PUSH_ALERTS_NOTE,
} from "./home-screen-email";
import type { LaunchEmailProps, LaunchStep } from "./parts";
import {
  PRODUCT_UPDATE_FEATURES,
  PRODUCT_UPDATE_NOTES,
  ProductUpdateEmail,
  type ProductUpdateEmailProps,
  SHOUT_OUT,
} from "./product-update-email";
import {
  PUSH_ALERT_TYPES,
  PUSH_ALERTS_NOTES,
  PUSH_ALERTS_STEPS,
  PushAlertsLaunchEmail,
  type PushAlertsLaunchEmailProps,
} from "./push-alerts-launch-email";
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

const textSteps = (steps: readonly LaunchStep[]) =>
  steps.map((s, i) => `${i + 1}. ${s.title}. ${s.body}`);

/** Same content as the HTML, without the pictures: every step is written out in words. */
function renderHomeScreenText({ displayName, siteUrl }: HomeScreenEmailProps): string {
  return [
    `Hi ${displayName},`,
    "",
    "You can add Cincy's League to your phone's Home Screen so it opens full screen, like any other app, in one tap. It takes about a minute, and on an iPhone it is how you get push alerts.",
    "",
    "ON AN IPHONE (USE SAFARI)",
    ...textSteps(IPHONE_STEPS),
    "",
    "ON AN ANDROID PHONE (USE CHROME)",
    ...textSteps(ANDROID_STEPS),
    "",
    "TIPS AND TRICKS",
    ...HOME_SCREEN_TIPS.map((t) => `* ${t.lead} ${t.body}`),
    "",
    `${PUSH_ALERTS_NOTE.title.toUpperCase()}`,
    PUSH_ALERTS_NOTE.body,
    "",
    `Open Cincy's League: ${siteUrl}`,
    `Stuck? Ask in the league feed: ${siteUrl}/feed`,
    "",
    "You're getting this one-time announcement because you have an account with Cincy's All-Sports League.",
  ].join("\n");
}

export async function renderHomeScreenEmail(
  props: HomeScreenEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(HomeScreenEmail, props));
  return { html, text: renderHomeScreenText(props) };
}

/** Two numbered lists and lead-in notes, so this one does not use the generic launch text. */
function renderPushAlertsText({
  displayName,
  hasTeam,
  siteUrl,
}: PushAlertsLaunchEmailProps): string {
  return [
    `Hi ${displayName},`,
    "",
    "Big news: you can now get push alerts from the league on your phone or computer. Here's what you can get and how to turn them on.",
    "",
    "WHAT YOU CAN GET ALERTS FOR",
    ...textSteps(PUSH_ALERT_TYPES),
    "",
    "HOW TO TURN THEM ON",
    ...textSteps(PUSH_ALERTS_STEPS),
    "",
    "GOOD TO KNOW",
    ...PUSH_ALERTS_NOTES.map((n) => `* ${n.lead} ${n.body}`),
    ...(hasTeam
      ? []
      : ["", `You'll need your team first. Claim it on your profile: ${siteUrl}/me`]),
    "",
    `Turn on alerts: ${siteUrl}/me`,
    `Stuck? Ask in the league feed: ${siteUrl}/feed`,
    "",
    "You're getting this one-time announcement because you have an account with Cincy's All-Sports League.",
  ].join("\n");
}

export async function renderPushAlertsLaunchEmail(
  props: PushAlertsLaunchEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(PushAlertsLaunchEmail, props));
  return { html, text: renderPushAlertsText(props) };
}

/** A feature list, the roll call and notes, so this one does not use the generic launch text. */
function renderProductUpdateText({
  displayName,
  hasTeam,
  siteUrl,
}: ProductUpdateEmailProps): string {
  return [
    `Hi ${displayName},`,
    "",
    "We've been busy. Here's what's new in the app this week.",
    "",
    "WHAT'S NEW",
    ...textSteps(PRODUCT_UPDATE_FEATURES),
    "",
    "ROLL CALL",
    SHOUT_OUT.cheer,
    "",
    SHOUT_OUT.shame,
    "",
    "GOOD TO KNOW",
    ...PRODUCT_UPDATE_NOTES.map((n) => `* ${n.lead} ${n.body}`),
    ...(hasTeam
      ? []
      : [
          "",
          `You'll need your team to see it on the Week tab. Claim it on your profile: ${siteUrl}/me`,
        ]),
    "",
    `See this week: ${siteUrl}/week`,
    `Ideas or bugs? Drop them in the league feed: ${siteUrl}/feed`,
    "",
    "You're getting this one-time announcement because you have an account with Cincy's All-Sports League.",
  ].join("\n");
}

export async function renderProductUpdateEmail(
  props: ProductUpdateEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(ProductUpdateEmail, props));
  return { html, text: renderProductUpdateText(props) };
}
