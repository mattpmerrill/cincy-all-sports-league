import Link from "next/link";
import { PageHeader, PageMain } from "@/ui/page";

export default function TeamNotFound() {
  return (
    <PageMain>
      <PageHeader title="Team not found" description="No team in the league uses that link." />
      <Link
        href="/"
        className="self-start font-medium text-brand-bright underline-offset-4 hover:underline"
      >
        Back to standings
      </Link>
    </PageMain>
  );
}
