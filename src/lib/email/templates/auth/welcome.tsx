import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "../shared/button";
import { EmailLayout } from "../shared/layout";
import { colors, fonts } from "../shared/styles";

interface WelcomeEmailProps {
  userName: string;
  dashboardUrl: string;
}

export function WelcomeEmailTemplate({
  userName,
  dashboardUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout
      previewText="Welcome to AIDJ - Let's get started!"
      headerSubtitle="Welcome!"
    >
      <Heading as="h2" style={headingStyle}>
        Welcome to AIDJ!
      </Heading>

      <Text style={textStyle}>Hi {userName || "there"},</Text>

      <Text style={textStyle}>
        Your email has been verified and your account is ready. We&apos;re
        excited to help you discover and enjoy music with AI-powered
        recommendations!
      </Text>

      <Section style={buttonContainerStyle}>
        <EmailButton href={dashboardUrl} variant="primary">
          Go to Dashboard
        </EmailButton>
      </Section>

      <Heading as="h3" style={subheadingStyle}>
        Quick Start Guide
      </Heading>

      <Section style={stepsContainerStyle}>
        <Section style={stepStyle}>
          <Text style={stepNumberStyle}>1</Text>
          <Section style={stepContentStyle}>
            <Text style={stepTitleStyle}>Browse Your Library</Text>
            <Text style={stepDescStyle}>
              Explore your music library with smart search, artist pages, and
              album views powered by Navidrome.
            </Text>
          </Section>
        </Section>

        <Section style={stepStyle}>
          <Text style={stepNumberStyle}>2</Text>
          <Section style={stepContentStyle}>
            <Text style={stepTitleStyle}>Enable AI DJ</Text>
            <Text style={stepDescStyle}>
              Let the AI DJ curate your listening experience with personalized
              recommendations based on your taste.
            </Text>
          </Section>
        </Section>

        <Section style={stepStyle}>
          <Text style={stepNumberStyle}>3</Text>
          <Section style={stepContentStyle}>
            <Text style={stepTitleStyle}>Create Playlists</Text>
            <Text style={stepDescStyle}>
              Build playlists manually or let AI generate them based on mood,
              genre, or listening history.
            </Text>
          </Section>
        </Section>
      </Section>

      <Section style={ctaContainerStyle}>
        <Text style={ctaTextStyle}>Ready to start listening?</Text>
        <EmailButton href={`${dashboardUrl}/dashboard`} variant="secondary">
          Explore Your Music
        </EmailButton>
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

const subheadingStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "16px",
  fontWeight: "600",
  margin: "32px 0 16px 0",
  fontFamily: fonts.sans,
  letterSpacing: "-0.02em",
};

const textStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
  fontFamily: fonts.sans,
};

const buttonContainerStyle: React.CSSProperties = {
  textAlign: "center",
  margin: "32px 0",
};

const stepsContainerStyle: React.CSSProperties = {
  margin: "24px 0",
};

const stepStyle: React.CSSProperties = {
  marginBottom: "20px",
  display: "flex",
};

const stepNumberStyle: React.CSSProperties = {
  backgroundColor: colors.primary,
  color: colors.primaryForeground,
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  textAlign: "center",
  lineHeight: "28px",
  fontSize: "13px",
  fontWeight: "600",
  marginRight: "16px",
  fontFamily: fonts.sans,
  flexShrink: 0,
};

const stepContentStyle: React.CSSProperties = {
  flex: 1,
};

const stepTitleStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "15px",
  fontWeight: "600",
  margin: "0 0 4px 0",
  fontFamily: fonts.sans,
};

const stepDescStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0",
  fontFamily: fonts.sans,
};

const ctaContainerStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  padding: "24px",
  borderRadius: "8px",
  textAlign: "center",
  margin: "32px 0",
  border: `1px solid ${colors.border}`,
};

const ctaTextStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "15px",
  margin: "0 0 16px 0",
  fontFamily: fonts.sans,
};

export default WelcomeEmailTemplate;
