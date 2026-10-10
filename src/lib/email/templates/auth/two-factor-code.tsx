import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout } from "../shared/layout";
import { colors, fonts } from "../shared/styles";

interface TwoFactorCodeProps {
  userName: string;
  code: string;
  expiresIn?: string;
}

export function TwoFactorCodeTemplate({
  userName,
  code,
  expiresIn = "3 minutes",
}: TwoFactorCodeProps) {
  return (
    <EmailLayout
      previewText={`Your AIDJ sign-in code is ${code}`}
      headerSubtitle="Sign-in Code"
    >
      <Heading as="h2" style={headingStyle}>
        Your sign-in code
      </Heading>

      <Text style={textStyle}>Hi {userName || "there"},</Text>

      <Text style={textStyle}>
        Enter this code to finish signing in to AIDJ:
      </Text>

      <Section style={codeContainerStyle}>
        <Text style={codeStyle}>{code}</Text>
      </Section>

      <Text style={smallTextStyle}>
        This code expires in {expiresIn}. If you didn&apos;t try to sign in,
        someone may know your password — change it in Settings → Security.
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

const codeContainerStyle: React.CSSProperties = {
  textAlign: "center",
  margin: "28px 0",
  padding: "16px",
  backgroundColor: colors.background,
  borderRadius: "8px",
};

const codeStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "32px",
  fontWeight: "700",
  letterSpacing: "0.35em",
  margin: "0",
  fontFamily: fonts.mono,
};

const smallTextStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "24px 0 0 0",
  fontFamily: fonts.sans,
};

export default TwoFactorCodeTemplate;
