import { Toaster as Sonner, ToasterProps } from "sonner";
import { useTheme } from "@/components/theme-provider";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        className: "aidj-toast",
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg":
            theme === "dark"
              ? "oklch(0.16 0.04 160)"
              : "oklch(0.97 0.02 160)",
          "--success-text":
            theme === "dark"
              ? "oklch(0.8 0.18 160)"
              : "oklch(0.4 0.18 160)",
          "--success-border":
            theme === "dark"
              ? "oklch(0.5 0.15 160 / 0.3)"
              : "oklch(0.5 0.15 160 / 0.2)",
          "--error-bg":
            theme === "dark"
              ? "oklch(0.16 0.04 25)"
              : "oklch(0.97 0.02 25)",
          "--error-text":
            theme === "dark"
              ? "oklch(0.8 0.18 25)"
              : "oklch(0.5 0.22 25)",
          "--error-border":
            theme === "dark"
              ? "oklch(0.55 0.2 25 / 0.3)"
              : "oklch(0.55 0.2 25 / 0.2)",
          "--info-bg":
            theme === "dark"
              ? "oklch(0.16 0.04 260)"
              : "oklch(0.97 0.02 260)",
          "--info-text":
            theme === "dark"
              ? "oklch(0.8 0.15 260)"
              : "oklch(0.45 0.18 260)",
          "--info-border":
            theme === "dark"
              ? "oklch(0.55 0.15 260 / 0.3)"
              : "oklch(0.55 0.15 260 / 0.2)",
          "--warning-bg":
            theme === "dark"
              ? "oklch(0.16 0.04 80)"
              : "oklch(0.97 0.02 80)",
          "--warning-text":
            theme === "dark"
              ? "oklch(0.82 0.16 80)"
              : "oklch(0.5 0.18 80)",
          "--warning-border":
            theme === "dark"
              ? "oklch(0.6 0.16 80 / 0.3)"
              : "oklch(0.6 0.16 80 / 0.2)",
        } as React.CSSProperties
      }
      visibleToasts={4}
      {...props}
    />
  );
};

export { Toaster };
