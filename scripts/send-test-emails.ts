/**
 * Send test copies of all auth email templates one at a time.
 * Usage: npx tsx --env-file=.env scripts/send-test-emails.ts
 */

import { Resend } from "resend";
import { VerifyEmailTemplate } from "../src/lib/email/templates/auth/verify-email.js";
import { PasswordResetTemplate } from "../src/lib/email/templates/auth/password-reset.js";
import { WelcomeEmailTemplate } from "../src/lib/email/templates/auth/welcome.js";
import { SecurityAlertTemplate } from "../src/lib/email/templates/auth/security-alert.js";

const RECIPIENT = "juan@appahouse.com";
const DELAY_MS = 2000; // 2 seconds between emails to avoid rate limiting

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("RESEND_API_KEY is not set. Check your .env file.");
  process.exit(1);
}

const resend = new Resend(apiKey);
const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@localhost";
const fromName = process.env.RESEND_FROM_NAME || "AIDJ";
const from = `${fromName} <${fromEmail}>`;

const emails = [
  {
    name: "Verify Email",
    subject: "[TEST] Verify your email address - AIDJ",
    react: VerifyEmailTemplate({
      userName: "Juan",
      verificationUrl: "https://example.com/verify?token=test-token-123",
      expiresIn: "24 hours",
    }),
  },
  {
    name: "Password Reset",
    subject: "[TEST] Reset your password - AIDJ",
    react: PasswordResetTemplate({
      userName: "Juan",
      resetUrl: "https://example.com/reset-password?token=test-token-456",
      expiresIn: "1 hour",
      ipAddress: "192.168.1.1",
      userAgent: "Chrome 120 on macOS",
    }),
  },
  {
    name: "Welcome",
    subject: "[TEST] Welcome to AIDJ!",
    react: WelcomeEmailTemplate({
      userName: "Juan",
      dashboardUrl: "https://dev3.appahouse.com",
    }),
  },
  {
    name: "Security Alert - New Device",
    subject: "[TEST] New device sign-in detected - AIDJ",
    react: SecurityAlertTemplate({
      userName: "Juan",
      alertType: "new-device",
      deviceInfo: {
        browser: "Chrome 120",
        os: "macOS Sonoma",
        location: "Miami, FL",
      },
      timestamp: new Date(),
      actionUrl: "https://dev3.appahouse.com/settings?tab=security",
    }),
  },
  {
    name: "Security Alert - Password Changed",
    subject: "[TEST] Your password was changed - AIDJ",
    react: SecurityAlertTemplate({
      userName: "Juan",
      alertType: "password-changed",
      timestamp: new Date(),
      actionUrl: "https://dev3.appahouse.com/settings?tab=security",
    }),
  },
  {
    name: "Security Alert - 2FA Enabled",
    subject: "[TEST] Two-factor authentication enabled - AIDJ",
    react: SecurityAlertTemplate({
      userName: "Juan",
      alertType: "2fa-enabled",
      timestamp: new Date(),
      actionUrl: "https://dev3.appahouse.com/settings?tab=security",
    }),
  },
  {
    name: "Security Alert - 2FA Disabled",
    subject: "[TEST] Two-factor authentication disabled - AIDJ",
    react: SecurityAlertTemplate({
      userName: "Juan",
      alertType: "2fa-disabled",
      timestamp: new Date(),
      actionUrl: "https://dev3.appahouse.com/settings?tab=security",
    }),
  },
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Sending ${emails.length} test emails to ${RECIPIENT}...\n`);

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    console.log(`[${i + 1}/${emails.length}] Sending: ${email.name}...`);

    try {
      const result = await resend.emails.send({
        from,
        to: RECIPIENT,
        subject: email.subject,
        react: email.react,
      });

      if (result.error) {
        console.error(`  FAILED: ${result.error.message}`);
      } else {
        console.log(`  OK (id: ${result.data?.id})`);
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }

    // Wait between sends (skip delay after the last one)
    if (i < emails.length - 1) {
      console.log(`  Waiting ${DELAY_MS / 1000}s before next send...`);
      await sleep(DELAY_MS);
    }
  }

  console.log("\nDone.");
}

main();
