"use client";

import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { PageMain } from "@/ui/page";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageMain>
      <Alert variant="error">We couldn&apos;t load your profile. Please try again.</Alert>
      <Button className="h-10 self-start" variant="outline" onClick={reset}>
        Try again
      </Button>
    </PageMain>
  );
}
