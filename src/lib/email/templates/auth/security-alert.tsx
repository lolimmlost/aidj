import { Heading, Section, Text } from "@react-email/components";
import { EmailButton } from "../shared/button";
import { EmailLayout } from "../shared/layout";
import { colors, fonts } from "../shared/styles";

type AlertType =
  | "new-device"
  | "password-changed"
  | "email-changed"
  | "2fa-enabled"
  | "2fa-disabled";

interface SecurityAlertProps {
  userName: string;
  alertType: AlertType;
  deviceInfo?: {
    browser?: string;
    os?: string;
    location?: string;
  };
  timestamp: Date;
  actionUrl: string;
}

function getAlertContent(alertType: AlertType) {
  switch (alertType) {
    case "new-device":
      return {
        title: "New Device Sign-In",
        message:
          "We noticed a new sign-in to your AIDJ account from a device we haven't seen before.",
        action: "If this wasn't you, secure your account immediately.",
      };
    case "password-changed":
      return {
        title: "Password Changed",
        message:
          "The password for your AIDJ account was recently changed.",
        action:
          "If you didn't make this change, reset your password immediately.",
      };
    case "email-changed":
      return {
        title: "Email Address Changed",
        message:
          "The email address for your AIDJ account was recently changed.",
        action:
          "If you didn't make this change, contact support immediately.",
      };
    case "2fa-enabled":
      return {
        title: "Two-Factor Authentication Enabled",
        message:
          "Two-factor authentication was just enabled on your AIDJ account.",
        action:
          "If you didn't make this change, secure your account immediately.",
      };
    case "2fa-disabled":
      return {
        title: "Two-Factor Authentication Disabled",
        message:
          "Two-factor authentication was just disabled on your AIDJ account. Your account is now less secure.",
        action:
          "If you didn't make this change, secure your account immediately.",
      };
  }
}

export function SecurityAlertTemplate({
  userName,
  alertType,
  deviceInfo,
  timestamp,
  actionUrl,
}: SecurityAlertProps) {
  const content = getAlertContent(alertType);
  const formattedDate = timestamp.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <EmailLayout
      previewText={`Security Alert: ${content.title}`}
      headerSubtitle="Security Alert"
    >
      <Section style={alertBannerStyle}>
        <Heading as="h2" style={alertTitleStyle}>
          {content.title}
        </Heading>
      </Section>

      <Text style={textStyle}>Hi {userName || "there"},</Text>

      <Text style={textStyle}>{content.message}</Text>

      <Section style={detailsBoxStyle}>
        <Text style={detailsLabelStyle}>Details</Text>

        <Section style={detailRowStyle}>
          <Text style={detailKeyStyle}>When</Text>
          <Text style={detailValueStyle}>{formattedDate}</Text>
        </Section>

        {deviceInfo?.browser && (
          <Section style={detailRowStyle}>
            <Text style={detailKeyStyle}>Browser</Text>
            <Text style={detailValueStyle}>{deviceInfo.browser}</Text>
          </Section>
        )}

        {deviceInfo?.os && (
          <Section style={detailRowStyle}>
            <Text style={detailKeyStyle}>System</Text>
            <Text style={detailValueStyle}>{deviceInfo.os}</Text>
          </Section>
        )}

        {deviceInfo?.location && (
          <Section style={detailRowStyle}>
            <Text style={detailKeyStyle}>Location</Text>
            <Text style={detailValueStyle}>{deviceInfo.location}</Text>
          </Section>
        )}
      </Section>

      <Section style={wasYouContainerStyle}>
        <Text style={wasYouTitleStyle}>Was this you?</Text>
        <Text style={wasYouTextStyle}>
          <strong style={{ color: colors.foreground }}>If yes:</strong> You
          can safely ignore this email.
        </Text>
        <Text style={wasYouTextStyle}>
          <strong style={{ color: colors.foreground }}>If no:</strong>{" "}
          {content.action}
        </Text>
      </Section>

      <Section style={buttonContainerStyle}>
        <EmailButton href={actionUrl} variant="danger">
          Secure My Account
        </EmailButton>
      </Section>

      <Section style={tipsContainerStyle}>
        <Text style={tipsTitleStyle}>Security Tips</Text>
        <Text style={tipsTextStyle}>
          &bull; Use a strong, unique password for your account
        </Text>
        <Text style={tipsTextStyle}>
          &bull; Enable two-factor authentication for extra security
        </Text>
        <Text style={tipsTextStyle}>
          &bull; Never share your password or verification codes
        </Text>
        <Text style={tipsTextStyle}>
          &bull; Log out of shared or public devices after use
        </Text>
      </Section>
    </EmailLayout>
  );
}

const alertBannerStyle: React.CSSProperties = {
  backgroundColor: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.2)",
  padding: "20px",
  borderRadius: "8px",
  textAlign: "center",
  marginBottom: "24px",
};

const alertTitleStyle: React.CSSProperties = {
  color: colors.destructive,
  fontSize: "18px",
  fontWeight: "600",
  margin: "0",
  fontFamily: fonts.sans,
};

const textStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
  fontFamily: fonts.sans,
};

const detailsBoxStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  padding: "20px",
  borderRadius: "8px",
  margin: "24px 0",
  border: `1px solid ${colors.border}`,
};

const detailsLabelStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 16px 0",
  fontFamily: fonts.sans,
};

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "8px",
};

const detailKeyStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "13px",
  margin: "0",
  fontFamily: fonts.sans,
};

const detailValueStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "13px",
  margin: "0",
  fontFamily: fonts.sans,
  textAlign: "right",
};

const wasYouContainerStyle: React.CSSProperties = {
  borderLeft: `3px solid ${colors.primary}`,
  paddingLeft: "16px",
  margin: "24px 0",
};

const wasYouTitleStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "15px",
  fontWeight: "600",
  margin: "0 0 12px 0",
  fontFamily: fonts.sans,
};

const wasYouTextStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 8px 0",
  fontFamily: fonts.sans,
};

const buttonContainerStyle: React.CSSProperties = {
  textAlign: "center",
  margin: "32px 0",
};

const tipsContainerStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  padding: "20px",
  borderRadius: "8px",
  margin: "24px 0 0 0",
  border: `1px solid ${colors.border}`,
};

const tipsTitleStyle: React.CSSProperties = {
  color: colors.foreground,
  fontSize: "13px",
  fontWeight: "600",
  margin: "0 0 12px 0",
  fontFamily: fonts.sans,
};

const tipsTextStyle: React.CSSProperties = {
  color: colors.mutedForeground,
  fontSize: "13px",
  margin: "0 0 6px 0",
  fontFamily: fonts.sans,
};

export default SecurityAlertTemplate;
