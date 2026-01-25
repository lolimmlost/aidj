/**
 * Remote Debug Logging Endpoint
 *
 * Receives logs from client and prints to server console.
 * Enable client-side with ?debug=true
 */

import { createFileRoute } from "@tanstack/react-router";

export async function POST({ request }: { request: Request }) {
  try {
    const { level, args, timestamp, userAgent, url } = await request.json();

    const time = new Date(timestamp).toLocaleTimeString();
    const prefix = {
      log: '📱',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
    }[level as string] || '📱';

    // Print to server console
    console.log(`${prefix} [${time}] [CLIENT] ${args.join(' ')}`);

    // Log extra context for errors
    if (level === 'error') {
      console.log(`   ↳ URL: ${url}`);
      console.log(`   ↳ UA: ${userAgent?.slice(0, 80)}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid log data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const Route = createFileRoute("/api/debug/logs")({
  server: {
    handlers: { POST },
  },
});
