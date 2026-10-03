import { PageLoader } from "@/ui/page-loader";
import { PageMain } from "@/ui/page";

export default function Loading() {
  return (
    <PageMain width="wide">
      <PageLoader label="Loading the week" />
    </PageMain>
  );
}
