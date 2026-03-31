import { Heading, Link, Section, Text } from "@react-email/components";
import { EmailButton } from "../shared/button";
import { EmailLayout } from "../shared/layout";
import { colors, fonts } from "../shared/styles";

interface VerifyEmailProps {
  userName: string;
  verificationUrl: string;
  expiresIn?: string;
}

export function VerifyEmailTemplate({
  userName,
  verificationUrl,
  expiresIn = "24 hours",
}: VerifyEmailProps) {
  return (
    <EmailLayout
      previewText="Verify your email address to get started with AIDJ"
      headerSubtitle="Email Verification"
    >
      <Heading as="h2" style={headingStyle}>
        Verify Your Email Address
      </Heading>

      <Text style={textStyle}>Hi {userName || "there"},</Text>

      <Text style={textStyle}>
        Welcome to AIDJ! Please verify your email address to complete your
        registration and start discovering music.
      </Text>

      <Section style={buttonContainerStyle}>
        <EmailButton href={verificationUrl} variant="primary">
          Verify Email Address
        </EmailButton>
      </Section>

      <Text style={smallTextStyle}>
        This link will expire in {expiresIn}. If you didn&apos;t create an
        account with AIDJ, you can safely ignore this email.
      </Text>

      <Section style={dividerStyle} />

      <Text style={fallbackTextStyle}>
        If the button doesn&apos;t work, copy and paste this link into your
        browser:
      </Text>
      <Text style={linkContainerStyle}>
        <Link href={verificationUrl} style={linkStyle}>
          {verificationUrl}
        </Link>
      </Text>
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

export default VerifyEmailTemplate;
