import { Resend } from "resend";

let resendClient: Resend | null = null;

export interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return {
    apiKey,
    fromEmail: process.env.RESEND_FROM_EMAIL || "noreply@localhost",
    fromName: process.env.RESEND_FROM_NAME || "AIDJ",
    replyTo: process.env.RESEND_REPLY_TO,
  };
}

export function getResendClient(): Resend {
  if (resendClient) return resendClient;
  const config = getEmailConfig();
  resendClient = new Resend(config.apiKey);
  return resendClient;
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function formatSender(config?: EmailConfig): string {
  const c = config || getEmailConfig();
  return `${c.fromName} <${c.fromEmail}>`;
}
