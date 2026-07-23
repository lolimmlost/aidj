import type { Visualizer, VisualizerContext } from '../types';

let trailHistory: Float32Array[] = [];
const MAX_TRAIL_LENGTH = 3;
const NUM_BARS = 48;

let historyPool: Float32Array[] = [];
let poolInitialized = false;
let cosTable: Float32Array | null = null;
let sinTable: Float32Array | null = null;
let shock = 0;
let smoothBass = 0;
let rotAccum = 0;

const sampledBars = new Float32Array(NUM_BARS);

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

export const CircularVisualizer: Visualizer = {
  name: 'Circular Bars',
  id: 'circular',

  init: () => {
    trailHistory = [];
    poolInitialized = false;
    initTrigTables();
    initHistoryPool();
    shock = 0;
    smoothBass = 0;
    rotAccum = 0;
  },

  cleanup: () => {
    trailHistory = [];
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;
    const barStep = quality === 'low' ? 3 : quality === 'medium' ? 2 : 1;
    const dt = Math.min(deltaTime, 0.05);

    // Beat envelope
    if (isBeat) shock = Math.min(1, shock + 0.7);
    shock = Math.max(0, shock - dt * 2.0);
    smoothBass += (bass - smoothBass) * Math.min(1, dt * 8);

    // Audio-driven rotation
    rotAccum += dt * (0.15 + volume * 0.3 + shock * 0.8);
    const rotation = rotAccum;

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.25 + (1 - volume) * 0.2;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    if (bars.length === 0) return;
    initTrigTables();
    initHistoryPool();

    const baseRadius = Math.min(width, height) * 0.12 * (1 + shock * 0.08);
    const maxBarLength = Math.min(width, height) * 0.32 * (1 + shock * 0.1);

    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    const barScale = bars.length / NUM_BARS;
    for (let i = 0; i < NUM_BARS; i++) {
      sampledBars[i] = bars[Math.floor(i * barScale)] || 0;
    }

    let histCopy: Float32Array;
    if (trailHistory.length >= MAX_TRAIL_LENGTH) {
      histCopy = trailHistory.pop()!;
    } else {
      histCopy = historyPool[trailHistory.length] || new Float32Array(NUM_BARS);
    }
    histCopy.set(sampledBars);
    trailHistory.unshift(histCopy);

    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';

    // Trail history — additive glow
    for (let histIndex = MAX_TRAIL_LENGTH - 1; histIndex > 0; histIndex--) {
      const histBars = trailHistory[histIndex];
      if (!histBars) continue;

      const histOffset = histIndex * 0.02;
      const cosH = Math.cos(-histOffset);
      const sinH = Math.sin(-histOffset);

      c.globalAlpha = 0.1 * (1 - histIndex / MAX_TRAIL_LENGTH);
      c.strokeStyle = colors.secondary;
      c.lineWidth = 2;
      c.beginPath();

      for (let i = 0; i < NUM_BARS; i += Math.max(2, barStep)) {
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

    // Main bars — glow pass then core pass
    const zone1End = Math.floor(NUM_BARS * 0.33);
    const zone2End = Math.floor(NUM_BARS * 0.66);
    const zoneColors = [colors.primary, colors.secondary, colors.accent];
    const zoneRanges = [[0, zone1End], [zone1End, zone2End], [zone2End, NUM_BARS]];

    for (let z = 0; z < 3; z++) {
      const [start, end] = zoneRanges[z];

      // Glow
      c.strokeStyle = zoneColors[z];
      c.lineWidth = 5 + shock * 3;
      c.globalAlpha = 0.1 + shock * 0.08;
      c.beginPath();
      for (let i = start; i < end; i += barStep) {
        const cos = cosTable![i] * cosR - sinTable![i] * sinR;
        const sin = sinTable![i] * cosR + cosTable![i] * sinR;
        const barLength = sampledBars[i] * maxBarLength;
        c.moveTo(centerX + cos * baseRadius, centerY + sin * baseRadius);
        c.lineTo(centerX + cos * (baseRadius + barLength), centerY + sin * (baseRadius + barLength));
      }
      c.stroke();

      // Core
      c.lineWidth = 3;
      c.globalAlpha = 0.7 + shock * 0.2;
      c.stroke();
    }

    // Beat shock ring — expanding
    if (shock > 0.05) {
      const ringR = baseRadius + maxBarLength * (1.1 + (1 - shock) * 0.3);
      c.beginPath();
      c.arc(centerX, centerY, ringR, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = 2 + shock * 5;
      c.globalAlpha = shock * 0.5;
      c.stroke();
    }

    // Inner circles — reactive
    c.globalCompositeOperation = 'source-over';
    const pulseRadius = baseRadius * (0.95 + smoothBass * 0.2 + shock * 0.1);

    c.beginPath();
    c.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    c.fillStyle = colors.background;
    c.globalAlpha = 1;
    c.fill();

    c.globalCompositeOperation = 'lighter';

    c.strokeStyle = colors.primary;
    c.lineWidth = 3 + smoothBass * 2;
    c.globalAlpha = 0.7 + shock * 0.3;
    c.stroke();

    c.beginPath();
    c.arc(centerX, centerY, pulseRadius * 0.7, 0, Math.PI * 2);
    c.strokeStyle = colors.secondary;
    c.lineWidth = 2 + mid * 2;
    c.globalAlpha = 0.5 + mid * 0.5;
    c.stroke();

    c.beginPath();
    c.arc(centerX, centerY, pulseRadius * 0.4, 0, Math.PI * 2);
    c.strokeStyle = colors.accent;
    c.lineWidth = 1.5 + treble * 2;
    c.globalAlpha = 0.4 + treble * 0.6;
    c.stroke();

    // Center dot — pulses with bass
    c.beginPath();
    c.arc(centerX, centerY, 4 + smoothBass * 6 + shock * 4, 0, Math.PI * 2);
    c.fillStyle = colors.primary;
    c.globalAlpha = 0.8 + shock * 0.2;
    c.fill();

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
