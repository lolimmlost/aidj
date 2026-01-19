import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  optimizeDeps: {
    include: ['use-sync-external-store'],
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
  // Build optimization for code splitting
  build: {
    // Enable code splitting for route bundles
    rollupOptions: {
      output: {
        // Manual chunks for optimal bundle splitting
        // Uses a function to identify modules by their resolved path
        manualChunks(id: string) {
          // Core React dependencies - rarely change, highly cacheable
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // TanStack core libraries
          if (id.includes('node_modules/@tanstack/react-query') || id.includes('node_modules/@tanstack/react-router')) {
            return 'vendor-tanstack';
          }
          // Zustand state management
          if (id.includes('node_modules/zustand')) {
            return 'vendor-zustand';
          }
          // Radix UI components (shared UI primitives)
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          // Dashboard-specific lazy-loaded components
          if (id.includes('/components/dashboard/DJFeatures') || id.includes('/components/dashboard/MoreFeatures')) {
            return 'dashboard-features';
          }
          // DJ-specific lazy-loaded components
          if (id.includes('/components/dj/mix-compatibility-badges')) {
            return 'dj-components';
          }
          // Recommendation/Analytics lazy-loaded components
          if (id.includes('/components/recommendations/PreferenceInsights')) {
            return 'analytics-components';
          }
          // Discovery components (lazy-loaded)
          if (id.includes('/components/discovery/DiscoveryQueuePanel')) {
            return 'discovery-components';
          }
        },
        // Use content hash for long-term caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 500,
    // Enable source maps for debugging in production
    sourcemap: process.env.NODE_ENV !== 'production',
    // Minification settings - use esbuild (default) for faster builds
    minify: 'esbuild',
  },
  plugins: [
    devtools(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
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
