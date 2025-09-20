import { k as createServerRpc, l as createServerFn, m as auth, n as getWebRequest } from './ssr.mjs';
import '@tanstack/react-query';
import '@tanstack/react-router';
import 'react/jsx-runtime';
import 'react';
import '@tanstack/router-ssr-query-core';
import '@radix-ui/react-slot';
import 'class-variance-authority';
import 'clsx';
import 'tailwind-merge';
import '@tanstack/react-devtools';
import '@tanstack/react-query-devtools';
import 'better-auth';
import 'better-auth/adapters/drizzle';
import 'better-auth/react-start';
import '@t3-oss/env-core';
import 'zod';
import 'drizzle-orm/postgres-js';
import 'postgres';
import 'drizzle-orm/pg-core';
import 'tiny-invariant';
import 'tiny-warning';
import '@tanstack/router-core';
import '@tanstack/router-core/ssr/client';
import 'node:async_hooks';
import 'sonner';
import 'lucide-react';
import 'zustand';
import 'crypto';
import '@tanstack/history';
import '@tanstack/router-core/ssr/server';
import '@tanstack/react-router/ssr/server';

const $getUser_createServerFn_handler = createServerRpc("src_lib_auth_functions_ts--_getUser_createServerFn_handler", "/_serverFn", (opts, signal) => {
  return $getUser.__executeServer(opts, signal);
});
const $getUser = createServerFn({
  method: "GET"
}).handler($getUser_createServerFn_handler, async () => {
  const session = await auth.api.getSession({
    headers: getWebRequest().headers
  });
  return (session == null ? void 0 : session.user) || null;
});

export { $getUser_createServerFn_handler };
//# sourceMappingURL=functions-DuQx8AaT.mjs.map
