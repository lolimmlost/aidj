import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth/auth";

export const ServerRoute = createServerFileRoute("/api/auth/register").methods({
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
});