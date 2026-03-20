import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/lib/auth/auth";

export const Route = createFileRoute("/api/security/enable-2fa")({
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
            JSON.stringify({ error: "Password is required to enable 2FA" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const result = await auth.api.enableTwoFactor({
            body: { password },
            headers: request.headers,
          });

          if (!result) {
            return new Response(
              JSON.stringify({ error: "Failed to enable 2FA. Please check your password." }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response(
            JSON.stringify({
              message: "2FA enabled successfully",
              totpURI: result.totpURI,
              backupCodes: result.backupCodes || [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          console.error("[2FA] Enable error:", error);
          return new Response(
            JSON.stringify({ error: "Failed to enable 2FA" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
