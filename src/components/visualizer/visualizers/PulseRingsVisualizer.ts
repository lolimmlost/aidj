import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

interface Ring {
  radius: number;
  alpha: number;
  color: 'primary' | 'secondary' | 'accent';
  thickness: number;
  speed: number;
}

const MAX_RINGS = 16;
let rings: Ring[] = [];
let lastBeatTime = 0;
let ringIndex = 0;
let shock = 0;
let smoothBass = 0;
let smoothVol = 0;

function sampleBar(bars: number[], u: number): number {
  if (!bars.length) return 0;
  const f = u * (bars.length - 1);
  const i = Math.floor(f);
  return (bars[i] ?? 0) * (1 - (f - i)) + (bars[Math.min(bars.length - 1, i + 1)] ?? 0) * (f - i);
}

export const PulseRingsVisualizer: Visualizer = {
  name: 'Pulse Rings',
  id: 'pulse-rings',

  init: () => {
    rings = [];
    lastBeatTime = 0;
    ringIndex = 0;
    shock = 0;
    smoothBass = 0;
    smoothVol = 0;
  },

  cleanup: () => {
    rings = [];
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;

    const dt = Math.min(deltaTime, 0.05);
    smoothBass += (bass - smoothBass) * Math.min(1, dt * 8);
    smoothVol += (volume - smoothVol) * Math.min(1, dt * 6);

    // Beat envelope
    if (isBeat) shock = Math.min(1, shock + 0.75);
    shock = Math.max(0, shock - dt * 2.0);

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.22 + (1 - smoothVol) * 0.2;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const maxRadius = Math.min(width, height) * 0.45;

    // Spawn ring on beat
    if (isBeat && time - lastBeatTime > 0.12) {
      const colorChoices: ('primary' | 'secondary' | 'accent')[] = ['primary', 'secondary', 'accent'];
      rings.push({
        radius: 15 + smoothBass * 10,
        alpha: 1,
        color: colorChoices[ringIndex % 3],
        thickness: 3 + bass * 10 + shock * 4,
        speed: 4 + volume * 10 + shock * 6,
      });
      ringIndex++;
      lastBeatTime = time;
      if (rings.length > MAX_RINGS) rings.shift();
    }

    c.globalCompositeOperation = 'lighter';

    // Update and draw expanding rings
    rings = rings.filter(ring => {
      ring.radius += ring.speed;
      ring.alpha -= dt * 1.2;
      ring.thickness *= 0.997;

      if (ring.alpha <= 0 || ring.radius > maxRadius * 1.5) return false;

      c.beginPath();
      c.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
      c.strokeStyle = colors[ring.color];
      c.lineWidth = ring.thickness * (ring.alpha * 0.5 + 0.5);
      c.globalAlpha = ring.alpha * 0.7;
      c.stroke();

      // Glow pass
      c.lineWidth = ring.thickness * 3;
      c.globalAlpha = ring.alpha * 0.15;
      c.stroke();

      return true;
    });

    // Frequency rings — per-segment spectrum sampling
    const numFreqRings = getAdaptiveCount(5, quality);
    const hasAudio = bars.length > 0;

    for (let i = 0; i < numFreqRings; i++) {
      const t = (i + 1) / (numFreqRings + 1);
      const baseRadius = t * maxRadius * 0.8;
      const segments = getAdaptiveCount(48, quality);
      const segmentAngle = (Math.PI * 2) / segments;
      const ringSpeed = (i % 2 === 0 ? 1 : -1) * (0.2 + smoothVol * 0.4 + shock * 0.6);

      // Glow pass
      c.beginPath();
      for (let s = 0; s <= segments; s++) {
        const u = s / segments;
        const segValue = hasAudio ? sampleBar(bars, u) : 0.3;
        const segRadius = baseRadius * (0.85 + segValue * 0.35 + shock * 0.1);
        const angle = s * segmentAngle + time * ringSpeed;
        const x = centerX + Math.cos(angle) * segRadius;
        const y = centerY + Math.sin(angle) * segRadius;
        if (s === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();

      if (i < 2) c.strokeStyle = colors.primary;
      else if (i < 4) c.strokeStyle = colors.secondary;
      else c.strokeStyle = colors.accent;

      const energy = hasAudio ? sampleBar(bars, t) : 0.3;
      c.lineWidth = 4 + energy * 4;
      c.globalAlpha = 0.08 + energy * 0.08;
      c.stroke();

      // Core stroke
      c.lineWidth = 1.5 + energy * 2.5 + shock * 1.5;
      c.globalAlpha = 0.3 + energy * 0.5 + shock * 0.15;
      c.stroke();
    }

    // Center element — reactive core
    const centerSize = 15 + smoothBass * 30 + shock * 15;

    // Outer glow
    c.beginPath();
    c.arc(centerX, centerY, centerSize * 2.5, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.1 + shock * 0.12;
    c.fill();

    // Mid glow
    c.beginPath();
    c.arc(centerX, centerY, centerSize * 1.5, 0, Math.PI * 2);
    c.globalAlpha = 0.2 + shock * 0.15;
    c.fill();

    // Core
    c.beginPath();
    c.arc(centerX, centerY, centerSize, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.8 + shock * 0.2;
    c.fill();

    // Inner highlight
    c.beginPath();
    c.arc(centerX, centerY, centerSize * 0.4, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.85;
    c.fill();

    // Band indicators — bottom left, reactive
    const indicatorSize = 50;
    const cornerPadding = 25;
    const bandValues = [smoothBass, mid, treble];
    const bandColors = [colors.primary, colors.secondary, colors.accent];

    for (let b = 0; b < 3; b++) {
      c.fillStyle = bandColors[b];
      c.globalAlpha = 0.6 + bandValues[b] * 0.4;
      c.fillRect(
        cornerPadding + b * 12,
        height - cornerPadding - indicatorSize * bandValues[b],
        6,
        indicatorSize * bandValues[b],
      );
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
