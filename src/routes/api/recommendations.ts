import { createServerFileRoute } from '@tanstack/react-start/server';
import { generateRecommendations } from '../../../lib/services/ollama';
import { auth } from '../../../lib/auth/auth';

export const Route = createServerFileRoute('/api/recommendations').methods({
  POST: async ({ request }) => {
    // Auth check (protected route)
    const session = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const { prompt, model } = await request.json() as { prompt: string; model?: string };
      if (!prompt) {
        return new Response(JSON.stringify({ error: 'Prompt required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const recommendations = await generateRecommendations({ prompt, model, userId: session.user.id });
      return new Response(JSON.stringify({ data: recommendations }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: unknown) {
      // Standardized error (AC3 stub)
      console.error('Recommendation generation failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: 'Failed to generate recommendations', details: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
});
