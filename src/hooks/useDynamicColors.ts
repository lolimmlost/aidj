/**
 * useDynamicColors Hook
 *
 * Extracts dominant colors from album artwork and provides them
 * as CSS custom properties for dynamic theming.
 *
 * Usage:
 * ```tsx
 * const { style, colors } = useDynamicColors(albumArtUrl);
 * return <div style={style}>...</div>;
 * ```
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 2.2
 */

import { useState, useEffect, useRef } from 'react';
import { extractDominantColors, type DominantColors } from '@/lib/utils/color-extraction';

interface UseDynamicColorsResult {
  /** CSS custom properties object to spread on a container */
  style: React.CSSProperties;
  /** Raw extracted colors */
  colors: DominantColors | null;
  /** Whether colors are still loading */
  isLoading: boolean;
}

export function useDynamicColors(imageUrl?: string | null): UseDynamicColorsResult {
  const [colors, setColors] = useState<DominantColors | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!imageUrl || imageUrl === prevUrlRef.current) return;
    prevUrlRef.current = imageUrl;

    let cancelled = false;
    setIsLoading(true);

    extractDominantColors(imageUrl).then(result => {
      if (!cancelled) {
        setColors(result);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const style: React.CSSProperties = colors
    ? {
        '--dynamic-primary': colors.primary,
        '--dynamic-secondary': colors.secondary,
        '--dynamic-bg': colors.isDark
          ? `${colors.primary}20`
          : `${colors.primary}15`,
      } as React.CSSProperties
    : {};

  return { style, colors, isLoading };
}
