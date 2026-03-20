import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { clientEnv as env } from "@/env/client";

const authClient = createAuthClient({
  baseURL: env.VITE_BASE_URL ?? (typeof window !== "undefined" ? window.location.origin : ""),
  plugins: [adminClient(), twoFactorClient()],
});

export default authClient;
