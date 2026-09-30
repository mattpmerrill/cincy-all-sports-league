import { BellRing, Share, SquarePlus } from "lucide-react";

/**
 * How to get alerts on an iPhone or iPad. iOS delivers them only to an app added to the Home
 * Screen, and that app has its own sign-in, so the last step says so. Inside another app's web
 * view (Facebook, Instagram) the Share sheet has no "Add to Home Screen", so those members are
 * told to open the page in Safari first.
 */
export function IosInstallHint({ inAppBrowser }: { inAppBrowser: boolean }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {inAppBrowser ? (
        <p className="font-medium">
          First, open this page in Safari. Tap the menu in this app (the three dots or the compass)
          and choose &quot;Open in Safari&quot;.
        </p>
      ) : null}
      <p className="text-text-muted">
        iPhone and iPad send alerts only to the app on your Home Screen. To add it:
      </p>
      <ol className="flex flex-col gap-2.5">
        <li className="flex items-start gap-3">
          <Share aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-bright" />
          <span>Tap the Share button in Safari (the square with an arrow pointing up).</span>
        </li>
        <li className="flex items-start gap-3">
          <SquarePlus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-bright" />
          <span>Choose &quot;Add to Home Screen&quot;.</span>
        </li>
        <li className="flex items-start gap-3">
          <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-bright" />
          <span>
            Open the app from your Home Screen, sign in, then turn alerts on. It asks you to sign in
            again because it keeps its own login.
          </span>
        </li>
      </ol>
    </div>
  );
}
