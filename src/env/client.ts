import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const clientEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_BASE_URL: z.string().url(),
    VITE_API_URL: z.string().url(),
    VITE_NAVIDROME_URL: z.string().url().optional(),
    VITE_OLLAMA_URL: z.string().url().optional(),
    VITE_LIDARR_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    VITE_BASE_URL: import.meta.env.VITE_BASE_URL,
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_NAVIDROME_URL: import.meta.env.VITE_NAVIDROME_URL,
    VITE_OLLAMA_URL: import.meta.env.VITE_OLLAMA_URL,
    VITE_LIDARR_URL: import.meta.env.VITE_LIDARR_URL,
  },
});
