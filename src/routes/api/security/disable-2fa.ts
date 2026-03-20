import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/lib/auth/auth";

export const Route = createFileRoute("/api/security/disable-2fa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: { password?: string };
        try {
          body = await request.json();
        } catch {
          body = { password: "" };
        }

        const password = body.password || "";

        if (!password) {
          return new Response(
            JSON.stringify({ error: "Password is required to disable 2FA" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          await auth.api.disableTwoFactor({
            body: { password },
            headers: request.headers,
          });

          return new Response(
            JSON.stringify({ message: "2FA disabled successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          console.error("[2FA] Disable error:", error);
          return new Response(
            JSON.stringify({ error: "Failed to disable 2FA. Please check your password." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
