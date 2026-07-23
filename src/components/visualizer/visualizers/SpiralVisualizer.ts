import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

const NUM_ARMS = 6;
const POINTS_PER_ARM = 40;
let spiralCos: Float32Array | null = null;
let spiralSin: Float32Array | null = null;
let shock = 0;
let smoothBass = 0;
let rotSpeed = 0;

function initSpiral() {
  if (spiralCos) return;
  spiralCos = new Float32Array(POINTS_PER_ARM);
  spiralSin = new Float32Array(POINTS_PER_ARM);
  for (let i = 0; i < POINTS_PER_ARM; i++) {
    const t = i / POINTS_PER_ARM;
    const angle = t * Math.PI * 4;
    spiralCos[i] = Math.cos(angle);
    spiralSin[i] = Math.sin(angle);
  }
}

function sampleBar(bars: number[], u: number): number {
  if (!bars.length) return 0;
  const f = u * (bars.length - 1);
  const i = Math.floor(f);
  return (bars[i] ?? 0) * (1 - (f - i)) + (bars[Math.min(bars.length - 1, i + 1)] ?? 0) * (f - i);
}

export const SpiralVisualizer: Visualizer = {
  name: 'Spiral Galaxy',
  id: 'spiral',

  init: () => {
    initSpiral();
    shock = 0;
    smoothBass = 0;
    rotSpeed = 0;
  },

  cleanup: () => {},

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;

    const dt = Math.min(deltaTime, 0.05);
    initSpiral();

    // Beat envelope
    if (isBeat) shock = Math.min(1, shock + 0.7);
    shock = Math.max(0, shock - dt * 1.8);

    // Smoothed bass for core pulse
    smoothBass += (bass - smoothBass) * Math.min(1, dt * 8);

    // Audio-driven rotation speed
    rotSpeed += ((0.3 + volume * 0.6 + shock * 1.2) - rotSpeed) * Math.min(1, dt * 4);

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.2 + (1 - volume) * 0.25;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const maxRadius = Math.min(width, height) * 0.4;
    const rotation = time * rotSpeed;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const numArms = getAdaptiveCount(NUM_ARMS, quality);
    const bandColors = [colors.primary, colors.secondary, colors.accent];

    c.globalCompositeOperation = 'lighter';

    for (let arm = 0; arm < numArms; arm++) {
      const armOffset = (arm / numArms) * Math.PI * 2;
      const cosA = Math.cos(armOffset);
      const sinA = Math.sin(armOffset);
      const colorIndex = arm % 3;

      // Glow pass (wide, dim)
      c.strokeStyle = bandColors[colorIndex];
      c.lineWidth = 4 + bass * 6 + shock * 4;
      c.globalAlpha = 0.12 + shock * 0.1;
      c.beginPath();

      for (let i = 0; i < POINTS_PER_ARM; i++) {
        const t = i / POINTS_PER_ARM;
        const barValue = sampleBar(bars, t);
        const shockWarp = shock * Math.sin(t * 8 - time * 5) * maxRadius * 0.05;
        const radius = t * maxRadius * (0.3 + barValue * 0.7 + mid * 0.3) + shockWarp;

        const baseCos = spiralCos![i] * cosA - spiralSin![i] * sinA;
        const baseSin = spiralSin![i] * cosA + spiralCos![i] * sinA;
        const cos = baseCos * cosR - baseSin * sinR;
        const sin = baseSin * cosR + baseCos * sinR;

        const x = centerX + cos * radius;
        const y = centerY + sin * radius;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();

      // Core pass (thin, bright)
      c.lineWidth = 2 + bass * 2;
      c.globalAlpha = 0.6 + volume * 0.3 + shock * 0.1;
      c.beginPath();

      for (let i = 0; i < POINTS_PER_ARM; i++) {
        const t = i / POINTS_PER_ARM;
        const barValue = sampleBar(bars, t);
        const shockWarp = shock * Math.sin(t * 8 - time * 5) * maxRadius * 0.05;
        const radius = t * maxRadius * (0.3 + barValue * 0.7 + mid * 0.3) + shockWarp;

        const baseCos = spiralCos![i] * cosA - spiralSin![i] * sinA;
        const baseSin = spiralSin![i] * cosA + spiralCos![i] * sinA;
        const cos = baseCos * cosR - baseSin * sinR;
        const sin = baseSin * cosR + baseCos * sinR;

        const x = centerX + cos * radius;
        const y = centerY + sin * radius;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }

    // Center glow
    const glowSize = 20 + smoothBass * 35 + shock * 20;
    c.beginPath();
    c.arc(centerX, centerY, glowSize * 1.5, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.15 + shock * 0.15;
    c.fill();

    c.beginPath();
    c.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.6 + shock * 0.2;
    c.fill();

    c.beginPath();
    c.arc(centerX, centerY, glowSize * 0.4, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.8;
    c.fill();

    // Beat shock ring
    if (shock > 0.05) {
      const ringR = (1 - shock) * maxRadius * 0.8;
      c.beginPath();
      c.arc(centerX, centerY, ringR, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = shock * 3;
      c.globalAlpha = shock * 0.5;
      c.stroke();
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
