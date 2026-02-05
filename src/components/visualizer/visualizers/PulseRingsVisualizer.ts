import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

interface Ring {
  radius: number;
  alpha: number;
  color: 'primary' | 'secondary' | 'accent';
  thickness: number;
}

const MAX_RINGS = 12;
let rings: Ring[] = [];
let lastBeatTime = 0;
let ringIndex = 0;

export const PulseRingsVisualizer: Visualizer = {
  name: 'Pulse Rings',
  id: 'pulse-rings',

  init: () => {
    rings = [];
    lastBeatTime = 0;
    ringIndex = 0;
  },

  cleanup: () => {
    rings = [];
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    const maxRadius = Math.min(width, height) * 0.45;

    // Spawn new ring on beat
    if (isBeat && time - lastBeatTime > 0.15) {
      const colorChoices: ('primary' | 'secondary' | 'accent')[] = ['primary', 'secondary', 'accent'];
      rings.push({
        radius: 20,
        alpha: 1,
        color: colorChoices[ringIndex % 3],
        thickness: 3 + bass * 8,
      });
      ringIndex++;
      lastBeatTime = time;

      // Limit ring count
      if (rings.length > MAX_RINGS) {
        rings.shift();
      }
    }

    // Update and draw rings
    rings = rings.filter(ring => {
      ring.radius += 4 + volume * 8;
      ring.alpha -= 0.015;

      if (ring.alpha <= 0 || ring.radius > maxRadius * 1.5) {
        return false;
      }

      c.beginPath();
      c.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
      c.strokeStyle = colors[ring.color];
      c.lineWidth = ring.thickness * (ring.alpha * 0.5 + 0.5);
      c.globalAlpha = ring.alpha;
      c.stroke();

      return true;
    });

    c.globalAlpha = 1;

    // Draw frequency rings (static, pulsing with audio)
    const numFreqRings = getAdaptiveCount(5, quality);
    const hasAudio = bars.length > 0;
    for (let i = 0; i < numFreqRings; i++) {
      const t = (i + 1) / (numFreqRings + 1);
      const barIdx = hasAudio ? Math.floor(t * Math.min(bars.length, 32)) : 0;
      const barValue = hasAudio ? (bars[barIdx] || 0) : 0.3;

      const baseRadius = t * maxRadius * 0.8;
      const pulseRadius = baseRadius * (1 + barValue * 0.3);

      // Draw ring segments based on frequency
      const segments = getAdaptiveCount(32, quality);
      const segmentAngle = (Math.PI * 2) / segments;

      c.beginPath();
      for (let s = 0; s < segments; s++) {
        const segBarIdx = hasAudio ? Math.floor((s / segments) * Math.min(bars.length, 32)) : 0;
        const segValue = hasAudio ? (bars[segBarIdx] || 0) : 0.3;
        const segRadius = pulseRadius * (0.9 + segValue * 0.2);

        const angle = s * segmentAngle + time * 0.2 * (i % 2 === 0 ? 1 : -1);
        const x = centerX + Math.cos(angle) * segRadius;
        const y = centerY + Math.sin(angle) * segRadius;

        if (s === 0) {
          c.moveTo(x, y);
        } else {
          c.lineTo(x, y);
        }
      }
      c.closePath();

      // Color and alpha based on ring index
      if (i < 2) {
        c.strokeStyle = colors.primary;
      } else if (i < 4) {
        c.strokeStyle = colors.secondary;
      } else {
        c.strokeStyle = colors.accent;
      }

      c.lineWidth = 1.5 + barValue * 2;
      c.globalAlpha = 0.3 + barValue * 0.4;
      c.stroke();
    }

    c.globalAlpha = 1;

    // Center element
    const centerSize = 15 + bass * 25;

    // Outer glow
    c.beginPath();
    c.arc(centerX, centerY, centerSize * 2, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.2;
    c.fill();

    // Core
    c.beginPath();
    c.arc(centerX, centerY, centerSize, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.8;
    c.fill();

    // Inner highlight
    c.beginPath();
    c.arc(centerX, centerY, centerSize * 0.5, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.9;
    c.fill();

    c.globalAlpha = 1;

    // Corner frequency indicators
    const indicatorSize = 40;
    const cornerPadding = 30;

    // Bass (bottom left)
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.7;
    c.fillRect(cornerPadding, height - cornerPadding - indicatorSize * bass, 6, indicatorSize * bass);

    // Mid (bottom left + offset)
    c.fillStyle = colors.secondary;
    c.fillRect(cornerPadding + 12, height - cornerPadding - indicatorSize * mid, 6, indicatorSize * mid);

    // Treble (bottom left + offset)
    c.fillStyle = colors.accent;
    c.fillRect(cornerPadding + 24, height - cornerPadding - indicatorSize * treble, 6, indicatorSize * treble);

    c.globalAlpha = 1;
  },
};
