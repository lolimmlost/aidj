import { Heading, Link, Section, Text } from "@react-email/components";
import { EmailButton } from "../shared/button";
import { EmailLayout } from "../shared/layout";
import { colors, fonts } from "../shared/styles";

interface PasswordResetProps {
  userName: string;
  resetUrl: string;
  expiresIn?: string;
  ipAddress?: string;
  userAgent?: string;
}

export function PasswordResetTemplate({
  userName,
  resetUrl,
  expiresIn = "1 hour",
  ipAddress,
  userAgent,
}: PasswordResetProps) {
  return (
    <EmailLayout
      previewText="Reset your AIDJ password"
      headerSubtitle="Password Reset"
    >
      <Heading as="h2" style={headingStyle}>
        Reset Your Password
      </Heading>

      <Text style={textStyle}>Hi {userName || "there"},</Text>

      <Text style={textStyle}>
        We received a request to reset the password for your AIDJ account.
        Click the button below to create a new password.
      </Text>

      <Section style={buttonContainerStyle}>
        <EmailButton href={resetUrl} variant="primary">
          Reset Password
        </EmailButton>
      </Section>

      <Text style={smallTextStyle}>
        This link will expire in {expiresIn}. If you didn&apos;t request a
        password reset, please ignore this email.
      </Text>

      {(ipAddress || userAgent) && (
        <Section style={securityInfoStyle}>
          <Text style={securityLabelStyle}>Request Details</Text>
          {ipAddress && (
            <Text style={securityTextStyle}>
              <span style={labelSpanStyle}>IP Address:</span>{" "}
              <span style={monoStyle}>{ipAddress}</span>
            </Text>
          )}
          {userAgent && (
            <Text style={securityTextStyle}>
              <span style={labelSpanStyle}>Device:</span> {userAgent}
            </Text>
          )}
        </Section>
      )}

      <Section style={dividerStyle} />

      <Text style={fallbackTextStyle}>
        If the button doesn&apos;t work, copy and paste this link:
      </Text>
      <Text style={linkContainerStyle}>
        <Link href={resetUrl} style={linkStyle}>
          {resetUrl}
        </Link>
      </Text>

      <Section style={warningStyle}>
        <Text style={warningTextStyle}>
          If you didn&apos;t request this password reset, your account may be at
          risk. Consider changing your password immediately.
        </Text>
      </Section>
    </EmailLayout>
  );
}

const headingStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "24px",
  fontWeight: "600",
  margin: "0 0 20px 0",
  fontFamily: fonts.sans,
  letterSpacing: "-0.025em",
};

const textStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
  fontFamily: fonts.sans,
};

const smallTextStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "24px 0 0 0",
  fontFamily: fonts.sans,
};

const buttonContainerStyle: React.CSSProperties = {
  textAlign: "center",
  margin: "32px 0",
};

const dividerStyle: React.CSSProperties = {
  borderTop: `1px solid ${colors.border}`,
  margin: "32px 0",
};

const fallbackTextStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "12px",
  margin: "0 0 8px 0",
  fontFamily: fonts.sans,
};

const linkContainerStyle: React.CSSProperties = {
  margin: "0",
  padding: "12px",
  backgroundColor: colors.background,
  borderRadius: "6px",
};

const linkStyle: React.CSSProperties = {
  color: colors.primary,
  fontSize: "12px",
  wordBreak: "break-all",
  fontFamily: fonts.mono,
};

const securityInfoStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  padding: "16px",
  borderRadius: "8px",
  margin: "24px 0",
  border: `1px solid ${colors.border}`,
};

const securityLabelStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 12px 0",
  fontFamily: fonts.sans,
};

const securityTextStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "13px",
  margin: "0 0 8px 0",
  fontFamily: fonts.sans,
};

const labelSpanStyle: React.CSSProperties = {
  color: colors.mutedForeground,
};

const monoStyle: React.CSSProperties = {
  fontFamily: fonts.mono,
};

const warningStyle: React.CSSProperties = {
  backgroundColor: "rgba(245, 158, 11, 0.1)",
  border: "1px solid rgba(245, 158, 11, 0.3)",
  padding: "16px",
  borderRadius: "8px",
  margin: "24px 0 0 0",
};

const warningTextStyle: React.CSSProperties = {
  color: colors.warning,
  fontSize: "13px",
  margin: "0",
  fontFamily: fonts.sans,
};

export default PasswordResetTemplate;
