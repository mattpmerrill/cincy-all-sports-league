import { PageMain } from "@/ui/page";
import { Skeleton } from "@/ui/skeleton";

/** Fallback for any route without its own: a heading and a stack of blocks. */
export default function Loading() {
  return (
    <PageMain>
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3">
        <Skeleton className="h-40 w-full rounded-3xl" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </PageMain>
  );
}
