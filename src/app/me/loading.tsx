import { PageMain } from "@/ui/page";
import { Skeleton } from "@/ui/skeleton";

export default function Loading() {
  return (
    <PageMain aria-busy="true" aria-label="Loading your profile">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </PageMain>
  );
}
