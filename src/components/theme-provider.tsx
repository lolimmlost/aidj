import { ScriptOnce } from "@tanstack/react-router";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light" | "system";
type VisualTheme = "default" | "midnight-club" | "vinyl-lounge" | "arctic-minimal" | "deep-sea" | "sunset-haze";

const MEDIA = "(prefers-color-scheme: dark)";

const VISUAL_THEME_STORAGE_KEY = "visual-theme";

/** Which dark/light mode each visual theme forces (null = respect user preference) */
const VISUAL_THEME_MODE: Record<VisualTheme, "dark" | "light" | null> = {
  default: null,
  "midnight-club": "dark",
  "vinyl-lounge": "light",
  "arctic-minimal": "light",
  "deep-sea": "dark",
  "sunset-haze": "dark",
};

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  visualTheme: VisualTheme;
  setVisualTheme: (theme: VisualTheme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  visualTheme: "default",
  setVisualTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

// references:
// https://ui.shadcn.com/docs/dark-mode/vite
// https://github.com/pacocoursey/next-themes/blob/main/next-themes/src/index.tsx
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () =>
      (typeof window !== "undefined"
        ? (localStorage.getItem(storageKey) as Theme)
        : null) || defaultTheme,
  );

  const [visualTheme, setVisualThemeState] = useState<VisualTheme>(
    () =>
      (typeof window !== "undefined"
        ? (localStorage.getItem(VISUAL_THEME_STORAGE_KEY) as VisualTheme)
        : null) || "default",
  );

  const setVisualTheme = useCallback((vt: VisualTheme) => {
    setVisualThemeState(vt);
    if (vt === "default") {
      localStorage.removeItem(VISUAL_THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(VISUAL_THEME_STORAGE_KEY, vt);
    }
  }, []);

  const handleMediaQuery = useCallback(
    (e: MediaQueryListEvent | MediaQueryList) => {
      const forcedMode = VISUAL_THEME_MODE[visualTheme];
      // If a visual theme forces a mode, ignore system preference changes
      if (forcedMode) return;
      if (theme !== "system") return;
      const root = window.document.documentElement;
      const targetTheme = e.matches ? "dark" : "light";
      if (!root.classList.contains(targetTheme)) {
        root.classList.remove("light", "dark");
        root.classList.add(targetTheme);
      }
    },
    [theme, visualTheme],
  );

  // Listen for system preference changes
  useEffect(() => {
    const media = window.matchMedia(MEDIA);

    media.addEventListener("change", handleMediaQuery);
    handleMediaQuery(media);

    return () => media.removeEventListener("change", handleMediaQuery);
  }, [handleMediaQuery]);

  // Apply dark/light class based on theme + visual theme
  useEffect(() => {
    const root = window.document.documentElement;
    const forcedMode = VISUAL_THEME_MODE[visualTheme];

    let targetTheme: string;

    if (forcedMode) {
      // Visual theme forces a specific mode
      targetTheme = forcedMode;
    } else if (theme === "system") {
      localStorage.removeItem(storageKey);
      targetTheme = window.matchMedia(MEDIA).matches ? "dark" : "light";
    } else {
      localStorage.setItem(storageKey, theme);
      targetTheme = theme;
    }

    if (!root.classList.contains(targetTheme)) {
      root.classList.remove("light", "dark");
      root.classList.add(targetTheme);
    }
  }, [theme, visualTheme, storageKey]);

  // Apply data-theme attribute on documentElement
  useEffect(() => {
    const root = window.document.documentElement;
    if (visualTheme === "default") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", visualTheme);
    }
  }, [visualTheme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      visualTheme,
      setVisualTheme,
    }),
    [theme, visualTheme, setVisualTheme],
  );

  return (
    <ThemeProviderContext {...props} value={value}>
      <ScriptOnce>
        {/* Apply theme early to avoid FOUC */}
        {`(function(){
          var vt = localStorage.getItem('${VISUAL_THEME_STORAGE_KEY}');
          if (vt && vt !== 'default') {
            document.documentElement.setAttribute('data-theme', vt);
          }
          var forcedModes = ${JSON.stringify(VISUAL_THEME_MODE)};
          var forced = vt && forcedModes[vt];
          if (forced) {
            document.documentElement.classList.remove('light','dark');
            document.documentElement.classList.add(forced);
          } else {
            document.documentElement.classList.toggle(
              'dark',
              localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
            );
          }
        })()`}
      </ScriptOnce>
      {children}
    </ThemeProviderContext>
  );
}

export const useTheme = () => {
  const context = use(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
