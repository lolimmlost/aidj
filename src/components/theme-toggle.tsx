import { MoonIcon, PaletteIcon, SunIcon } from "lucide-react";

import { useTheme } from "~/components/theme-provider";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

const VISUAL_THEMES = [
  { value: "default" as const, label: "Default", colors: ["#7c3aed", "#ec4899"] },
  { value: "midnight-club" as const, label: "Midnight Club", colors: ["#f472b6", "#60a5fa"] },
  { value: "vinyl-lounge" as const, label: "Vinyl Lounge", colors: ["#d97706", "#92400e"] },
  { value: "arctic-minimal" as const, label: "Arctic Minimal", colors: ["#1e3a5f", "#e2e8f0"] },
  { value: "deep-sea" as const, label: "Deep Sea", colors: ["#0d9488", "#06b6d4"] },
  { value: "sunset-haze" as const, label: "Sunset Haze", colors: ["#f97316", "#f43f5e"] },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, visualTheme, setVisualTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <PaletteIcon className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Theme settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Visual Theme
        </DropdownMenuLabel>
        {VISUAL_THEMES.map((vt) => (
          <DropdownMenuCheckboxItem
            key={vt.value}
            checked={visualTheme === vt.value}
            onCheckedChange={(v) => v && setVisualTheme(vt.value)}
          >
            <span className="flex items-center gap-2">
              <span className="flex shrink-0">
                {vt.colors.map((color, i) => (
                  <span
                    key={i}
                    className="h-3 w-3 rounded-full border border-border/50"
                    style={{
                      backgroundColor: color,
                      marginLeft: i > 0 ? "-4px" : undefined,
                    }}
                  />
                ))}
              </span>
              {vt.label}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <SunIcon className="h-3 w-3" />
            <MoonIcon className="h-3 w-3" />
            Brightness
          </span>
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={theme === "light"}
          onCheckedChange={(v) => v && setTheme("light")}
        >
          Light
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={theme === "dark"}
          onCheckedChange={(v) => v && setTheme("dark")}
        >
          Dark
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={theme === "system"}
          onCheckedChange={(v) => v && setTheme("system")}
        >
          System
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
