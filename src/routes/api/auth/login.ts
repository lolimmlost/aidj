import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth/auth";

export const ServerRoute = createServerFileRoute("/api/auth/login").methods({
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { email, password } = body;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (auth as any).signIn.email({
        email,
        password
      });

      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      let message = "Login failed";
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === "string") {
        message = e;
      }
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});