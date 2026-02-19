import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/lib/auth/auth";

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { name, email, password } = body;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (auth as any).signUp.email({
        email,
        password,
        name
      });

      // Create a per-user Navidrome account (non-blocking)
      try {
        const { createNavidromeUser } = await import('@/lib/services/navidrome-users');
        await createNavidromeUser(result.user.id, name, email);
        console.log(`🎵 Created Navidrome account for user ${name}`);
      } catch (navidromeError) {
        // Non-blocking: user will be provisioned lazily on first star/playlist action
        console.error('Failed to create Navidrome account (non-blocking):', navidromeError);
      }

      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Registration failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
    },
  },
});