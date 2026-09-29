import { Skeleton } from "@/ui/skeleton";

export function LeaderboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading standings" className="flex flex-col gap-3">
      <Skeleton className="h-44 w-full rounded-3xl" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-[5.5rem] w-full rounded-2xl" />
      ))}
    </div>
  );
}
