import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { HeaderAccount } from "@/features/auth/components/header-account";
import { TradesBadge } from "@/features/trades/components/trades-badge";
import { publicEnv } from "@/lib/env";
import { AppShell } from "@/ui/app-shell";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Bold condensed face for headings and big numbers (ranks, points).
const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const env = publicEnv();

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: "Cincy's All-Sports League", template: "%s | Cincy's All-Sports League" },
  applicationName: "Cincy's All-Sports League",
  appleWebApp: { capable: true, title: "Cincy's League", statusBarStyle: "black-translucent" },
  description:
    "Live leaderboard for a 20-team, 11-sport family fantasy league, scored automatically from ESPN data.",
  ...(env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser chrome can't read CSS variables, so this mirrors --canvas in globals.css.
  themeColor: "#0a0a0b",
  colorScheme: "dark",
  // Lets the header and tab bar extend under the notch and home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} dark h-full`}>
      <body className="flex min-h-full flex-col">
        <AppShell headerAction={<HeaderAccount />} navBadges={{ "/trades": <TradesBadge /> }}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
