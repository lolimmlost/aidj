import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  life: number;
  bin: number;
  hueBand: 0 | 1 | 2;
}

let particles: Particle[] = [];
const BASE_MAX_PARTICLES = 120;
let shock = 0;
let orbPulse = 0;

let cachedOrbGradient: CanvasGradient | null = null;
let cachedCoreGradient: CanvasGradient | null = null;
let cachedOrbRadius = 0;
let cachedColors = '';

function createParticle(centerX: number, centerY: number, explosive: boolean): Particle {
  const angle = Math.random() * Math.PI * 2;
  const orbitRadius = 50 + Math.random() * 150;
  const hueBand = (Math.floor(Math.random() * 3)) as 0 | 1 | 2;

  return {
    x: centerX + Math.cos(angle) * (explosive ? 10 : orbitRadius),
    y: centerY + Math.sin(angle) * (explosive ? 10 : orbitRadius),
    vx: explosive ? (Math.random() - 0.5) * 12 : (Math.random() - 0.5) * 2,
    vy: explosive ? (Math.random() - 0.5) * 12 : (Math.random() - 0.5) * 2,
    radius: 2 + Math.random() * 3,
    angle,
    orbitRadius,
    orbitSpeed: 0.01 + Math.random() * 0.02,
    life: 1,
    bin: Math.floor(Math.random() * 32),
    hueBand,
  };
}

export const ParticleVisualizer: Visualizer = {
  name: 'Particle Ring',
  id: 'particles',

  init: () => {
    particles = [];
    cachedOrbGradient = null;
    cachedCoreGradient = null;
    shock = 0;
    orbPulse = 0;
  },

  cleanup: () => {
    particles = [];
    cachedOrbGradient = null;
    cachedCoreGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, deltaTime, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;
    const maxParticles = getAdaptiveCount(BASE_MAX_PARTICLES, quality);
    const dt = Math.min(deltaTime, 0.05);
    const bandColors = [colors.primary, colors.secondary, colors.accent];
    const bandEnergy = [bass, mid, treble];

    // Beat envelopes
    if (isBeat) {
      shock = Math.min(1, shock + 0.75);
      orbPulse = Math.min(1, orbPulse + 0.8);
    }
    shock = Math.max(0, shock - dt * 2.0);
    orbPulse = Math.max(0, orbPulse - dt * 1.5);

    // Motion trail
    c.fillStyle = colors.background;
    c.globalAlpha = 0.18 + (1 - volume) * 0.15;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    // Spawn: burst on beat, trickle otherwise
    const spawnRate = isBeat ? 12 : Math.floor(volume * 3) + 1;
    for (let i = 0; i < spawnRate && particles.length < maxParticles; i++) {
      particles.push(createParticle(centerX, centerY, isBeat));
    }

    const baseOrbitRadius = Math.min(width, height) * 0.2;

    c.globalCompositeOperation = 'lighter';

    // Update and draw particles per-band
    for (let band = 0; band < 3; band++) {
      c.fillStyle = bandColors[band];
      const bandParticles = particles.filter(p => p.hueBand === band);

      for (const p of bandParticles) {
        // Orbit speed scales with band energy
        p.angle += (p.orbitSpeed + bandEnergy[band] * 0.04 + shock * 0.06) * (1 + bass * 2);

        // Per-particle spectrum tap
        const barVal = bars.length > 0 ? (bars[p.bin % bars.length] || 0) : 0.3;

        const audioOrbit = p.orbitRadius * (1 + mid * 0.5 + orbPulse * 0.4) + barVal * 30;
        const targetX = centerX + Math.cos(p.angle) * audioOrbit;
        const targetY = centerY + Math.sin(p.angle) * audioOrbit;

        p.x += (targetX - p.x) * 0.1 + p.vx * bass;
        p.y += (targetY - p.y) * 0.1 + p.vy * bass;

        if (shock > 0.3) {
          p.vx += (Math.random() - 0.5) * shock * 6;
          p.vy += (Math.random() - 0.5) * shock * 6;
        }

        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
        p.life -= dt * 0.01;

        if (p.life <= 0) continue;

        const alpha = Math.min(1, p.life * 2) * (0.5 + barVal * 0.5);
        const size = p.radius * (1 + barVal * 2 + treble * 0.5) * (0.5 + p.life * 0.5);

        c.globalAlpha = alpha;
        c.beginPath();
        c.arc(p.x, p.y, size, 0, Math.PI * 2);
        c.fill();
      }
    }

    particles = particles.filter(p => p.life > 0);

    // Center orb — pulses with shock
    const orbRadius = baseOrbitRadius * 0.3 * (1 + bass * 0.3 + orbPulse * 0.5);
    const colorKey = colors.primary + colors.secondary;
    const radiusDiff = Math.abs(orbRadius - cachedOrbRadius);

    if (!cachedOrbGradient || cachedColors !== colorKey || radiusDiff > 10) {
      cachedOrbGradient = c.createRadialGradient(centerX, centerY, 0, centerX, centerY, orbRadius * 2);
      cachedOrbGradient.addColorStop(0, colors.primary + '80');
      cachedOrbGradient.addColorStop(0.5, colors.secondary + '30');
      cachedOrbGradient.addColorStop(1, 'transparent');

      cachedCoreGradient = c.createRadialGradient(centerX, centerY, 0, centerX, centerY, orbRadius);
      cachedCoreGradient.addColorStop(0, '#ffffff');
      cachedCoreGradient.addColorStop(0.3, colors.primary);
      cachedCoreGradient.addColorStop(1, colors.secondary);

      cachedOrbRadius = orbRadius;
      cachedColors = colorKey;
    }

    c.globalAlpha = 0.4 + shock * 0.3;
    c.beginPath();
    c.arc(centerX, centerY, orbRadius * 2, 0, Math.PI * 2);
    c.fillStyle = cachedOrbGradient!;
    c.fill();

    c.globalAlpha = 0.8 + shock * 0.2;
    c.beginPath();
    c.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
    c.fillStyle = cachedCoreGradient!;
    c.fill();

    // Orbit ring
    c.beginPath();
    c.arc(centerX, centerY, baseOrbitRadius * (1 + mid * 0.3 + orbPulse * 0.2), 0, Math.PI * 2);
    c.strokeStyle = colors.accent;
    c.lineWidth = 1 + shock * 2;
    c.globalAlpha = 0.3 + orbPulse * 0.4;
    c.stroke();

    // Beat shock ring
    if (shock > 0.05) {
      const ringR = (1 - shock) * Math.min(width, height) * 0.4;
      c.beginPath();
      c.arc(centerX, centerY, ringR, 0, Math.PI * 2);
      c.strokeStyle = colors.accent;
      c.lineWidth = shock * 3;
      c.globalAlpha = shock * 0.4;
      c.stroke();
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
