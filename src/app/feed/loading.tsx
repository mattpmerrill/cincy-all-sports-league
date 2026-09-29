import { PageMain } from "@/ui/page";
import { Skeleton } from "@/ui/skeleton";

export default function Loading() {
  return (
    <PageMain>
      <div aria-busy="true" aria-label="Loading the feed" className="flex flex-col gap-3">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </PageMain>
  );
}
