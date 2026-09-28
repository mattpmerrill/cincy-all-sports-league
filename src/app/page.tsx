import { Badge } from "@/ui/badge";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <Badge variant="outline" className="border-heat text-heat">
        Season 2026-27
      </Badge>
      <h1 className="text-5xl leading-none font-extrabold sm:text-7xl">
        Cincy&apos;s <span className="text-brand">All-Sports</span> League
      </h1>
      <p className="text-lg text-text-muted">Leaderboard coming soon</p>
    </main>
  );
}
