import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { safeRedirectPath } from "~/lib/auth/safe-redirect";

export const Route = createFileRoute("/(auth)")({
  component: RouteComponent,
  // `?redirect=` = where a protected route bounced the visitor from (see loginRedirect).
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, search }) => {
    // Untrusted URL input: same-origin app paths only, else /dashboard (#341).
    const REDIRECT_URL = safeRedirectPath(search.redirect);
    if (context.user) {
      throw redirect({
        href: REDIRECT_URL,
      });
    }
    return {
      redirectUrl: REDIRECT_URL,
    };
  },
});

function RouteComponent() {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
}
