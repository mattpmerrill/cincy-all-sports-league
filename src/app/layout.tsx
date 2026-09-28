import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Bold condensed face for headings and big numbers (ranks, points).
const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Cincy's All-Sports League",
  description:
    "Live leaderboard for a 20-team, 11-sport family fantasy league, scored automatically from ESPN data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser chrome can't read CSS variables, so this mirrors --base in globals.css.
  themeColor: "#0b0f1a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} dark h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
