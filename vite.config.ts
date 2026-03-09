import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { viteWebSocketPlugin } from "./vite-ws-plugin";

/**
 * Suppress Vite's unconditional full-page reload when the HMR WebSocket
 * reconnects after a network disruption.  Without this, switching networks
 * (WiFi → cellular, VPN toggle, etc.) kills the running audio session.
 *
 * Vite fires `vite:beforeFullReload` with `{ path: '*' }` on reconnect.
 * Real file changes carry the actual file path.  We cancel the wildcard
 * reload and let Vite continue with its normal HMR channel instead.
 *
 * @see https://github.com/vitejs/vite/issues/5675
 */
function hmrNoReloadOnReconnect(): Plugin {
  return {
    name: 'hmr-no-reload-on-reconnect',
    enforce: 'post',
    transformIndexHtml(html) {
      // Only inject in development
      if (process.env.NODE_ENV === 'production') return html;

      return html.replace(
        '</body>',
        `<script>
  if (import.meta.hot) {
    // Track whether the HMR WS just reconnected (vs first connect)
    let wasDisconnected = false;
    window.addEventListener('vite:ws:disconnect', () => { wasDisconnected = true; });
    window.addEventListener('vite:ws:connect', () => {
      if (wasDisconnected) {
        // Mark a short window where we suppress the reconnect reload
        window.__viteReconnecting = true;
        setTimeout(() => { window.__viteReconnecting = false; }, 2000);
      }
    });
    window.addEventListener('vite:beforeFullReload', (e) => {
      if (window.__viteReconnecting) {
        console.log('[HMR] Suppressed full reload on network reconnect');
        e.preventDefault();
      }
    });
  }
</script></body>`
      );
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    include: ['use-sync-external-store'],
  },
  resolve: {
    alias: {
      // better-auth ships ESM that does `import { ms } from "ms"` but the ms
      // package only has a default export.  This shim re-exports it as named.
      ms: new URL('ms-shim.mjs', import.meta.url).pathname,
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  server: {
    host: '0.0.0.0',  // Allow access from any IP on the local network
    port: 3003,
    allowedHosts: ['dev3.appahouse.com', 'localhost'],
    cors: {
      origin: true,  // Allow all origins in development
      credentials: true,
    },
  },
  // Build settings shared by client + server
  build: {
    chunkSizeWarningLimit: 500,
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: 'esbuild',
  },
  // Client-only build optimization (manualChunks must NOT apply to the server
  // build or it splits the server entry into chunks and breaks `vite preview`)
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks(id: string) {
              if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
                return 'vendor-react';
              }
              if (id.includes('node_modules/@tanstack/react-query') || id.includes('node_modules/@tanstack/react-router')) {
                return 'vendor-tanstack';
              }
              if (id.includes('node_modules/zustand')) {
                return 'vendor-zustand';
              }
              if (id.includes('node_modules/@radix-ui')) {
                return 'vendor-radix';
              }
              if (id.includes('node_modules/lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('/components/dashboard/DJFeatures') || id.includes('/components/dashboard/MoreFeatures')) {
                return 'dashboard-features';
              }
              if (id.includes('/components/dj/mix-compatibility-badges')) {
                return 'dj-components';
              }
              if (id.includes('/components/recommendations/PreferenceInsights')) {
                return 'analytics-components';
              }
              if (id.includes('/components/discovery/DiscoveryQueuePanel')) {
                return 'discovery-components';
              }
            },
            chunkFileNames: 'assets/[name]-[hash].js',
            entryFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash].[ext]',
          },
        },
      },
    },
  },
  plugins: [
    devtools(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    // Prevent Vite from doing a full page reload when HMR WS reconnects after network change
    hmrNoReloadOnReconnect(),
    // WebSocket support for playback sync (Spotify Connect-style)
    viteWebSocketPlugin(),
    tanstackStart({
      // https://github.com/TanStack/router/discussions/2863#discussioncomment-13713677
      customViteReactPlugin: true,

      tsr: {
        quoteStyle: "double",
        semicolons: true,
      },

      // https://tanstack.com/start/latest/docs/framework/react/hosting#deployment
      // Use "cloudflare-pages" for Cloudflare deployment, "node-server" for Node.js
      target: process.env.DEPLOY_TARGET === "cloudflare" ? "cloudflare-pages" : "node-server",
    }),
    viteReact({
      // https://react.dev/learn/react-compiler
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              target: "19",
            },
          ],
        ],
      },
    }),
    tailwindcss(),
  ],
});
