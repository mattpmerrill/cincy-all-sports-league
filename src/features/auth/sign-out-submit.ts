/** What the sign-out form's submit event needs: enough to stop it, and to send it again. */
export type SignOutSubmitEvent = {
  preventDefault(): void;
  currentTarget: { requestSubmit(submitter?: HTMLElement): void };
  nativeEvent: Event;
};

/**
 * The `onSubmit` for a sign-out `<form action={signOutAction}>` that has a cleanup to run first.
 * The form keeps the plain server action, so with JavaScript off (or not loaded yet) it still
 * signs out as an ordinary form post. With JavaScript on, the first submit is held back, the
 * cleanup runs while the session is still valid, and the form is then submitted again, which
 * this handler lets through. The cleanup can never keep a member signed in, and a second click
 * while it runs does not start a second cleanup.
 *
 * Use it only on a form that stays mounted (the profile page's button). A menu item's form is
 * unmounted the moment the menu closes, and a detached form cannot be submitted again.
 */
export function createSignOutSubmitHandler(
  beforeSignOut: (() => Promise<void>) | undefined,
  onCleaning: (cleaning: boolean) => void = () => undefined,
) {
  let state: "idle" | "cleaning" | "done" = "idle";
  return async (event: SignOutSubmitEvent): Promise<void> => {
    if (!beforeSignOut || state === "done") return;
    event.preventDefault();
    if (state === "cleaning") return;
    state = "cleaning";
    onCleaning(true);
    // Read before the first await: React clears `currentTarget` once the handler yields.
    const form = event.currentTarget;
    const native = event.nativeEvent;
    const submitter = (native as { submitter?: HTMLElement | null }).submitter ?? undefined;
    try {
      await beforeSignOut();
    } catch {
      // Signing out matters more than the cleanup.
    }
    state = "done";
    form.requestSubmit(submitter);
  };
}
