"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/guards";
import {
  BLOCKING_LISTING_KEY,
  createListingSchema,
  formSports,
  listingIdSchema,
  makeOfferSchema,
  offerIdSchema,
  proposeDirectSchema,
} from "@/features/trades/schemas";
import { getTradesService } from "@/features/trades/trades.server";
import { revalidateLeague } from "@/lib/league-cache";
import {
  echoFields,
  formError,
  formSuccess,
  formText,
  zodFormError,
  type FormState,
} from "@/lib/form-state";

// Transport and auth for trades. Each action re-checks the session (a Server Action is a public
// POST endpoint, and the trade functions trust the actor id we pass them), validates the form,
// calls the service and turns its Result into a FormState.
//
// FormData fields:
//   sport      repeated, one per checked sport code ("nfl", "nba", ...)
//   note       optional text, up to 140 characters
//   teamId     the team a direct offer goes to
//   listingId  the listing to offer on or cancel
//   offerId    the offer to accept, reject or withdraw
// On error the note and the checked sports (comma-joined under `sports`) are echoed in
// `values`. An `already_listed` error also sets `data.blockingListingId` so the form can link to
// the listing that holds the player.

/** Every trade changes what /trades shows (lists, counts); the feed gets a post from each one. */
function revalidateTrades() {
  revalidatePath("/trades");
  revalidatePath("/trades/[id]", "page");
  revalidatePath("/feed");
}

function echoTrade(formData: FormData) {
  return { ...echoFields(formData, "note"), sports: formSports(formData).join(",") };
}

/** A service failure as form state; `already_listed` names the blocking listing for the UI. */
function tradeError(error: { message: string; listingId?: string }, echo: Record<string, string>) {
  return formError(
    error.message,
    undefined,
    echo,
    error.listingId ? { [BLOCKING_LISTING_KEY]: error.listingId } : undefined,
  );
}

export async function createListingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = createListingSchema.safeParse({ sports: formSports(formData) });
  const echo = echoTrade(formData);
  if (!parsed.success) return zodFormError(parsed.error, echo);

  const result = await (await getTradesService()).createListing(user.value, parsed.data.sports);
  if (!result.ok) return tradeError(result.error, echo);
  revalidateTrades();
  redirect(`/trades/${result.value.listingId}`);
}

export async function proposeDirectAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = proposeDirectSchema.safeParse({
    teamId: formText(formData, "teamId"),
    sports: formSports(formData),
    note: formText(formData, "note"),
  });
  const echo = echoTrade(formData);
  if (!parsed.success) return zodFormError(parsed.error, echo);

  const { teamId, sports, note } = parsed.data;
  const result = await (await getTradesService()).proposeDirect(user.value, teamId, sports, note);
  if (!result.ok) return tradeError(result.error, echo);
  revalidateTrades();
  redirect(`/trades/${result.value.listingId}`);
}

export async function makeOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = makeOfferSchema.safeParse({
    listingId: formText(formData, "listingId"),
    sports: formSports(formData),
    note: formText(formData, "note"),
  });
  const echo = echoTrade(formData);
  if (!parsed.success) return zodFormError(parsed.error, echo);

  const { listingId, sports, note } = parsed.data;
  const result = await (await getTradesService()).makeOffer(user.value, listingId, sports, note);
  if (!result.ok) return tradeError(result.error, echo);
  revalidateTrades();
  return formSuccess("Offer sent. The owner has 24 hours to answer.");
}

export async function withdrawOfferAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = offerIdSchema.safeParse({ offerId: formText(formData, "offerId") });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (await getTradesService()).withdrawOffer(user.value, parsed.data.offerId);
  revalidateTrades();
  if (!result.ok) return tradeError(result.error, {});
  return formSuccess("Offer withdrawn.");
}

export async function rejectOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = offerIdSchema.safeParse({ offerId: formText(formData, "offerId") });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (await getTradesService()).rejectOffer(user.value, parsed.data.offerId);
  revalidateTrades();
  if (!result.ok) return tradeError(result.error, {});
  return formSuccess("Offer rejected.");
}

export async function cancelListingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = listingIdSchema.safeParse({ listingId: formText(formData, "listingId") });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (await getTradesService()).cancelListing(user.value, parsed.data.listingId);
  revalidateTrades();
  if (!result.ok) return tradeError(result.error, {});
  return formSuccess("Listing cancelled.");
}

export async function acceptOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.ok) return formError(user.error.message);

  const parsed = offerIdSchema.safeParse({ offerId: formText(formData, "offerId") });
  if (!parsed.success) return zodFormError(parsed.error);

  const result = await (await getTradesService()).acceptOffer(user.value, parsed.data.offerId);
  revalidateTrades();
  if (!result.ok) return tradeError(result.error, {});

  // Picks and banked points changed: drop the cached league read model (the same call sync makes)
  // and the pages that were rendered from it. `[slug]` and `[code]` cover both teams and every
  // sport, so there is no need to work out which two.
  revalidateLeague();
  revalidatePath("/");
  revalidatePath("/teams/[slug]", "page");
  revalidatePath("/sports/[code]", "page");
  return formSuccess("Trade done. The players have changed teams.");
}
