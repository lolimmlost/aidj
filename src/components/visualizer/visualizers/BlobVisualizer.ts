import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

let shock = 0;
let smoothBass = 0;
let smoothMid = 0;
let smoothTreble = 0;

function sampleBar(bars: number[], u: number): number {
  if (!bars.length) return 0;
  const f = u * (bars.length - 1);
  const i = Math.floor(f);
  const frac = f - i;
  return (bars[i] ?? 0) * (1 - frac) + (bars[Math.min(bars.length - 1, i + 1)] ?? 0) * frac;
}

export const BlobVisualizer: Visualizer = {
  name: 'Organic Blob',
  id: 'blob',

  init: () => {
    shock = 0;
    smoothBass = 0;
    smoothMid = 0;
    smoothTreble = 0;
  },

  cleanup: () => {},

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;

    const dt = Math.min(deltaTime, 0.05);

    // Smoothed band energies
    smoothBass += (bass - smoothBass) * Math.min(1, dt * 8);
    smoothMid += (mid - smoothMid) * Math.min(1, dt * 8);
    smoothTreble += (treble - smoothTreble) * Math.min(1, dt * 8);

    // Beat envelope
    if (isBeat) shock = Math.min(1, shock + 0.7);
    shock = Math.max(0, shock - dt * 2.0);

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.2 + (1 - volume) * 0.25;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const baseRadius = Math.min(width, height) * 0.2;
    const points = getAdaptiveCount(64, quality);

    const layers = [
      { scale: 1.3, alpha: 0.15, band: smoothTreble, color: colors.accent },
      { scale: 1.15, alpha: 0.3, band: smoothMid, color: colors.secondary },
      { scale: 1.0, alpha: 0.65, band: smoothBass, color: colors.primary },
    ];

    c.globalCompositeOperation = 'lighter';

    for (const layer of layers) {
      const timeOffset = time * (0.4 + layer.band * 0.8);

      // Outer glow pass
      c.beginPath();
      for (let i = 0; i <= points; i++) {
        const u = i / points;
        const angle = u * Math.PI * 2;
        const barValue = sampleBar(bars, u);

        const noise =
          Math.sin(angle * 3 + timeOffset) * 0.4 +
          Math.sin(angle * 5 + timeOffset * 0.7) * 0.25 +
          Math.sin(angle * 7 + timeOffset * 1.3) * 0.15;

        const shockWarp = shock * Math.sin(angle * 2 - time * 4) * 0.15;

        const radius =
          baseRadius * layer.scale *
          (1 + barValue * 0.5 * layer.band + noise * 0.2 + layer.band * 0.3 + shockWarp);

        const x = centerX + Math.cos(angle) * (radius + 8);
        const y = centerY + Math.sin(angle) * (radius + 8);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      c.fillStyle = layer.color;
      c.globalAlpha = layer.alpha * 0.4 + shock * 0.1;
      c.fill();

      // Body fill
      c.beginPath();
      for (let i = 0; i <= points; i++) {
        const u = i / points;
        const angle = u * Math.PI * 2;
        const barValue = sampleBar(bars, u);

        const noise =
          Math.sin(angle * 3 + timeOffset) * 0.4 +
          Math.sin(angle * 5 + timeOffset * 0.7) * 0.25 +
          Math.sin(angle * 7 + timeOffset * 1.3) * 0.15;

        const shockWarp = shock * Math.sin(angle * 2 - time * 4) * 0.15;

        const radius =
          baseRadius * layer.scale *
          (1 + barValue * 0.5 * layer.band + noise * 0.2 + layer.band * 0.3 + shockWarp);

        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      c.fillStyle = layer.color;
      c.globalAlpha = layer.alpha + shock * 0.15;
      c.fill();

      // Edge stroke
      c.strokeStyle = layer.color;
      c.lineWidth = 1.5 + layer.band * 2;
      c.globalAlpha = layer.alpha * 0.5;
      c.stroke();
    }

    // Center glow — pulses with bass + shock
    const glowRadius = baseRadius * 0.4 * (1 + volume * 0.5 + shock * 0.4);
    const coreGrad = c.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.2, colors.primary);
    coreGrad.addColorStop(0.6, colors.secondary + '66');
    coreGrad.addColorStop(1, 'transparent');
    c.beginPath();
    c.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    c.fillStyle = coreGrad;
    c.globalAlpha = 0.6 + shock * 0.3;
    c.fill();

    // Beat shock ring
    if (shock > 0.05) {
      const ringR = baseRadius * (1.5 + (1 - shock) * 0.8);
      c.beginPath();
      c.arc(centerX, centerY, ringR, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = 2 + shock * 4;
      c.globalAlpha = shock * 0.5;
      c.stroke();
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
