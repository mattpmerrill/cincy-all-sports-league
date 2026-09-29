import { teamSlugParamSchema } from "./schemas";

/** The claim form on the profile page, with one team already picked. */
export function claimFormPath(teamSlug: string): string {
  return `/me?team=${encodeURIComponent(teamSlug)}`;
}

/**
 * Where a "claim this team" link sends a viewer. Visitors create an account first and land on the
 * claim form afterwards, so the team they tapped survives the sign-up round trip.
 */
export function claimTeamHref(teamSlug: string, signedIn: boolean): string {
  const form = claimFormPath(teamSlug);
  return signedIn ? form : `/signup?next=${encodeURIComponent(form)}`;
}

/** Claim links are pointless to someone who already owns a team: one team per member. */
export function viewerCanClaim(
  teams: readonly { owner: { id: string } | null }[],
  viewerId: string | null,
): boolean {
  return viewerId === null || !teams.some((team) => team.owner?.id === viewerId);
}

/** The team to pre-pick on the claim form from a `?team=` param, if it's one the viewer can request. */
export function preselectedTeamId(
  claimable: readonly { id: string; slug: string; requested: boolean }[],
  rawSlug: unknown,
): string | undefined {
  const slug = teamSlugParamSchema.safeParse(rawSlug);
  if (!slug.success) return undefined;
  return claimable.find((team) => team.slug === slug.data && !team.requested)?.id;
}
