import { Hr, Link, Section, Text } from "@react-email/components";
import { colors, fonts } from "./styles";

interface EmailFooterProps {
  appUrl?: string;
}

export function EmailFooter({ appUrl = "" }: EmailFooterProps) {
  return (
    <Section style={footerStyle}>
      <Hr style={dividerStyle} />
      <Text style={linksStyle}>
        <Link href={appUrl || "#"} style={linkStyle}>
          Dashboard
        </Link>
        <span style={separatorStyle}>&bull;</span>
        <Link href={`${appUrl}/settings`} style={linkStyle}>
          Settings
        </Link>
      </Text>
      <Text style={copyrightStyle}>
        &copy; {new Date().getFullYear()} AIDJ
      </Text>
    </Section>
  );
}

const footerStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  padding: "24px 32px",
  textAlign: "center",
};

const dividerStyle: React.CSSProperties = {
  borderTop: `1px solid ${colors.border}`,
  margin: "0 0 20px 0",
};

const linksStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "13px",
  margin: "0 0 12px 0",
  fontFamily: fonts.sans,
};

const linkStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  textDecoration: "none",
};

const separatorStyle: React.CSSProperties = {
  color: colors.border,
  margin: "0 12px",
};

const copyrightStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "12px",
  margin: "0",
  fontFamily: fonts.sans,
  opacity: 0.7,
};
