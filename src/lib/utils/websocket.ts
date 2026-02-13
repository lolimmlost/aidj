/**
 * Reconnecting WebSocket Utility
 *
 * Creates a WebSocket connection with automatic reconnection
 * using exponential backoff with jitter.
 */

export interface ReconnectingWSOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (event: MessageEvent) => void;
}

/**
 * Create a WebSocket with automatic reconnection
 *
 * Returns a proxy WebSocket that maintains connection state
 * across reconnections. The underlying WebSocket may be
 * replaced on reconnect, but the API remains stable.
 */
export function createReconnectingWebSocket(
  url: string,
  options: ReconnectingWSOptions = {}
): WebSocket {
  const {
    maxRetries = 10,
    retryDelayMs = 1000,
    maxRetryDelayMs = 30000,
    onOpen,
    onClose,
    onError,
    onMessage,
  } = options;

  let ws: WebSocket | null = null;
  let retryCount = 0;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let isDestroyed = false;
  let messageQueue: string[] = [];

  // Limit queue size to prevent memory issues during long disconnects
  const MAX_QUEUE_SIZE = 100;

  const connect = () => {
    if (isDestroyed) return;

    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retryCount = 0; // Reset on successful connection

      // Flush any queued messages
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        if (msg && ws?.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      }

      onOpen?.();
    };

    ws.onclose = (event) => {
      onClose?.();

      if (isDestroyed) return;

      // Don't reconnect on normal closure (code 1000)
      if (event.code === 1000) {
        console.log('[WS] Normal closure, not reconnecting');
        return;
      }

      scheduleReconnect();
    };

    ws.onerror = (event) => {
      console.error('[WS] Error:', event);
      onError?.(event);
    };

    ws.onmessage = (event) => {
      onMessage?.(event);
    };
  };

  const scheduleReconnect = () => {
    if (isDestroyed || retryCount >= maxRetries) {
      if (retryCount >= maxRetries) {
        console.error('[WS] Max retries exceeded, giving up');
      }
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = retryDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    const delay = Math.min(baseDelay + jitter, maxRetryDelayMs);

    retryCount++;
    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${retryCount}/${maxRetries})`);

    retryTimeout = setTimeout(connect, delay);
  };

  // Initial connection
  connect();

  // Return a proxy that wraps the WebSocket
  // This allows the underlying connection to be replaced on reconnect
  // while maintaining a stable API for the caller
  return new Proxy({} as WebSocket, {
    get(_, prop: keyof WebSocket | 'send' | 'close' | 'readyState') {
      if (prop === 'close') {
        return () => {
          isDestroyed = true;
          if (retryTimeout) clearTimeout(retryTimeout);
          ws?.close(1000, 'Client closed');
        };
      }

      if (prop === 'send') {
        return (data: string) => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(data);
          } else {
            // Queue messages while disconnected (with size limit)
            if (messageQueue.length < MAX_QUEUE_SIZE) {
              messageQueue.push(data);
            } else {
              // Drop oldest message to make room
              messageQueue.shift();
              messageQueue.push(data);
              console.warn('[WS] Message queue full, dropping oldest message');
            }
          }
        };
      }

      if (prop === 'readyState') {
        return ws?.readyState ?? WebSocket.CLOSED;
      }

      // Forward other properties to the underlying WebSocket
      return ws ? (ws as any)[prop] : undefined;
    },
  });
}
