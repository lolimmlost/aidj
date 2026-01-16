import type { Visualizer, VisualizerContext } from '../types';

// Store history for trails - reduced for performance
let trailHistory: Float32Array[] = [];
const MAX_TRAIL_LENGTH = 3;
const NUM_BARS = 48;

// Pre-allocated history buffers (recycled)
let historyPool: Float32Array[] = [];
let poolInitialized = false;

// Pre-calculated trig values (computed once)
let cosTable: Float32Array | null = null;
let sinTable: Float32Array | null = null;

function initTrigTables() {
  if (cosTable) return;
  cosTable = new Float32Array(NUM_BARS);
  sinTable = new Float32Array(NUM_BARS);
  for (let i = 0; i < NUM_BARS; i++) {
    const angle = (i / NUM_BARS) * Math.PI * 2;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
  }
}

function initHistoryPool() {
  if (poolInitialized) return;
  historyPool = [];
  for (let i = 0; i < MAX_TRAIL_LENGTH + 1; i++) {
    historyPool.push(new Float32Array(NUM_BARS));
  }
  poolInitialized = true;
}

// Reusable array for sampled bars
let sampledBars = new Float32Array(NUM_BARS);

export const CircularVisualizer: Visualizer = {
  name: 'Circular Bars',
  id: 'circular',

  init: () => {
    trailHistory = [];
    poolInitialized = false;
    initTrigTables();
    initHistoryPool();
  },

  cleanup: () => {
    trailHistory = [];
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time } = ctx;
    const { bars, bass, mid, treble, isBeat } = audioData;

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    if (bars.length === 0) return;
    initTrigTables();

    const baseRadius = Math.min(width, height) * 0.12;
    const maxBarLength = Math.min(width, height) * 0.32;

    // Rotate slowly over time
    const rotation = time * 0.15;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    initHistoryPool();

    // Sample bars into reusable typed array
    const barScale = bars.length / NUM_BARS;
    for (let i = 0; i < NUM_BARS; i++) {
      sampledBars[i] = bars[Math.floor(i * barScale)] || 0;
    }

    // Recycle oldest buffer or get from pool
    let histCopy: Float32Array;
    if (trailHistory.length >= MAX_TRAIL_LENGTH) {
      histCopy = trailHistory.pop()!;
    } else {
      histCopy = historyPool[trailHistory.length] || new Float32Array(NUM_BARS);
    }
    histCopy.set(sampledBars);
    trailHistory.unshift(histCopy);

    // Draw beat flash ring (no shadow for performance)
    if (isBeat) {
      c.beginPath();
      c.arc(centerX, centerY, baseRadius + maxBarLength * 1.1, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = 4;
      c.globalAlpha = 0.6;
      c.stroke();
      c.globalAlpha = 1;
    }

    // Draw trail history - batch all trails together
    c.lineCap = 'butt';

    for (let histIndex = MAX_TRAIL_LENGTH - 1; histIndex > 0; histIndex--) {
      const histBars = trailHistory[histIndex];
      if (!histBars) continue;

      const histOffset = histIndex * 0.02;
      const cosH = Math.cos(-histOffset);
      const sinH = Math.sin(-histOffset);

      c.globalAlpha = 0.12 * (1 - histIndex / MAX_TRAIL_LENGTH);
      c.strokeStyle = colors.secondary;
      c.lineWidth = 2;
      c.beginPath();

      for (let i = 0; i < NUM_BARS; i += 2) {
        // Rotate pre-calculated trig values
        const baseCos = cosTable![i] * cosR - sinTable![i] * sinR;
        const baseSin = sinTable![i] * cosR + cosTable![i] * sinR;
        const cos = baseCos * cosH - baseSin * sinH;
        const sin = baseSin * cosH + baseCos * sinH;

        const barLength = histBars[i] * maxBarLength * 0.9;

        c.moveTo(centerX + cos * baseRadius, centerY + sin * baseRadius);
        c.lineTo(centerX + cos * (baseRadius + barLength), centerY + sin * (baseRadius + barLength));
      }
      c.stroke();
    }
    c.globalAlpha = 1;

    // Draw main circular bars - batch by color zone
    const zone1End = Math.floor(NUM_BARS * 0.33);
    const zone2End = Math.floor(NUM_BARS * 0.66);

    // Zone 1: Primary
    c.strokeStyle = colors.primary;
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < zone1End; i++) {
      const cos = cosTable![i] * cosR - sinTable![i] * sinR;
      const sin = sinTable![i] * cosR + cosTable![i] * sinR;
      const barLength = sampledBars[i] * maxBarLength;
      c.moveTo(centerX + cos * baseRadius, centerY + sin * baseRadius);
      c.lineTo(centerX + cos * (baseRadius + barLength), centerY + sin * (baseRadius + barLength));
    }
    c.stroke();

    // Zone 2: Secondary
    c.strokeStyle = colors.secondary;
    c.beginPath();
    for (let i = zone1End; i < zone2End; i++) {
      const cos = cosTable![i] * cosR - sinTable![i] * sinR;
      const sin = sinTable![i] * cosR + cosTable![i] * sinR;
      const barLength = sampledBars[i] * maxBarLength;
      c.moveTo(centerX + cos * baseRadius, centerY + sin * baseRadius);
      c.lineTo(centerX + cos * (baseRadius + barLength), centerY + sin * (baseRadius + barLength));
    }
    c.stroke();

    // Zone 3: Accent
    c.strokeStyle = colors.accent;
    c.beginPath();
    for (let i = zone2End; i < NUM_BARS; i++) {
      const cos = cosTable![i] * cosR - sinTable![i] * sinR;
      const sin = sinTable![i] * cosR + cosTable![i] * sinR;
      const barLength = sampledBars[i] * maxBarLength;
      c.moveTo(centerX + cos * baseRadius, centerY + sin * baseRadius);
      c.lineTo(centerX + cos * (baseRadius + barLength), centerY + sin * (baseRadius + barLength));
    }
    c.stroke();

    // Draw inner circles with pulse effect
    const pulseRadius = baseRadius * (0.95 + bass * 0.15);

    c.beginPath();
    c.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    c.fillStyle = colors.background;
    c.fill();
    c.strokeStyle = colors.primary;
    c.lineWidth = 3;
    c.stroke();

    c.beginPath();
    c.arc(centerX, centerY, pulseRadius * 0.7, 0, Math.PI * 2);
    c.strokeStyle = colors.secondary;
    c.lineWidth = 2;
    c.globalAlpha = 0.6 + mid * 0.4;
    c.stroke();

    c.beginPath();
    c.arc(centerX, centerY, pulseRadius * 0.4, 0, Math.PI * 2);
    c.strokeStyle = colors.accent;
    c.globalAlpha = 0.4 + treble * 0.6;
    c.stroke();
    c.globalAlpha = 1;

    // Center dot
    c.beginPath();
    c.arc(centerX, centerY, 4 + bass * 4, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.fill();
  },
};
