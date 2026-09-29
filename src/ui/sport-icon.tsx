import type { SportCode } from "@/domain/sports/sports";

type Glyph =
  "baseball" | "basketball" | "hockey" | "football" | "softball" | "tennis" | "soccer" | "golf";

/** Several sports share a ball; the label next to the icon always says which sport it is. */
const GLYPH: Record<SportCode, Glyph> = {
  mlb: "baseball",
  nba: "basketball",
  nhl: "hockey",
  ncaaf: "football",
  ncaab: "basketball",
  ncaasb: "softball",
  wta: "tennis",
  mls: "soccer",
  pga: "golf",
  wnba: "basketball",
  nfl: "football",
};

function Paths({ glyph }: { glyph: Glyph }) {
  switch (glyph) {
    case "baseball":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M6.2 5.6c2.6 2.9 2.6 9.9 0 12.8M17.8 5.6c-2.6 2.9-2.6 9.9 0 12.8" />
        </>
      );
    case "softball":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.4 3.6c3 3.6 3 13.2 0 16.8M15.6 3.6c-3 3.6-3 13.2 0 16.8" />
        </>
      );
    case "basketball":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.6 5.6c3.4 3.4 3.4 9.4 0 12.8M18.4 5.6c-3.4 3.4-3.4 9.4 0 12.8" />
        </>
      );
    case "football":
      return (
        <>
          <path d="M4.2 19.8C2.6 13.4 8.4 5.4 19.8 4.2c1.6 6.4-4.2 14.4-15.6 15.6Z" />
          <path d="m9.5 14.5 5-5M11 9.5l3.5 3.5M9.5 11l3.5 3.5" />
        </>
      );
    case "hockey":
      return (
        <>
          <path d="M5 3l6.5 13.5c.4.9 1.3 1.5 2.3 1.5H19" />
          <ellipse cx="17.5" cy="20" rx="3.5" ry="1.5" />
          <path d="M14 20v-1.6M21 20v-1.6" />
        </>
      );
    case "tennis":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M4.2 6.6c4.4 1.4 8.6 6.2 7.8 14.2M19.8 17.4c-4.4-1.4-8.6-6.2-7.8-14.2" />
        </>
      );
    case "soccer":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m12 8.2 3.6 2.6-1.4 4.2H9.8l-1.4-4.2L12 8.2ZM12 3v5.2M20.4 9.6l-4.8 1.2M17.6 19.2l-3.4-4.2M6.4 19.2l3.4-4.2M3.6 9.6l4.8 1.2" />
        </>
      );
    case "golf":
      return (
        <>
          <path d="M9 21V3l8 3.6L9 10" />
          <ellipse cx="9" cy="21" rx="6" ry="1.2" />
        </>
      );
  }
}

/** Decorative sport glyph (24px grid, 1.75 stroke). Pair it with the sport's name for screen readers. */
export function SportIcon({ sport, className }: { sport: SportCode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "size-5"}
    >
      <Paths glyph={GLYPH[sport]} />
    </svg>
  );
}
