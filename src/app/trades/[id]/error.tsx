"use client";

import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { PageMain } from "@/ui/page";

export default function TradeListingError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageMain>
      <Alert variant="error">This trade didn&apos;t load. Try again in a moment.</Alert>
      <Button className="h-10 self-start" variant="outline" onClick={reset}>
        Try again
      </Button>
    </PageMain>
  );
}
