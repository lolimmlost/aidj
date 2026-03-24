import { createServerOnlyFn } from "@tanstack/react-start";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { admin, twoFactor } from "better-auth/plugins";

import { env } from "~/env/server";
import { db } from "~/lib/db";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "~/lib/email/auth-emails";

const getAuthConfig = createServerOnlyFn(() =>
  betterAuth({
    baseURL: env.VITE_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
    }),

    // https://www.better-auth.com/docs/concepts/session-management
    session: {
      expiresIn: 60 * 60 * 24, // 1 day (seconds)
      updateAge: 60 * 60, // refresh session token every 1 hour
    },

    // Cookie configuration for Cloudflare tunnel / reverse proxy
    // https://www.better-auth.com/docs/concepts/cookies
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none" as const,
        secure: true,
        httpOnly: true,
        path: "/",
      },
    },

    // https://www.better-auth.com/docs/integrations/tanstack#usage-tips
    plugins: [
      tanstackStartCookies(),
      admin(),
      twoFactor({
        issuer: "AIDJ",
        totpOptions: {
          digits: 6,
          period: 30,
        },
        backupCodeOptions: {
          length: 10,
        },
      }),
    ],

    // Configure trusted origins
    trustedOrigins: [
      env.VITE_BASE_URL || "",
      // Include localhost in development
      ...(process.env.NODE_ENV === "development"
        ? ["http://localhost:3003", "http://127.0.0.1:3003"]
        : []
      ),
    ].filter(Boolean),

    // https://www.better-auth.com/docs/concepts/session-management#session-caching
    // NOTE: cookieCache is disabled because it doesn't work with tanstackStartCookies
    // See: https://github.com/better-auth/better-auth/issues/5639

    // https://www.better-auth.com/docs/concepts/oauth
    // Only include social providers if credentials are available
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && {
      socialProviders: {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
        ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }),
      },
    }),

    // https://www.better-auth.com/docs/authentication/email-password
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({
          email: user.email,
          name: user.name,
          resetUrl: url,
        });
      },
    },

    // https://www.better-auth.com/docs/concepts/email-verification
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail({
          email: user.email,
          name: user.name,
          verificationUrl: url,
        });
      },
      sendOnSignUp: true,
    },
  }),
);

export const auth = getAuthConfig();
