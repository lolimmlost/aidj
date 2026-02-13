/**
 * Dynamic Album Art Color Extraction
 *
 * Extracts dominant colors from album artwork images to create
 * dynamic accent colors for the UI (now playing, hero gradient, etc.)
 *
 * Uses canvas pixel sampling with k-means-inspired clustering
 * to find the most visually prominent and vibrant colors.
 *
 * @see docs/architecture/analytics-discovery-upgrades-plan.md - Item 2.2
 */

const colorCache = new Map<string, DominantColors>();

export interface DominantColors {
  /** Most prominent color */
  primary: string;
  /** Second most prominent color */
  secondary: string;
  /** Whether the palette is dark (for text contrast) */
  isDark: boolean;
}

const DEFAULT_COLORS: DominantColors = {
  primary: 'hsl(262, 83%, 58%)', // Default purple
  secondary: 'hsl(280, 70%, 40%)',
  isDark: true,
};

/**
 * Extract dominant colors from an image URL.
 * Results are cached by URL.
 *
 * @param imageUrl - URL of the image to analyze
 * @returns Promise resolving to dominant color palette
 */
export async function extractDominantColors(imageUrl: string): Promise<DominantColors> {
  // Check cache
  const cached = colorCache.get(imageUrl);
  if (cached) return cached;

  try {
    const colors = await extractFromImage(imageUrl);
    colorCache.set(imageUrl, colors);

    // Limit cache size
    if (colorCache.size > 100) {
      const firstKey = colorCache.keys().next().value;
      if (firstKey) colorCache.delete(firstKey);
    }

    return colors;
  } catch {
    return DEFAULT_COLORS;
  }
}

async function extractFromImage(imageUrl: string): Promise<DominantColors> {
  return new Promise((resolve, _reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(DEFAULT_COLORS);
          return;
        }

        // Downscale for performance
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;

        // Collect pixel colors, skipping very dark/light ones
        const colorBuckets = new Map<string, { r: number; g: number; b: number; count: number }>();

        for (let i = 0; i < pixels.length; i += 16) { // Sample every 4th pixel
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          // Skip near-black and near-white
          const brightness = (r + g + b) / 3;
          if (brightness < 20 || brightness > 235) continue;

          // Quantize to reduce unique colors
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;

          const existing = colorBuckets.get(key);
          if (existing) {
            existing.count++;
            // Running average
            existing.r = (existing.r * (existing.count - 1) + r) / existing.count;
            existing.g = (existing.g * (existing.count - 1) + g) / existing.count;
            existing.b = (existing.b * (existing.count - 1) + b) / existing.count;
          } else {
            colorBuckets.set(key, { r, g, b, count: 1 });
          }
        }

        // Sort by count + saturation (prefer vibrant colors)
        const sorted = Array.from(colorBuckets.values())
          .map(c => ({
            ...c,
            saturation: getSaturation(c.r, c.g, c.b),
            score: c.count * (1 + getSaturation(c.r, c.g, c.b)),
          }))
          .sort((a, b) => b.score - a.score);

        if (sorted.length === 0) {
          resolve(DEFAULT_COLORS);
          return;
        }

        const primary = sorted[0];
        // Find a secondary color that's visually distinct
        const secondary = sorted.find(c =>
          colorDistance(primary, c) > 80 && c !== primary
        ) || sorted[Math.min(1, sorted.length - 1)];

        const primaryBrightness = (primary.r + primary.g + primary.b) / 3;

        resolve({
          primary: `rgb(${Math.round(primary.r)}, ${Math.round(primary.g)}, ${Math.round(primary.b)})`,
          secondary: `rgb(${Math.round(secondary.r)}, ${Math.round(secondary.g)}, ${Math.round(secondary.b)})`,
          isDark: primaryBrightness < 128,
        });
      } catch {
        resolve(DEFAULT_COLORS);
      }
    };

    img.onerror = () => resolve(DEFAULT_COLORS);

    // Timeout after 5 seconds
    setTimeout(() => resolve(DEFAULT_COLORS), 5000);

    img.src = imageUrl;
  });
}

function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.sqrt(
    (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
  );
}

/**
 * Clear the color cache.
 */
export function clearColorCache(): void {
  colorCache.clear();
}
