import { createFileRoute } from "@tanstack/react-router";
import { env } from "~/env/server";
import { getAuthOptions } from "~/lib/auth/auth-options";

/**
 * GET /api/auth-options — which sign-in methods this server offers.
 *
 * Deliberately unauthenticated: the login and two-factor pages need it before
 * there is a session. Returns booleans only (see getAuthOptions); nothing here
 * is a secret. Lives outside /api/auth/* so it doesn't collide with the
 * better-auth catch-all route.
 */
export const Route = createFileRoute("/api/auth-options")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(getAuthOptions(env)), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        }),
    },
  },
});
