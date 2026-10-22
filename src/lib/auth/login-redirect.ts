import { redirect, type ParsedLocation } from "@tanstack/react-router";

/**
 * Bounce a logged-out visitor to the login page, remembering where they were going so
 * login can send them back there (#341). Use in a route's `beforeLoad`:
 *
 *   beforeLoad: async ({ context, location }) => {
 *     if (!context.user) throw loginRedirect(location);
 *   }
 *
 * The (auth) layout validates the value with safeRedirectPath before using it.
 */
export function loginRedirect(location: ParsedLocation) {
  return redirect({ to: "/login", search: { redirect: location.href } });
}
