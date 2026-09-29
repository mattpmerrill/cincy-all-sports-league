import Link from "next/link";
import { PageHeader, PageMain } from "@/ui/page";

export default function TradeNotFound() {
  return (
    <PageMain>
      <PageHeader title="Trade not found" description="No trade in the league uses that link." />
      <Link
        href="/trades"
        className="self-start font-medium text-brand-bright underline-offset-4 hover:underline"
      >
        Back to trades
      </Link>
    </PageMain>
  );
}
