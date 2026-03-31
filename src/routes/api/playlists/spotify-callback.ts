import { createFileRoute } from '@tanstack/react-router';

/**
 * Spotify OAuth callback — serves minimal HTML that:
 * 1. Extracts code/state from URL params
 * 2. POSTs them to /api/playlists/spotify-auth (inherits session cookies)
 * 3. Signals the opener window via postMessage
 * 4. Closes itself
 */
const GET = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error') || '';

  const html = `<!DOCTYPE html>
<html>
<head><title>Spotify Authorization</title></head>
<body>
<p id="status">Completing authorization...</p>
<script>
(async () => {
  const status = document.getElementById('status');
  const error = ${JSON.stringify(error)};

  if (error) {
    status.textContent = 'Authorization denied: ' + error;
    if (window.opener) {
      window.opener.postMessage({ type: 'spotify-oauth-complete', success: false, error }, '*');
    }
    setTimeout(() => window.close(), 2000);
    return;
  }

  try {
    const res = await fetch('/api/playlists/spotify-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code: ${JSON.stringify(code)}, state: ${JSON.stringify(state)} }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Authorization failed');
    }

    status.textContent = 'Connected! Closing...';
    if (window.opener) {
      window.opener.postMessage({ type: 'spotify-oauth-complete', success: true }, '*');
    }
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    if (window.opener) {
      window.opener.postMessage({ type: 'spotify-oauth-complete', success: false, error: err.message }, '*');
    }
  }

  setTimeout(() => window.close(), 1500);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
};

export const Route = createFileRoute('/api/playlists/spotify-callback')({
  server: { handlers: { GET } },
});
