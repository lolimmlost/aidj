import type { Visualizer, VisualizerContext } from '../types';

// Pre-calculated spiral points
const NUM_ARMS = 6;
const POINTS_PER_ARM = 32;
let spiralCos: Float32Array | null = null;
let spiralSin: Float32Array | null = null;

function initSpiral() {
  if (spiralCos) return;
  spiralCos = new Float32Array(POINTS_PER_ARM);
  spiralSin = new Float32Array(POINTS_PER_ARM);
  for (let i = 0; i < POINTS_PER_ARM; i++) {
    const t = i / POINTS_PER_ARM;
    const angle = t * Math.PI * 4; // 2 full rotations
    spiralCos[i] = Math.cos(angle);
    spiralSin[i] = Math.sin(angle);
  }
}

export const SpiralVisualizer: Visualizer = {
  name: 'Spiral Galaxy',
  id: 'spiral',

  init: () => {
    initSpiral();
  },

  cleanup: () => {},

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time } = ctx;
    const { bars, bass, mid, treble, isBeat } = audioData;

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    initSpiral();

    const maxRadius = Math.min(width, height) * 0.4;
    const rotation = time * 0.3;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    // Draw spiral arms
    for (let arm = 0; arm < NUM_ARMS; arm++) {
      const armOffset = (arm / NUM_ARMS) * Math.PI * 2;
      const cosA = Math.cos(armOffset);
      const sinA = Math.sin(armOffset);

      // Choose color based on arm
      const colorIndex = arm % 3;
      c.strokeStyle = colorIndex === 0 ? colors.primary : colorIndex === 1 ? colors.secondary : colors.accent;
      c.lineWidth = 2 + bass * 3;

      c.beginPath();

      let maxBarValue = 0;
      for (let i = 0; i < POINTS_PER_ARM; i++) {
        const t = i / POINTS_PER_ARM;
        const barIndex = bars.length > 0 ? Math.floor(t * Math.min(bars.length, 32)) : 0;
        const barValue = bars.length > 0 ? (bars[barIndex] || 0) : 0.5;
        maxBarValue = Math.max(maxBarValue, barValue);

        // Spiral radius increases with t, modulated by audio
        const radius = t * maxRadius * (0.3 + barValue * 0.7 + mid * 0.3);

        // Apply arm offset rotation
        const baseCos = spiralCos![i] * cosA - spiralSin![i] * sinA;
        const baseSin = spiralSin![i] * cosA + spiralCos![i] * sinA;

        // Apply time rotation
        const cos = baseCos * cosR - baseSin * sinR;
        const sin = baseSin * cosR + baseCos * sinR;

        const x = centerX + cos * radius;
        const y = centerY + sin * radius;

        if (i === 0) {
          c.moveTo(x, y);
        } else {
          c.lineTo(x, y);
        }
      }

      c.globalAlpha = 0.6 + maxBarValue * 0.4;
      c.stroke();
    }
    c.globalAlpha = 1;

    // Center glow
    const glowSize = 20 + bass * 30;
    c.beginPath();
    c.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.8;
    c.fill();

    c.beginPath();
    c.arc(centerX, centerY, glowSize * 0.5, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.9;
    c.fill();
    c.globalAlpha = 1;

    // Beat flash
    if (isBeat) {
      c.beginPath();
      c.arc(centerX, centerY, maxRadius * 0.8, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = 4;
      c.globalAlpha = 0.5;
      c.stroke();
      c.globalAlpha = 1;
    }
  },
};
