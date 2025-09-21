import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    cors: true,  // Enable CORS for dev server to handle preflight OPTIONS requests for API routes
    allowedHosts: ['dev1.appahouse.com'],  // Allow custom host for local domain testing
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
      // target: "node-server",
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
