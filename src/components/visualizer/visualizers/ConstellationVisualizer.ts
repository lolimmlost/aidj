import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bin: number; // index into frequency bars
  baseSize: number;
}

const BASE_NODE_COUNT = 70;
let nodes: Node[] = [];
let initializedCount = 0;
let lastWidth = 0;
let lastHeight = 0;

function spawnNodes(width: number, height: number, count: number, bins: number) {
  nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      bin: Math.floor(Math.random() * Math.max(1, bins)),
      baseSize: 1.5 + Math.random() * 2,
    });
  }
  initializedCount = count;
  lastWidth = width;
  lastHeight = height;
}

/**
 * ConstellationVisualizer — drifting points connect into a dynamic
 * graph whose edges glow with the music. Each node is mapped to a
 * frequency bin; the node brightens with that bin's energy and edges
 * are drawn between any two nodes within the link distance.
 */
export const ConstellationVisualizer: Visualizer = {
  name: 'Constellation',
  id: 'constellation',

  init: () => {
    nodes = [];
    initializedCount = 0;
    lastWidth = 0;
    lastHeight = 0;
  },

  cleanup: () => {
    nodes = [];
    initializedCount = 0;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, audioData, colors, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;
    const bins = Math.max(1, bars.length);
    const count = getAdaptiveCount(BASE_NODE_COUNT, quality);

    if (initializedCount !== count || lastWidth !== width || lastHeight !== height) {
      spawnNodes(width, height, count, bins);
    }

    // Trail fade — partial clear gives motion trails on links.
    c.fillStyle = colors.background;
    c.globalAlpha = 0.55;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    const dt = Math.min(deltaTime, 0.05) * 60; // normalize to ~60fps units
    const drift = 1 + volume * 1.4;
    const jitter = isBeat ? 1.6 : 0;
    const linkDist = Math.min(width, height) * (0.22 + bass * 0.12);
    const linkDistSq = linkDist * linkDist;

    // Update node positions
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx * dt * drift + (Math.random() - 0.5) * jitter;
      n.y += n.vy * dt * drift + (Math.random() - 0.5) * jitter;

      // Wrap around edges
      if (n.x < -20) n.x = width + 20;
      else if (n.x > width + 20) n.x = -20;
      if (n.y < -20) n.y = height + 20;
      else if (n.y > height + 20) n.y = -20;
    }

    // Draw links — bucket by alpha to avoid per-segment fillStyle changes.
    // Use up to ~3 strokes total (low/mid/high bands).
    const lowLinks: { ax: number; ay: number; bx: number; by: number; a: number }[] = [];
    const midLinks: typeof lowLinks = [];
    const highLinks: typeof lowLinks = [];

    // O(n^2) is fine for ~30-70 nodes; skip pairs when too far.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > linkDistSq) continue;

        const eA = bars[a.bin] || 0;
        const eB = bars[b.bin] || 0;
        const avgE = (eA + eB) / 2;
        if (avgE < 0.05) continue;

        const fade = 1 - Math.sqrt(d2) / linkDist;
        const intensity = avgE * fade;

        const link = { ax: a.x, ay: a.y, bx: b.x, by: b.y, a: intensity };
        // Bucket by where the average bin sits in the spectrum
        const avgBin = (a.bin + b.bin) / 2;
        if (avgBin < bins * 0.33) lowLinks.push(link);
        else if (avgBin < bins * 0.66) midLinks.push(link);
        else highLinks.push(link);
      }
    }

    const drawLinks = (list: typeof lowLinks, color: string) => {
      if (list.length === 0) return;
      c.strokeStyle = color;
      c.lineWidth = 1;
      // Average alpha across the bucket — close enough for the look,
      // single stroke pass instead of per-link.
      let total = 0;
      for (let i = 0; i < list.length; i++) total += list[i].a;
      c.globalAlpha = Math.min(0.9, total / list.length * 1.2);
      c.beginPath();
      for (let i = 0; i < list.length; i++) {
        const l = list[i];
        c.moveTo(l.ax, l.ay);
        c.lineTo(l.bx, l.by);
      }
      c.stroke();
    };

    drawLinks(lowLinks, colors.primary);
    drawLinks(midLinks, colors.secondary);
    drawLinks(highLinks, colors.accent);
    c.globalAlpha = 1;

    // Draw nodes — bucket by tier so we can fill all per color in one path.
    const lowNodes: Node[] = [];
    const midNodes: Node[] = [];
    const highNodes: Node[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.bin < bins * 0.33) lowNodes.push(n);
      else if (n.bin < bins * 0.66) midNodes.push(n);
      else highNodes.push(n);
    }

    const drawNodes = (list: Node[], color: string, baseAlpha: number) => {
      c.fillStyle = color;
      c.beginPath();
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        const energy = bars[n.bin] || 0;
        const r = n.baseSize + energy * 4;
        c.moveTo(n.x + r, n.y);
        c.arc(n.x, n.y, r, 0, Math.PI * 2);
      }
      c.globalAlpha = baseAlpha;
      c.fill();
    };

    drawNodes(lowNodes, colors.primary, 0.8 + bass * 0.2);
    drawNodes(midNodes, colors.secondary, 0.8 + mid * 0.2);
    drawNodes(highNodes, colors.accent, 0.8 + treble * 0.2);
    c.globalAlpha = 1;
  },
};
