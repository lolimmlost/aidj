import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    VITE_BASE_URL: z.string().url(),
    NAVIDROME_URL: z.string().url(),
    NAVIDROME_USERNAME: z.string().min(1),
    NAVIDROME_PASSWORD: z.string().min(1),
    OLLAMA_URL: z.string().url(),
    LIDARR_URL: z.string().url(),
    LIDARR_API_KEY: z.string().min(1),
    // Optional OAuth providers
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    VITE_BASE_URL: process.env.VITE_BASE_URL,
    NAVIDROME_URL: process.env.NAVIDROME_URL,
    NAVIDROME_USERNAME: process.env.NAVIDROME_USERNAME,
    NAVIDROME_PASSWORD: process.env.NAVIDROME_PASSWORD,
    OLLAMA_URL: process.env.OLLAMA_URL,
    LIDARR_URL: process.env.LIDARR_URL,
    LIDARR_API_KEY: process.env.LIDARR_API_KEY,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  },
});
