import { PageLoader } from "@/ui/page-loader";
import { PageMain } from "@/ui/page";

/** Fallback for any route without its own. */
export default function Loading() {
  return (
    <PageMain>
      <PageLoader />
    </PageMain>
  );
}
