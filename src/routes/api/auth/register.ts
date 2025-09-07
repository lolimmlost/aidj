import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth/auth";

export const ServerRoute = createServerFileRoute("/api/auth/register").methods({
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { name, email, password } = body;

      const regFn = (auth as any).api?.register ?? (auth as any).api?.signup ?? undefined;
      if (typeof regFn === "function") {
        const payload: any = { email, password };
        if (name) payload.name = name;
        const result = await regFn(payload);
        return new Response(JSON.stringify({ ok: true, result }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: "Registration API not available" }), {
        status: 501,
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      const message = (e as any)?.message ?? "Registration failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});