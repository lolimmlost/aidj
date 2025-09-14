import { createServerFileRoute } from "@tanstack/react-start/server";
import { auth } from "~/lib/auth/auth";

export const ServerRoute = createServerFileRoute("/api/auth/register").methods({
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { name, email, password } = body;
  
      // Define auth result type
      interface AuthResult {
        user: {
          id: string;
          email: string;
          name?: string;
        };
        session?: {
          id: string;
          expires: string;
        };
      }
  
      // Type the auth API for register/signup
      interface AuthApi {
        register?: (payload: { email: string; password: string; name?: string }) => Promise<AuthResult | null>;
        signup?: (payload: { email: string; password: string; name?: string }) => Promise<AuthResult | null>;
      }
  
      const api = (auth as { api?: Partial<AuthApi> }).api;
      const regFn = api?.register ?? api?.signup;
  
      if (typeof regFn === "function") {
        const payload: { email: string; password: string; name?: string } = { email, password };
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Registration failed";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});