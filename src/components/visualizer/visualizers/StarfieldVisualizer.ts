import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

interface Star {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  size: number;
}

const BASE_MAX_STARS = 200;
let stars: Star[] = [];
let initialized = false;
let initializedCount = 0;

function initStars(width: number, height: number, count: number) {
  stars = [];
  for (let i = 0; i < count; i++) {
    stars.push(createStar(width, height, true));
  }
  initialized = true;
  initializedCount = count;
}

function createStar(width: number, height: number, randomZ: boolean): Star {
  return {
    x: (Math.random() - 0.5) * width * 2,
    y: (Math.random() - 0.5) * height * 2,
    z: randomZ ? Math.random() * 1000 : 1000,
    prevX: 0,
    prevY: 0,
    size: 1 + Math.random() * 2,
  };
}

export const StarfieldVisualizer: Visualizer = {
  name: 'Starfield',
  id: 'starfield',

  init: () => {
    stars = [];
    initialized = false;
    initializedCount = 0;
  },

  cleanup: () => {
    stars = [];
    initialized = false;
    initializedCount = 0;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, quality } = ctx;
    const { bass, mid, volume, isBeat } = audioData;
    const maxStars = getAdaptiveCount(BASE_MAX_STARS, quality);

    // Initialize stars if needed or count changed due to quality
    if (!initialized || stars.length === 0 || initializedCount !== maxStars) {
      initStars(width, height, maxStars);
    }

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    // Speed based on audio (ensure minimum speed even without audio)
    const baseSpeed = 8 + volume * 20 + bass * 15;
    const speed = isBeat ? baseSpeed * 2 : baseSpeed;

    // Update and draw stars
    c.lineCap = 'round';

    // Batch by color based on depth
    const nearStars: Star[] = [];
    const midStars: Star[] = [];
    const farStars: Star[] = [];

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];

      // Store previous position for trail
      const prevZ = star.z;
      star.prevX = (star.x / prevZ) * 500 + centerX;
      star.prevY = (star.y / prevZ) * 500 + centerY;

      // Move star toward camera
      star.z -= speed;

      // Reset star if too close
      if (star.z <= 1) {
        stars[i] = createStar(width, height, false);
        continue;
      }

      // Project to 2D
      const x = (star.x / star.z) * 500 + centerX;
      const y = (star.y / star.z) * 500 + centerY;

      // Skip if off screen
      if (x < 0 || x > width || y < 0 || y > height) {
        stars[i] = createStar(width, height, false);
        continue;
      }

      // Categorize by depth
      const depth = star.z / 1000;
      if (depth < 0.33) {
        nearStars.push({ ...star, prevX: star.prevX, prevY: star.prevY });
      } else if (depth < 0.66) {
        midStars.push({ ...star, prevX: star.prevX, prevY: star.prevY });
      } else {
        farStars.push({ ...star, prevX: star.prevX, prevY: star.prevY });
      }
    }

    // Draw far stars (dimmest)
    c.strokeStyle = colors.accent;
    c.globalAlpha = 0.4;
    c.lineWidth = 1;
    c.beginPath();
    for (const star of farStars) {
      const x = (star.x / star.z) * 500 + centerX;
      const y = (star.y / star.z) * 500 + centerY;
      c.moveTo(star.prevX, star.prevY);
      c.lineTo(x, y);
    }
    c.stroke();

    // Draw mid stars
    c.strokeStyle = colors.secondary;
    c.globalAlpha = 0.6;
    c.lineWidth = 1.5;
    c.beginPath();
    for (const star of midStars) {
      const x = (star.x / star.z) * 500 + centerX;
      const y = (star.y / star.z) * 500 + centerY;
      c.moveTo(star.prevX, star.prevY);
      c.lineTo(x, y);
    }
    c.stroke();

    // Draw near stars (brightest)
    c.strokeStyle = colors.primary;
    c.globalAlpha = 1;
    c.lineWidth = 2 + mid * 2;
    c.beginPath();
    for (const star of nearStars) {
      const x = (star.x / star.z) * 500 + centerX;
      const y = (star.y / star.z) * 500 + centerY;
      c.moveTo(star.prevX, star.prevY);
      c.lineTo(x, y);
    }
    c.stroke();

    c.globalAlpha = 1;

    // Center glow
    const glowSize = 30 + bass * 40;
    c.beginPath();
    c.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.1 + bass * 0.2;
    c.fill();
    c.globalAlpha = 1;

    // Beat flash - radial burst
    if (isBeat) {
      c.beginPath();
      c.arc(centerX, centerY, Math.min(width, height) * 0.4, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = 3;
      c.globalAlpha = 0.4;
      c.stroke();
      c.globalAlpha = 1;
    }
  },
};
