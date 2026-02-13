/**
 * useEruda Hook
 *
 * Loads Eruda mobile console and streams logs to server.
 * Activate by adding ?debug=true to URL or setting localStorage.debug = 'true'
 *
 * Logs are sent to /api/debug/logs and printed in server terminal.
 *
 * @see https://github.com/liriliri/eruda
 */

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    eruda?: {
      init: (options?: { container?: HTMLElement; tool?: string[] }) => void;
      destroy: () => void;
      show: () => void;
      hide: () => void;
    };
    __originalConsole?: {
      log: typeof console.log;
      warn: typeof console.warn;
      error: typeof console.error;
      info: typeof console.info;
    };
  }
}

// Queue for batching log sends
let logQueue: Array<{
  level: string;
  args: string[];
  timestamp: string;
}> = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Send logs to server
 */
function flushLogs() {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue = [];

  // Send each log individually (simple approach)
  for (const log of logsToSend) {
    fetch('/api/debug/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...log,
        userAgent: navigator.userAgent,
        url: window.location.href,
      }),
    }).catch(() => {
      // Ignore send failures
    });
  }
}

/**
 * Queue a log to be sent
 */
function queueLog(level: string, args: unknown[]) {
  // Serialize arguments safely with truncation
  const serializedArgs = args.map(arg => {
    try {
      if (arg instanceof Error) {
        return `Error: ${arg.message}\n${arg.stack || ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        const json = JSON.stringify(arg);
        // Truncate large objects
        if (json.length > 200) {
          // For arrays, show count
          if (Array.isArray(arg)) {
            return `[Array(${arg.length})]`;
          }
          // For objects, show keys only
          const keys = Object.keys(arg as object);
          return `{${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}}`;
        }
        return json;
      }
      return String(arg);
    } catch {
      return '[Unserializable]';
    }
  });

  // Skip noisy logs
  const firstArg = serializedArgs[0] || '';
  if (
    firstArg.includes('getAlbumList') ||
    firstArg.includes('[React Query]') ||
    firstArg.includes('musicBrainzId') ||
    firstArg.includes('"genres":[')
  ) {
    return; // Skip these verbose logs
  }

  logQueue.push({
    level,
    args: serializedArgs,
    timestamp: new Date().toISOString(),
  });

  // Debounce flush - send after 100ms of no new logs, or immediately for errors
  if (flushTimeout) clearTimeout(flushTimeout);

  if (level === 'error') {
    flushLogs(); // Send errors immediately
  } else {
    flushTimeout = setTimeout(flushLogs, 100);
  }
}

/**
 * Override console methods to stream to server
 */
function setupRemoteLogging() {
  // Don't setup twice
  if (window.__originalConsole) return;

  // Store original methods
  window.__originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  };

  // Override console methods
  console.log = (...args: unknown[]) => {
    queueLog('log', args);
    window.__originalConsole!.log(...args);
  };

  console.warn = (...args: unknown[]) => {
    queueLog('warn', args);
    window.__originalConsole!.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    queueLog('error', args);
    window.__originalConsole!.error(...args);
  };

  console.info = (...args: unknown[]) => {
    queueLog('info', args);
    window.__originalConsole!.info(...args);
  };

  // Also catch unhandled errors
  window.addEventListener('error', (event) => {
    queueLog('error', [`Uncaught: ${event.message} at ${event.filename}:${event.lineno}`]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    queueLog('error', [`Unhandled Promise: ${event.reason}`]);
  });
}

/**
 * Hook to conditionally load Eruda debug console
 * Enable via URL param: ?debug=true
 * Or via localStorage: localStorage.setItem('debug', 'true')
 */
export function useEruda(): { isLoaded: boolean; isEnabled: boolean } {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Check if debug mode should be enabled
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    const debugStorage = localStorage.getItem('debug');

    const shouldEnable = debugParam === 'true' || debugStorage === 'true';

    // If debug=true in URL, persist to localStorage for future loads
    if (debugParam === 'true') {
      localStorage.setItem('debug', 'true');
    }

    // If debug=false explicitly, disable
    if (debugParam === 'false') {
      localStorage.removeItem('debug');
      if (window.eruda) {
        window.eruda.destroy();
      }
      setIsEnabled(false);
      setIsLoaded(false);
      return;
    }

    if (!shouldEnable) {
      return;
    }

    setIsEnabled(true);

    // Setup remote logging FIRST
    setupRemoteLogging();

    // Don't load Eruda twice
    if (window.eruda) {
      setIsLoaded(true);
      return;
    }

    // Load Eruda from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.async = true;

    script.onload = () => {
      if (window.eruda) {
        window.eruda.init();
        setIsLoaded(true);
        console.log('🔧 [Debug] Remote logging enabled - logs streaming to server');
      }
    };

    script.onerror = () => {
      // Eruda failed but remote logging still works
      console.error('🔧 [Eruda] Failed to load UI, but remote logging is active');
      setIsLoaded(true);
    };

    document.head.appendChild(script);

    return () => {
      // Don't destroy on unmount
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { isLoaded, isEnabled };
}
