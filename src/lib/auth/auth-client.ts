import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { clientEnv as env } from "@/env/client";

const authClient = createAuthClient({
  baseURL: env.VITE_BASE_URL ?? (typeof window !== "undefined" ? window.location.origin : ""),
  plugins: [adminClient()],
});

export default authClient;
