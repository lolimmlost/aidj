import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
} from "@react-email/components";
import { EmailFooter } from "./footer";
import { EmailHeader } from "./header";
import { colors, fonts } from "./styles";

interface EmailLayoutProps {
  previewText: string;
  headerSubtitle?: string;
  children: React.ReactNode;
  appUrl?: string;
}

export function EmailLayout({
  previewText,
  headerSubtitle,
  children,
  appUrl,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader subtitle={headerSubtitle} />
          <Section style={contentStyle}>{children}</Section>
          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  fontFamily: fonts.sans,
  margin: "0",
  padding: "40px 20px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: colors.card,
  borderRadius: "12px",
  border: `1px solid ${colors.border}`,
  overflow: "hidden",
};

const contentStyle: React.CSSProperties = {
  padding: "32px",
  backgroundColor: colors.card,
};

export { EmailButton } from "./button";
export { EmailFooter } from "./footer";
export { EmailHeader } from "./header";
