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
let shock = 0;
let warpTrail = 0;

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
    shock = 0;
    warpTrail = 0;
  },

  cleanup: () => {
    stars = [];
    initialized = false;
    initializedCount = 0;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, deltaTime, quality } = ctx;
    const { bass, mid, treble, volume, isBeat } = audioData;
    const maxStars = getAdaptiveCount(BASE_MAX_STARS, quality);
    const dt = Math.min(deltaTime, 0.05);

    if (!initialized || stars.length === 0 || initializedCount !== maxStars) {
      initStars(width, height, maxStars);
    }

    // Beat envelopes
    if (isBeat) {
      shock = Math.min(1, shock + 0.8);
      warpTrail = Math.min(1, warpTrail + 0.6);
    }
    shock = Math.max(0, shock - dt * 1.8);
    warpTrail = Math.max(0, warpTrail - dt * 1.2);

    // Motion trail — longer trails on beats for warp effect
    const trailAlpha = 0.15 + (1 - volume) * 0.25 - warpTrail * 0.1;
    c.fillStyle = colors.background;
    c.globalAlpha = Math.max(0.05, trailAlpha);
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    // Speed driven by audio — shock creates warp burst
    const baseSpeed = 8 + volume * 20 + bass * 15 + shock * 40;
    const speed = baseSpeed;

    c.lineCap = 'round';
    c.globalCompositeOperation = 'lighter';

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];

      const prevZ = star.z;
      star.prevX = (star.x / prevZ) * 500 + centerX;
      star.prevY = (star.y / prevZ) * 500 + centerY;

      star.z -= speed;

      if (star.z <= 1) {
        stars[i] = createStar(width, height, false);
        continue;
      }

      const x = (star.x / star.z) * 500 + centerX;
      const y = (star.y / star.z) * 500 + centerY;

      if (x < -20 || x > width + 20 || y < -20 || y > height + 20) {
        stars[i] = createStar(width, height, false);
        continue;
      }

      const depth = star.z / 1000;
      const trailLen = Math.sqrt((x - star.prevX) ** 2 + (y - star.prevY) ** 2);

      if (depth < 0.33) {
        c.strokeStyle = colors.primary;
        c.globalAlpha = 0.9 + shock * 0.1;
        c.lineWidth = 2 + mid * 2 + shock * 2 + (trailLen > 20 ? 1 : 0);
      } else if (depth < 0.66) {
        c.strokeStyle = colors.secondary;
        c.globalAlpha = 0.6 + shock * 0.2;
        c.lineWidth = 1.5 + shock;
      } else {
        c.strokeStyle = colors.accent;
        c.globalAlpha = 0.3 + treble * 0.3;
        c.lineWidth = 1;
      }

      c.beginPath();
      c.moveTo(star.prevX, star.prevY);
      c.lineTo(x, y);
      c.stroke();

      // Near stars get a glow dot
      if (depth < 0.2) {
        c.globalAlpha = (0.4 + shock * 0.4) * (1 - depth * 5);
        c.beginPath();
        c.arc(x, y, 2 + bass * 3, 0, Math.PI * 2);
        c.fillStyle = colors.primary;
        c.fill();
      }
    }

    // Center glow — pulses with bass and shock
    const glowSize = 30 + bass * 50 + shock * 30;
    c.beginPath();
    c.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.12 + bass * 0.15 + shock * 0.15;
    c.fill();

    // Inner core
    c.beginPath();
    c.arc(centerX, centerY, glowSize * 0.3, 0, Math.PI * 2);
    c.globalAlpha = 0.2 + shock * 0.3;
    c.fill();

    // Beat shock ring — expanding, decaying
    if (shock > 0.05) {
      const ringRadius = (1 - shock) * Math.min(width, height) * 0.5;
      c.beginPath();
      c.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = 2 + shock * 4;
      c.globalAlpha = shock * 0.5;
      c.stroke();
    }

    // Beat flash vignette
    if (shock > 0.3) {
      c.globalAlpha = (shock - 0.3) * 0.15;
      c.fillStyle = colors.accent;
      c.fillRect(0, 0, width, height);
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
