import { Heading, Section, Text } from "@react-email/components";
import { colors, fonts } from "./styles";

interface EmailHeaderProps {
  title?: string;
  subtitle?: string;
}

export function EmailHeader({ title, subtitle }: EmailHeaderProps) {
  return (
    <Section style={headerStyle}>
      <Heading style={logoStyle}>
        <span style={logoIconStyle}>&#9835;</span>
        {title || "AIDJ"}
      </Heading>
      {subtitle && <Text style={subtitleStyle}>{subtitle}</Text>}
    </Section>
  );
}

const headerStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  padding: "24px 32px",
  textAlign: "center",
  borderBottom: `1px solid ${colors.border}`,
};

const logoStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "20px",
  fontWeight: "600",
  margin: "0",
  fontFamily: fonts.sans,
  letterSpacing: "-0.02em",
};

const logoIconStyle: React.CSSProperties = {
  color: colors.primary,
  marginRight: "8px",
};

const subtitleStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "13px",
  margin: "8px 0 0 0",
  fontFamily: fonts.sans,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontWeight: "500",
};
