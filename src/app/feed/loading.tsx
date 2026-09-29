import { PageLoader } from "@/ui/page-loader";
import { PageMain } from "@/ui/page";

export default function Loading() {
  return (
    <PageMain>
      <PageLoader label="Loading the feed" />
    </PageMain>
  );
}
