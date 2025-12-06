import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/lib/auth/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://dev3.appahouse.com",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const response = auth.handler(request);
        // Ensure CORS headers are set
        if (response instanceof Response) {
          Object.entries(CORS_HEADERS).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        }
        return response;
      },
      POST: ({ request }) => {
        const response = auth.handler(request);
        // Ensure CORS headers are set
        if (response instanceof Response) {
          Object.entries(CORS_HEADERS).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        }
        return response;
      },
      OPTIONS: () => {
        // Handle CORS preflight requests
        return new Response(null, {
          status: 200,
          headers: CORS_HEADERS,
        });
      },
    },
  },
});
