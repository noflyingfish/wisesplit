"use server";

import { clearGroupCookies } from "@/lib/auth";

/**
 * Server action wrapper so client components can end a member's session.
 *
 * The cookie logic itself lives in `lib/auth.ts`, right next to `setMemberCookie`,
 * so the path used to *delete* a cookie is always derived from the path used to
 * *set* it. This module exists only because a client component (UserMenu) cannot
 * import `cookies()` directly — it must go through a `"use server"` action.
 */
export async function clearGroupCookie(groupSlug: string) {
  await clearGroupCookies(groupSlug);
}
