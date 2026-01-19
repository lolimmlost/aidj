import { createFileRoute } from "@tanstack/react-router";
import { auth } from "../../../../lib/auth/auth";
import { updateCollaboratorPresence, checkCollaboratorRole } from "../../../../lib/services/collaborative-playlists";

// Store active connections per playlist
const playlistConnections = new Map<string, Map<string, { controller: ReadableStreamDefaultController; userId: string }>>();

// Event types for real-time updates
export type CollaborativePlaylistEvent =
  | { type: "suggestion_added"; data: { suggestion: Record<string, unknown> } }
  | { type: "suggestion_voted"; data: { suggestionId: string; score: number; upvotes: number; downvotes: number } }
  | { type: "suggestion_approved"; data: { suggestionId: string; song: Record<string, unknown> } }
  | { type: "suggestion_rejected"; data: { suggestionId: string; reason?: string } }
  | { type: "suggestion_withdrawn"; data: { suggestionId: string } }
  | { type: "collaborator_joined"; data: { userId: string; name: string; role: string } }
  | { type: "collaborator_left"; data: { userId: string } }
  | { type: "collaborator_presence"; data: { userId: string; isOnline: boolean } }
  | { type: "playlist_updated"; data: { changes: Record<string, unknown> } }
  | { type: "ping"; data: { timestamp: number } };

/**
 * Broadcast event to all connected clients for a playlist
 */
export function broadcastToPlaylist(playlistId: string, event: CollaborativePlaylistEvent, excludeUserId?: string): void {
  const connections = playlistConnections.get(playlistId);
  if (!connections) return;

  const eventData = `data: ${JSON.stringify(event)}\n\n`;

  for (const [connectionId, { controller, userId }] of connections) {
    if (excludeUserId && userId === excludeUserId) continue;

    try {
      controller.enqueue(new TextEncoder().encode(eventData));
    } catch (error) {
      // Connection may be closed
      console.error(`Failed to send event to ${connectionId}:`, error);
      connections.delete(connectionId);
    }
  }
}

// GET /api/playlists/:id/events - SSE endpoint for real-time updates
export const Route = createFileRoute("/api/playlists/$id/events")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { id: playlistId } = params;

        // Authenticate
        const session = await auth.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true },
        });

        if (!session) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const userId = session.user.id;

        // Check if user has access to playlist
        const { hasAccess } = await checkCollaboratorRole(playlistId, userId, "viewer");
        if (!hasAccess) {
          return new Response(JSON.stringify({ error: "Not a collaborator" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Generate unique connection ID
        const connectionId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Create stream
        const stream = new ReadableStream({
          start: async (controller) => {
            // Initialize playlist connections map if needed
            if (!playlistConnections.has(playlistId)) {
              playlistConnections.set(playlistId, new Map());
            }

            // Store connection
            playlistConnections.get(playlistId)!.set(connectionId, {
              controller,
              userId,
            });

            // Update presence
            try {
              await updateCollaboratorPresence(playlistId, userId, true);
            } catch (error) {
              console.error("Failed to update presence:", error);
            }

            // Broadcast that user joined
            broadcastToPlaylist(playlistId, {
              type: "collaborator_presence",
              data: { userId, isOnline: true },
            }, userId);

            // Send initial connection event
            const connectEvent = `data: ${JSON.stringify({
              type: "connected",
              data: { connectionId, playlistId },
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(connectEvent));

            // Setup ping interval to keep connection alive
            const pingInterval = setInterval(() => {
              try {
                const ping = `data: ${JSON.stringify({
                  type: "ping",
                  data: { timestamp: Date.now() },
                })}\n\n`;
                controller.enqueue(new TextEncoder().encode(ping));
              } catch {
                clearInterval(pingInterval);
              }
            }, 30000); // Ping every 30 seconds

            // Cleanup on close
            request.signal.addEventListener("abort", async () => {
              clearInterval(pingInterval);

              // Remove connection
              const connections = playlistConnections.get(playlistId);
              if (connections) {
                connections.delete(connectionId);
                if (connections.size === 0) {
                  playlistConnections.delete(playlistId);
                }
              }

              // Update presence
              try {
                await updateCollaboratorPresence(playlistId, userId, false);
              } catch (error) {
                console.error("Failed to update presence on disconnect:", error);
              }

              // Broadcast that user left
              broadcastToPlaylist(playlistId, {
                type: "collaborator_presence",
                data: { userId, isOnline: false },
              });

              controller.close();
            });
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no", // For nginx
          },
        });
      },
    },
  },
});
