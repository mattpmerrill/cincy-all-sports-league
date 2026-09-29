import Link from "next/link";
import { PageHeader, PageMain } from "@/ui/page";

export default function FreeAgentsSportNotFound() {
  return (
    <PageMain>
      <PageHeader title="Sport not found" description="The league has no sport at that link." />
      <Link
        href="/free-agents"
        className="self-start font-medium text-brand-bright underline-offset-4 hover:underline"
      >
        See all free agents
      </Link>
    </PageMain>
  );
}
