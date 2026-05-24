import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

interface Ring {
  z: number;
  spin: number;
}

const BASE_RING_COUNT = 40;
const NEAR_Z = 8;
const FAR_Z = 800;
let rings: Ring[] = [];
let initializedCount = 0;
let cameraSpin = 0;

function makeRing(z: number): Ring {
  return { z, spin: Math.random() * Math.PI * 2 };
}

function initRings(count: number) {
  rings = [];
  for (let i = 0; i < count; i++) {
    rings.push(makeRing(NEAR_Z + (i / count) * (FAR_Z - NEAR_Z)));
  }
  initializedCount = count;
}

/**
 * TunnelVisualizer — perspective hyperspace tunnel. Concentric polygons
 * race toward the camera, rotating around a central vanishing point.
 * Bass accelerates the camera, treble brightens the leading edge.
 */
export const TunnelVisualizer: Visualizer = {
  name: 'Hyperspace Tunnel',
  id: 'tunnel',

  init: () => {
    rings = [];
    initializedCount = 0;
    cameraSpin = 0;
  },

  cleanup: () => {
    rings = [];
    initializedCount = 0;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, deltaTime, time, quality } = ctx;
    const { bass, mid, treble, volume, isBeat } = audioData;

    const ringCount = getAdaptiveCount(BASE_RING_COUNT, quality);
    if (initializedCount !== ringCount) initRings(ringCount);

    // Trailing fade — partially clear instead of full clear gives ghosting.
    c.fillStyle = colors.background;
    c.globalAlpha = 0.35;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const baseSpeed = 60 + volume * 180 + bass * 220;
    const speed = isBeat ? baseSpeed * 1.6 : baseSpeed;
    const dt = Math.min(deltaTime, 0.05);
    cameraSpin += dt * (0.3 + mid * 0.8);

    const focalLength = Math.min(width, height) * 0.55;
    const tunnelRadius = Math.min(width, height) * 0.65;
    const sides = quality === 'low' ? 6 : quality === 'medium' ? 8 : 10;

    // Sort rings far-to-near using a depth-keyed array (avoids alloc churn).
    const sortedRings = rings.slice().sort((a, b) => b.z - a.z);

    for (let i = 0; i < sortedRings.length; i++) {
      const ring = sortedRings[i];
      // Advance + recycle. We mutate the original ring objects since they're
      // shared between rings[] and sortedRings[].
      ring.z -= speed * dt;
      if (ring.z < NEAR_Z) {
        ring.z = FAR_Z;
        ring.spin = Math.random() * Math.PI * 2;
      }

      const scale = focalLength / ring.z;
      const radius = tunnelRadius * scale * (1 + bass * 0.15);
      if (radius < 1) continue;

      const depth = 1 - (ring.z - NEAR_Z) / (FAR_Z - NEAR_Z); // 0=far, 1=near
      const alpha = Math.min(1, depth * 1.3);

      // Color: far rings = secondary, near = primary, leading edge = accent
      let stroke = colors.secondary;
      if (depth > 0.85) stroke = colors.accent;
      else if (depth > 0.55) stroke = colors.primary;

      c.strokeStyle = stroke;
      c.globalAlpha = alpha;
      c.lineWidth = 1 + depth * (2 + treble * 3);

      // Draw rotated polygon ring
      const rotation = cameraSpin + ring.spin;
      c.beginPath();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2 + rotation;
        const x = centerX + Math.cos(a) * radius;
        const y = centerY + Math.sin(a) * radius;
        if (s === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }

    c.globalAlpha = 1;

    // Vanishing point pulse
    const coreSize = 4 + bass * 18 + (isBeat ? 12 : 0);
    c.beginPath();
    c.arc(centerX, centerY, coreSize, 0, Math.PI * 2);
    c.fillStyle = colors.accent;
    c.globalAlpha = 0.7;
    c.fill();
    c.globalAlpha = 1;

    // Optional radial streaks on strong beats
    if (isBeat && quality !== 'low') {
      c.strokeStyle = colors.primary;
      c.globalAlpha = 0.35;
      c.lineWidth = 1;
      c.beginPath();
      const streakCount = sides;
      for (let s = 0; s < streakCount; s++) {
        const a = (s / streakCount) * Math.PI * 2 + cameraSpin;
        c.moveTo(centerX + Math.cos(a) * coreSize, centerY + Math.sin(a) * coreSize);
        c.lineTo(centerX + Math.cos(a) * tunnelRadius, centerY + Math.sin(a) * tunnelRadius);
      }
      c.stroke();
      c.globalAlpha = 1;
    }

    void time; // referenced for parity; cameraSpin tracks animation time
  },
};
