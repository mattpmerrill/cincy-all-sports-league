import { Skeleton } from "@/ui/skeleton";

export function TeamSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading team" className="flex flex-col gap-4">
      <Skeleton className="h-52 w-full rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
