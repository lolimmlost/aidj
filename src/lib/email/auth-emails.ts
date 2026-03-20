import { sendEmail } from "./send";
import { PasswordResetTemplate } from "./templates/auth/password-reset";
import { SecurityAlertTemplate } from "./templates/auth/security-alert";
import { VerifyEmailTemplate } from "./templates/auth/verify-email";
import { WelcomeEmailTemplate } from "./templates/auth/welcome";

export async function sendVerificationEmail(params: {
  email: string;
  name?: string;
  verificationUrl: string;
}) {
  const { email, name, verificationUrl } = params;
  return sendEmail({
    to: email,
    toName: name,
    subject: "Verify your email address - AIDJ",
    react: VerifyEmailTemplate({
      userName: name || email.split("@")[0],
      verificationUrl,
      expiresIn: "24 hours",
    }),
  });
}

export async function sendPasswordResetEmail(params: {
  email: string;
  name?: string;
  resetUrl: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { email, name, resetUrl, ipAddress, userAgent } = params;
  return sendEmail({
    to: email,
    toName: name,
    subject: "Reset your password - AIDJ",
    react: PasswordResetTemplate({
      userName: name || email.split("@")[0],
      resetUrl,
      expiresIn: "1 hour",
      ipAddress,
      userAgent,
    }),
  });
}

export async function sendWelcomeEmail(params: {
  email: string;
  name?: string;
  dashboardUrl?: string;
}) {
  const { email, name, dashboardUrl } = params;
  const baseUrl = process.env.VITE_BASE_URL || "http://localhost:3003";

  return sendEmail({
    to: email,
    toName: name,
    subject: "Welcome to AIDJ!",
    react: WelcomeEmailTemplate({
      userName: name || email.split("@")[0],
      dashboardUrl: dashboardUrl || baseUrl,
    }),
  });
}

export async function sendSecurityAlertEmail(params: {
  email: string;
  name?: string;
  alertType: "new-device" | "password-changed" | "email-changed" | "2fa-enabled" | "2fa-disabled";
  deviceInfo?: {
    browser?: string;
    os?: string;
    location?: string;
  };
  actionUrl?: string;
}) {
  const { email, name, alertType, deviceInfo, actionUrl } = params;
  const baseUrl = process.env.VITE_BASE_URL || "http://localhost:3003";

  const subjects: Record<string, string> = {
    "new-device": "New device sign-in detected - AIDJ",
    "password-changed": "Your password was changed - AIDJ",
    "email-changed": "Your email address was changed - AIDJ",
    "2fa-enabled": "Two-factor authentication enabled - AIDJ",
    "2fa-disabled": "Two-factor authentication disabled - AIDJ",
  };

  return sendEmail({
    to: email,
    toName: name,
    subject: subjects[alertType],
    react: SecurityAlertTemplate({
      userName: name || email.split("@")[0],
      alertType,
      deviceInfo,
      timestamp: new Date(),
      actionUrl: actionUrl || `${baseUrl}/settings?tab=security`,
    }),
  });
}
