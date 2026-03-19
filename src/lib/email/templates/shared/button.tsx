import { Button } from "@react-email/components";
import { colors, fonts, radius } from "./styles";

interface EmailButtonProps {
  children: React.ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "danger";
}

export function EmailButton({
  children,
  href,
  variant = "primary",
}: EmailButtonProps) {
  return (
    <Button href={href} style={{ ...baseStyle, ...variantStyles[variant] }}>
      {children}
    </Button>
  );
}

const baseStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 24px",
  fontSize: "14px",
  fontWeight: "500",
  textDecoration: "none",
  textAlign: "center",
  borderRadius: radius.lg,
  fontFamily: fonts.sans,
  border: "none",
  cursor: "pointer",
};

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: colors.primary,
    color: colors.primaryForeground,
  },
  secondary: {
    backgroundColor: colors.secondary,
    color: colors.secondaryForeground,
    border: `1px solid ${colors.border}`,
  },
  danger: {
    backgroundColor: colors.destructive,
    color: colors.destructiveForeground,
  },
};
