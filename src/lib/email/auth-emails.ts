import { sendEmail } from "./send";
import { PasswordResetTemplate } from "./templates/auth/password-reset";
import { VerifyEmailTemplate } from "./templates/auth/verify-email";

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
