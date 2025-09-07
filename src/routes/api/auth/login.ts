import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth/auth";

export const ServerRoute = createServerFileRoute("/api/auth/login").methods({
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { email, password } = body;

      // typed API interface
      interface AuthApi {
        login: (payload: { email: string; password: string }) => Promise<any>;
      }
      const api = (auth as unknown as { api?: Partial<AuthApi> }).api;
      const loginFn = api?.login;

      if (typeof loginFn === "function") {
        const payload: { email: string; password: string } = { email, password };
        const result = await loginFn(payload);
        return new Response(JSON.stringify({ ok: true, result }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: "Login API not available" }), {
        status: 501,
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