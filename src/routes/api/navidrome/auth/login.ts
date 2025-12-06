import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from '@/lib/config/config';

export const Route = createFileRoute("/api/navidrome/auth/login")({
  server: {
    handlers: {
  POST: async ({ request }) => {
    try {
      const config = getConfig();
      if (!config.navidromeUrl) {
        return new Response(JSON.stringify({ error: 'Navidrome not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Get request body
      const body = await request.text();

      // Forward to Navidrome
      const response = await fetch(`${config.navidromeUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const data = await response.json();

      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(JSON.stringify(data), {
        status: response.status,
        headers,
      });
    } catch (error: unknown) {
      console.error('Navidrome auth proxy failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
    },
  },
});
