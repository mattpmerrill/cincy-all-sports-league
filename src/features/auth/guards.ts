import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAuthService } from "./auth.server";
import type { AuthedUser, ForbiddenError, UnauthenticatedError } from "./auth.service";
import type { Result } from "@/lib/result";
import { safeNextPath } from "./safe-next";

/** For Server Actions and route handlers: typed results, the caller decides the response. */
export async function requireUser(): Promise<Result<AuthedUser, UnauthenticatedError>> {
  return (await getAuthService()).requireUser();
}

export async function requireAdmin(): Promise<Result<AuthedUser, ForbiddenError>> {
  return (await getAuthService()).requireAdmin();
}

/** The signed-in user or null, for pages that render differently when signed out. */
export async function getCurrentUser(): Promise<AuthedUser | null> {
  return (await getAuthService()).getCurrentUser();
}

/** For pages: send signed-out visitors to sign in and bring them back afterwards. */
export async function requireUserOrRedirect(returnTo: string): Promise<AuthedUser> {
  const result = await requireUser();
  if (!result.ok) redirect(`/login?next=${encodeURIComponent(safeNextPath(returnTo))}`);
  return result.value;
}

/** For admin pages: signed-out visitors sign in; signed-in non-admins get a 404, not a hint. */
export async function requireAdminOrNotFound(returnTo: string): Promise<AuthedUser> {
  const result = await requireAdmin();
  if (result.ok) return result.value;
  if (result.error.code === "unauthenticated") {
    redirect(`/login?next=${encodeURIComponent(safeNextPath(returnTo))}`);
  }
  notFound();
}
