import { render } from "@react-email/components";
import { createElement } from "react";
import { renderDigestText } from "./text";
import { WeeklyDigestEmail } from "./weekly-digest-email";
import type { DigestEmailProps } from "./weekly-digest-email";

export type { DigestEmailProps };

export async function renderDigestEmail(
  props: DigestEmailProps,
): Promise<{ html: string; text: string }> {
  const html = await render(createElement(WeeklyDigestEmail, props));
  return { html, text: renderDigestText(props) };
}
