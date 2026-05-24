import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

/**
 * HelixVisualizer — a rotating double helix. Two strands trace
 * out-of-phase 3D curves; "rungs" connect them and light up where the
 * audio spectrum has energy. Bass swells the helix radius, treble
 * sparks the rungs.
 */
export const HelixVisualizer: Visualizer = {
  name: 'Double Helix',
  id: 'helix',

  init: () => {},
  cleanup: () => {},

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time, quality } = ctx;
    const { bars, bass, mid, treble, isBeat } = audioData;

    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    const length = Math.min(width * 0.85, height * 1.5);
    const segments = getAdaptiveCount(140, quality);
    const baseRadius = Math.min(width, height) * 0.18 * (1 + bass * 0.35);
    const turns = 3.2;

    // Helix is drawn along the y-axis (vertical orientation works well in
    // both portrait and landscape because we project z to a horizontal
    // offset). Two strands π out of phase.
    const startY = centerY - length / 2;
    const endY = centerY + length / 2;
    const rotation = time * 0.6 + mid * 1.2;

    // Pre-compute strand points so we can both stroke the curves and draw rungs.
    const strandA: { x: number; y: number; z: number }[] = [];
    const strandB: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = startY + (endY - startY) * t;
      const angle = t * Math.PI * 2 * turns + rotation;

      // Strand A
      const aAngle = angle;
      const aZ = Math.sin(aAngle); // -1 (back) .. 1 (front)
      const aX = centerX + Math.cos(aAngle) * baseRadius;
      strandA.push({ x: aX, y, z: aZ });

      // Strand B (π out of phase)
      const bAngle = angle + Math.PI;
      const bZ = Math.sin(bAngle);
      const bX = centerX + Math.cos(bAngle) * baseRadius;
      strandB.push({ x: bX, y, z: bZ });
    }

    // Helper: depth-based alpha (front=bright, back=dim)
    const depthAlpha = (z: number) => 0.35 + (z + 1) * 0.5 * 0.5; // 0.35..0.85

    // Draw rungs first (behind strands) — but only the "back" half, so
    // strands appear to weave in front. We'll draw the front-half rungs
    // after the strands for proper occlusion.
    const rungEvery = quality === 'low' ? 6 : quality === 'medium' ? 4 : 3;

    c.lineCap = 'round';

    // Back-facing rungs
    for (let i = 0; i < strandA.length; i += rungEvery) {
      const a = strandA[i];
      const b = strandB[i];
      const avgZ = (a.z + b.z) / 2;
      if (avgZ >= 0) continue; // skip front-facing for now

      // Light up rung based on a frequency bin
      const binIdx = Math.floor((i / strandA.length) * bars.length);
      const energy = bars[binIdx] || 0;

      c.strokeStyle = colors.secondary;
      c.globalAlpha = Math.max(0.08, energy * 0.6) * depthAlpha(avgZ);
      c.lineWidth = 1 + energy * 2;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }

    // Strands — segment-by-segment so we can vary alpha with depth.
    // Strand A
    for (let i = 1; i < strandA.length; i++) {
      const p0 = strandA[i - 1];
      const p1 = strandA[i];
      const z = (p0.z + p1.z) / 2;
      c.strokeStyle = colors.primary;
      c.globalAlpha = depthAlpha(z);
      c.lineWidth = 2 + (z + 1) * 1.5;
      c.beginPath();
      c.moveTo(p0.x, p0.y);
      c.lineTo(p1.x, p1.y);
      c.stroke();
    }

    // Strand B
    for (let i = 1; i < strandB.length; i++) {
      const p0 = strandB[i - 1];
      const p1 = strandB[i];
      const z = (p0.z + p1.z) / 2;
      c.strokeStyle = colors.accent;
      c.globalAlpha = depthAlpha(z);
      c.lineWidth = 2 + (z + 1) * 1.5;
      c.beginPath();
      c.moveTo(p0.x, p0.y);
      c.lineTo(p1.x, p1.y);
      c.stroke();
    }

    // Front-facing rungs (drawn on top of strands)
    for (let i = 0; i < strandA.length; i += rungEvery) {
      const a = strandA[i];
      const b = strandB[i];
      const avgZ = (a.z + b.z) / 2;
      if (avgZ < 0) continue;

      const binIdx = Math.floor((i / strandA.length) * bars.length);
      const energy = bars[binIdx] || 0;
      const sparkle = energy + treble * 0.4;

      c.strokeStyle = sparkle > 0.6 ? colors.accent : colors.primary;
      c.globalAlpha = Math.min(1, Math.max(0.15, sparkle * 0.9)) * depthAlpha(avgZ);
      c.lineWidth = 1.2 + sparkle * 3;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }

    c.globalAlpha = 1;

    // Beat flash — horizontal sweep
    if (isBeat) {
      c.strokeStyle = colors.accent;
      c.lineWidth = 1.5;
      c.globalAlpha = 0.35;
      c.beginPath();
      c.moveTo(0, centerY);
      c.lineTo(width, centerY);
      c.stroke();
      c.globalAlpha = 1;
    }
  },
};
