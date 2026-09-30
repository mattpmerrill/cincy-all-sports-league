import { Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { fonts, palette } from "@/ui/email/palette";

/** Building blocks the launch announcements share, so each email only holds its own words. */

export type LaunchStep = { title: string; body: string };

export type LaunchEmailProps = {
  displayName: string;
  /** Members without a team are told to claim one first; every launch feature needs a team. */
  hasTeam: boolean;
  siteUrl: string;
};

export const base: CSSProperties = { fontFamily: fonts.sans, color: palette.ink, margin: 0 };
export const para: CSSProperties = { ...base, fontSize: "16px", lineHeight: "24px" };

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...base,
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: palette.brand,
        padding: "28px 0 8px",
      }}
    >
      {children}
    </Text>
  );
}

export function Step({ n, step }: { n: number; step: LaunchStep }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td style={{ width: "40px", verticalAlign: "top", paddingTop: "12px" }}>
            {/* A table cell, not a flex box: the one badge shape every mail client draws. */}
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      backgroundColor: palette.brand,
                      color: palette.onBrand,
                      fontFamily: fonts.sans,
                      fontSize: "14px",
                      fontWeight: 800,
                      textAlign: "center",
                      verticalAlign: "middle",
                    }}
                  >
                    {n}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
          <td style={{ verticalAlign: "top", paddingTop: "12px" }}>
            <Text style={{ ...base, fontSize: "16px", fontWeight: 700, lineHeight: "22px" }}>
              {step.title}
            </Text>
            <Text
              style={{
                ...base,
                fontSize: "15px",
                lineHeight: "22px",
                color: palette.muted,
                paddingTop: "2px",
              }}
            >
              {step.body}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <Text style={{ ...para, fontSize: "15px", paddingTop: "6px" }}>
      <span style={{ color: palette.brand, fontWeight: 800 }}>&#9679;</span>&nbsp;&nbsp;
      {children}
    </Text>
  );
}
