import { createAuthClient } from 'better-auth/react';
import { createEnv } from '@t3-oss/env-core';
import * as z from 'zod';

var _a;
const __vite_import_meta_env__ = { "BASE_URL": "/", "DEV": false, "MODE": "production", "PROD": true, "SSR": true, "TSS_APP_BASE": "/", "TSS_OUTPUT_PUBLIC_DIR": "/home/dankhost3/dev/aidj/.output/public", "TSS_SERVER_FN_BASE": "/_serverFn", "VITE_BASE_URL": "http://localhost:3000", "VITE_NAVIDROME_BASE_URL": "http://10.0.0.30:4533", "VITE_NAVIDROME_PASSWORD": "GoldSoul40", "VITE_NAVIDROME_USERNAME": "juan" };
const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_BASE_URL: z.url().default("http://localhost:3000")
  },
  runtimeEnv: __vite_import_meta_env__
});
const authClient = createAuthClient({
  baseURL: (_a = env.VITE_BASE_URL) != null ? _a : ""
});

export { authClient as a };
//# sourceMappingURL=auth-client-DKMEFgUO.mjs.map
