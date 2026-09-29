import type { Metadata } from "next";
import Link from "next/link";
import { getUnsubscribeService } from "@/features/digest/unsubscribe.server";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/ui/card";
import { SubmitButton } from "@/ui/submit-button";
import { changeWeeklyEmailAction } from "./actions";

export const metadata: Metadata = {
  title: "Weekly email",
  // The token is in the URL: keep it out of Referer headers and search indexes.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Reads the token from the query string, so this page is always rendered per request.
export const dynamic = "force-dynamic";

export default async function UnsubscribeConfirmPage({
  searchParams,
}: PageProps<"/unsubscribe/confirm">) {
  const raw = (await searchParams).t;
  const token = typeof raw === "string" ? raw : "";
  const service = getUnsubscribeService();
  const status = token && service ? await service.status(token) : null;

  return (
    <main className="mx-auto flex w-full flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-3xl leading-none font-extrabold">
            {status?.ok
              ? status.value.optedIn
                ? "Weekly email"
                : "You are unsubscribed"
              : "Link problem"}
          </h1>
          <CardDescription>
            {status?.ok
              ? status.value.optedIn
                ? "You get the standings and biggest movers every Monday morning."
                : "You will not get the Monday standings email. You can turn it back on any time."
              : "This link is not valid or has been changed. Use the link from your latest email, or manage the email on your profile."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {status?.ok ? (
            <form action={changeWeeklyEmailAction} className="flex flex-col gap-3">
              <input type="hidden" name="t" value={token} />
              <input
                type="hidden"
                name="intent"
                value={status.value.optedIn ? "unsubscribe" : "resubscribe"}
              />
              <SubmitButton className="h-11" pendingLabel="Saving...">
                {status.value.optedIn ? "Unsubscribe" : "Resubscribe"}
              </SubmitButton>
            </form>
          ) : null}
          <Button asChild variant="outline" className="h-11">
            <Link href={status?.ok ? "/" : "/me"}>
              {status?.ok ? "Back to the standings" : "Open your profile"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
