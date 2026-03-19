import { formatSender, getResendClient, isEmailConfigured } from "./client";

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  react: React.ReactElement;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, toName, subject, react } = options;

  if (!isEmailConfigured()) {
    console.warn(`[Email] Skipping "${subject}" - RESEND_API_KEY not configured`);
    return { success: false, error: "Email service not configured" };
  }

  try {
    const client = getResendClient();
    const from = formatSender();
    const recipient = toName ? `${toName} <${to}>` : to;

    const result = await client.emails.send({
      from,
      to: recipient,
      subject,
      react,
    });

    if (result.error) {
      console.error(`[Email] Failed to send "${subject}":`, result.error);
      return { success: false, error: result.error.message };
    }

    console.log(`[Email] Sent "${subject}" to ${to}:`, result.data?.id);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Email] Error sending "${subject}":`, message);
    return { success: false, error: message };
  }
}
