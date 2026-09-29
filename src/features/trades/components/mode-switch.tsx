import type { ListingKind } from "@/domain/trades";
import { SegmentedLinks } from "@/ui/segmented-links";

const MODES: { key: ListingKind; label: string; href: string }[] = [
  { key: "block", label: "Put players on the block", href: "/trades/new" },
  { key: "direct", label: "Offer a team a trade", href: "/trades/new?mode=direct" },
];

/** Block or direct: the mode lives in the URL, so the page stays server-driven. */
export function TradeModeSwitch({ mode }: { mode: ListingKind }) {
  return <SegmentedLinks label="Type of trade" items={MODES} current={mode} />;
}
