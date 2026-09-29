"use client";

import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="error">Something went wrong loading this admin page.</Alert>
      <Button className="h-10 self-start" variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
