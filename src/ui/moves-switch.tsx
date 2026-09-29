import { SegmentedLinks } from "@/ui/segmented-links";

const AREAS = [
  { key: "trades", label: "Trades", href: "/trades" },
  { key: "free-agents", label: "Free agents", href: "/free-agents" },
] as const;

/**
 * The Trades tab covers both ways to change a pick, so its two landing pages open with this
 * switch. It sits beside `nav-links` because both know the routes of that tab.
 */
export function MovesSwitch({ current }: { current: (typeof AREAS)[number]["key"] }) {
  return <SegmentedLinks label="Trades or free agents" items={AREAS} current={current} />;
}
