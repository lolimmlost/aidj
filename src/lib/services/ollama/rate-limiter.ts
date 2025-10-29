// Rate limiting for Ollama API requests
const ollamaRequestQueue = new Map<string, number[]>();
const OLLAMA_RATE_LIMIT_WINDOW = 60000; // 1 minute
const OLLAMA_RATE_LIMIT_MAX_REQUESTS = 30; // Max 30 AI requests per minute for local instances

export function checkOllamaRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - OLLAMA_RATE_LIMIT_WINDOW;

  if (!ollamaRequestQueue.has(key)) {
    ollamaRequestQueue.set(key, [now]);
    return true;
  }

  const requests = ollamaRequestQueue.get(key)!;
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= OLLAMA_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  ollamaRequestQueue.set(key, validRequests);
  return true;
}

export function getRateLimitConfig() {
  return {
    window: OLLAMA_RATE_LIMIT_WINDOW,
    maxRequests: OLLAMA_RATE_LIMIT_MAX_REQUESTS
  };
}