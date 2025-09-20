import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(1),
    VITE_BASE_URL: z.string().url(),
    NAVIDROME_URL: z.string().url(),
    NAVIDROME_USERNAME: z.string().min(1),
    NAVIDROME_PASSWORD: z.string().min(1),
    OLLAMA_URL: z.string().url(),
    LIDARR_URL: z.string().url(),
    LIDARR_API_KEY: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    VITE_BASE_URL: process.env.VITE_BASE_URL,
    NAVIDROME_URL: process.env.NAVIDROME_URL,
    NAVIDROME_USERNAME: process.env.NAVIDROME_USERNAME,
    NAVIDROME_PASSWORD: process.env.NAVIDROME_PASSWORD,
    OLLAMA_URL: process.env.OLLAMA_URL,
    LIDARR_URL: process.env.LIDARR_URL,
    LIDARR_API_KEY: process.env.LIDARR_API_KEY,
  },
});
