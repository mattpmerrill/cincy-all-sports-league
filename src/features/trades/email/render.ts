import { render } from "@react-email/components";
import { createElement } from "react";
import { TradeEmail } from "./trade-email";
import type { TradeEmailProps } from "./trade-email";

export type { TradeEmailProps };

/** The plain-text alternative: same facts, same order, no markup. */
export function renderTradeText(props: TradeEmailProps): string {
  return [
    `Cincy's All-Sports League: ${props.heading}`,
    "",
    ...props.lines.flatMap((line) => [line, ""]),
    `View trade: ${props.viewUrl}`,
    "",
    "You are getting this because you have an account on Cincy's All-Sports League and trade emails are on.",
    `Turn them off on your profile page: ${props.settingsUrl}`,
  ].join("\n");
}

export async function renderTradeEmail(
  props: TradeEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(TradeEmail, props));
  return { html, text: renderTradeText(props) };
}
