// Broadcast — an amp.fm-inspired on-air visualizer.
// Central polar oscilloscope, radial spectrum spokes, sweeping radar arm,
// VU-meter tick ring, expanding beat pulses, and a callsign dot grid.

import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

interface Pulse {
  radius: number;
  alpha: number;
  width: number;
  hue: number; // 0 primary, 1 secondary, 2 accent
}

interface Blip {
  angle: number;
  radius: number;
  life: number;
  size: number;
}

let pulses: Pulse[] = [];
let blips: Blip[] = [];
let sweepAngle = 0;
let smoothBass = 0;
let smoothVol = 0;
let needle = 0;        // smoothed VU needle 0..1
let needleVel = 0;
let flash = 0;         // on-air beat flash
let scan = 0;          // scanline phase

const MAX_PULSES = 12;
const MAX_BLIPS = 60;

function pickColor(i: number, colors: { primary: string; secondary: string; accent: string }) {
  return i === 0 ? colors.primary : i === 1 ? colors.secondary : colors.accent;
}

function sampleBars(bars: number[], u: number): number {
  if (!bars.length) return 0;
  const x = u * (bars.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = bars[i] ?? 0;
  const b = bars[Math.min(bars.length - 1, i + 1)] ?? a;
  return a + (b - a) * f;
}

export const BroadcastVisualizer: Visualizer = {
  id: 'broadcast',
  name: 'Broadcast',

  init() {
    pulses = [];
    blips = [];
    sweepAngle = 0;
    smoothBass = 0;
    smoothVol = 0;
    needle = 0;
    needleVel = 0;
    flash = 0;
    scan = 0;
  },

  cleanup() {
    pulses = [];
    blips = [];
  },

  render({ ctx: c, width: w, height: h, deltaTime, time, audioData, colors, quality }: VisualizerContext) {
    const dt = Math.min(0.05, Math.max(0.001, deltaTime));
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(w, h) * 0.28;

    // === Background: deep panel + subtle radial vignette ===
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = colors.background;
    c.fillRect(0, 0, w, h);

    const vg = c.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.04)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);

    // === Envelopes ===
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    smoothBass = lerp(smoothBass, audioData.bass, Math.min(1, dt * 9));
    smoothVol = lerp(smoothVol, audioData.volume, Math.min(1, dt * 5));

    // VU needle physics — spring toward (bass*0.6 + treble*0.4)
    const target = Math.min(1, audioData.bass * 0.55 + audioData.treble * 0.35 + audioData.volume * 0.25);
    const spring = (target - needle) * 28;
    needleVel += spring * dt;
    needleVel *= Math.pow(0.0008, dt); // damping
    needle += needleVel * dt;
    needle = Math.max(0, Math.min(1.15, needle));

    flash = Math.max(0, flash - dt * 2.5);
    scan = (scan + dt * (0.35 + audioData.treble * 1.6)) % 1;

    if (audioData.isBeat) {
      flash = Math.min(1, flash + 0.7);
      if (pulses.length < MAX_PULSES) {
        const hue = Math.floor(Math.random() * 3);
        pulses.push({
          radius: baseR * 0.7,
          alpha: 0.85,
          width: 2 + smoothBass * 5,
          hue,
        });
      }
    }

    // === Dot-matrix callsign grid (background texture) ===
    if (quality !== 'low') {
      const cols = quality === 'high' ? 48 : 32;
      const rows = quality === 'high' ? 28 : 20;
      const spacingX = w / cols;
      const spacingY = h / rows;
      c.fillStyle = colors.primary;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = (i + 0.5) * spacingX;
          const y = (j + 0.5) * spacingY;
          const dxn = (x - cx) / w;
          const dyn = (y - cy) / h;
          const d = Math.sqrt(dxn * dxn + dyn * dyn);
          const wave = 0.5 + 0.5 * Math.sin(d * 22 - time * 1.8 + smoothBass * 4);
          const a = wave * 0.06 + (d < 0.18 ? 0.08 : 0);
          if (a < 0.02) continue;
          c.globalAlpha = a;
          c.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
        }
      }
      c.globalAlpha = 1;
    }

    // === Outer scanlines (broadcast feel) ===
    c.strokeStyle = colors.primary;
    c.globalAlpha = 0.05;
    c.lineWidth = 1;
    for (let y = (scan * 14) % 14; y < h; y += 14) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.globalAlpha = 1;

    // === Radial spectrum spokes ===
    const spokeCount = getAdaptiveCount(96, quality);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < spokeCount; i++) {
      const u = i / spokeCount;
      const ang = u * Math.PI * 2 - Math.PI / 2;
      const v = sampleBars(audioData.bars, u);
      const len = baseR * (0.18 + v * 0.95 + smoothBass * 0.12);
      const r0 = baseR * 1.02;
      const r1 = r0 + len;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const band = u < 0.33 ? 0 : u < 0.7 ? 1 : 2;
      const col = pickColor(band, colors);
      c.strokeStyle = col;
      c.globalAlpha = 0.18 + v * 0.55;
      c.lineWidth = 1 + v * 3.5;
      c.beginPath();
      c.moveTo(cx + cos * r0, cy + sin * r0);
      c.lineTo(cx + cos * r1, cy + sin * r1);
      c.stroke();

      // Highlight cap
      if (v > 0.55) {
        c.fillStyle = col;
        c.globalAlpha = 0.7;
        c.beginPath();
        c.arc(cx + cos * r1, cy + sin * r1, 1.5 + v * 2, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // === VU tick ring (between spokes and center) ===
    const ticks = 60;
    const tickR0 = baseR * 0.9;
    const tickR1 = baseR * 1.0;
    for (let i = 0; i < ticks; i++) {
      const u = i / ticks;
      const ang = u * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      const active = u <= needle;
      c.strokeStyle = active
        ? (u > 0.85 ? colors.accent : u > 0.6 ? colors.secondary : colors.primary)
        : colors.primary;
      c.globalAlpha = active ? 0.95 : 0.18;
      c.lineWidth = major ? 2 : 1;
      const r1 = major ? tickR1 + 4 : tickR1;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      c.beginPath();
      c.moveTo(cx + cos * tickR0, cy + sin * tickR0);
      c.lineTo(cx + cos * r1, cy + sin * r1);
      c.stroke();
    }
    c.globalAlpha = 1;

    // === Beat pulse rings (expanding) ===
    c.globalCompositeOperation = 'lighter';
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.radius += dt * (180 + smoothVol * 220);
      p.alpha -= dt * 0.55;
      if (p.alpha <= 0 || p.radius > Math.max(w, h)) {
        pulses.splice(i, 1);
        continue;
      }
      c.strokeStyle = pickColor(p.hue, colors);
      c.globalAlpha = p.alpha * 0.7;
      c.lineWidth = p.width;
      c.beginPath();
      c.arc(cx, cy, p.radius, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // === Polar oscilloscope (center) ===
    const wave = audioData.waveformData;
    const segments = quality === 'low' ? 96 : quality === 'medium' ? 160 : 240;
    c.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const ang = u * Math.PI * 2 - Math.PI / 2;
        let v: number;
        if (wave && wave.length) {
          const wi = Math.floor(u * (wave.length - 1));
          v = (wave[wi] ?? 0); // -1..1
        } else {
          // Fallback from FFT
          const s = sampleBars(audioData.bars, u);
          v = (s - 0.5) * 2;
        }
        const r = baseR * (0.62 + v * 0.18 + smoothBass * 0.08);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.strokeStyle = pass === 0 ? colors.accent : colors.primary;
      c.globalAlpha = pass === 0 ? 0.35 : 0.95;
      c.lineWidth = pass === 0 ? 8 : 1.6;
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // === Radar sweep arm ===
    sweepAngle += dt * (1.1 + smoothVol * 1.8);
    const sweepLen = baseR * 1.05;
    const grad = c.createLinearGradient(
      cx,
      cy,
      cx + Math.cos(sweepAngle) * sweepLen,
      cy + Math.sin(sweepAngle) * sweepLen,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, colors.accent);
    c.strokeStyle = grad;
    c.globalAlpha = 0.85;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(sweepAngle) * sweepLen, cy + Math.sin(sweepAngle) * sweepLen);
    c.stroke();
    c.globalAlpha = 1;

    // Blip when sweep crosses a strong band
    {
      const u = ((sweepAngle + Math.PI / 2) / (Math.PI * 2)) % 1;
      const v = sampleBars(audioData.bars, (u + 1) % 1);
      if (v > 0.55 && blips.length < MAX_BLIPS && Math.random() < 0.5) {
        const r = baseR * (0.6 + v * 0.5);
        blips.push({ angle: sweepAngle, radius: r, life: 1, size: 2 + v * 4 });
      }
    }

    // === Blips fade ===
    c.globalCompositeOperation = 'lighter';
    for (let i = blips.length - 1; i >= 0; i--) {
      const b = blips[i];
      b.life -= dt * 0.55;
      if (b.life <= 0) {
        blips.splice(i, 1);
        continue;
      }
      const x = cx + Math.cos(b.angle) * b.radius;
      const y = cy + Math.sin(b.angle) * b.radius;
      c.fillStyle = colors.accent;
      c.globalAlpha = b.life * 0.9;
      c.beginPath();
      c.arc(x, y, b.size, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = b.life * 0.25;
      c.beginPath();
      c.arc(x, y, b.size * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // === Center "ON AIR" core: pulsing disc ===
    const coreR = baseR * (0.18 + smoothBass * 0.08 + flash * 0.12);
    const coreGrad = c.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, colors.accent);
    coreGrad.addColorStop(0.5, colors.secondary);
    coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.75 + flash * 0.25;
    c.fillStyle = coreGrad;
    c.beginPath();
    c.arc(cx, cy, coreR, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    // Center ring outline
    c.strokeStyle = colors.primary;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.arc(cx, cy, baseR * 0.22, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;

    // === Beat-flash vignette ===
    if (flash > 0.01) {
      const fv = c.createRadialGradient(cx, cy, baseR * 0.4, cx, cy, Math.max(w, h) * 0.7);
      fv.addColorStop(0, `rgba(255,255,255,${0.05 * flash})`);
      fv.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = fv;
      c.fillRect(0, 0, w, h);
    }
  },
};

export default BroadcastVisualizer;