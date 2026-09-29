import Link from "next/link";
import { PageHeader, PageMain } from "@/ui/page";

export default function NotFound() {
  return (
    <PageMain>
      <PageHeader
        title="Page not found"
        description="That link doesn't lead anywhere in the league."
      />
      <Link
        href="/"
        className="self-start font-medium text-brand-bright underline-offset-4 hover:underline"
      >
        Back to standings
      </Link>
    </PageMain>
  );
}
