import type { Visualizer, VisualizerContext } from '../types';

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
  isPrimary: boolean; // Simplified from hue
}

let particles: Particle[] = [];
const MAX_PARTICLES = 80; // Reduced from 200

// Cached center orb gradient
let cachedOrbGradient: CanvasGradient | null = null;
let cachedCoreGradient: CanvasGradient | null = null;
let cachedOrbRadius: number = 0;
let cachedColors: string = '';

function createParticle(centerX: number, centerY: number): Particle {
  const angle = Math.random() * Math.PI * 2;
  const orbitRadius = 50 + Math.random() * 150;

  return {
    x: centerX + Math.cos(angle) * orbitRadius,
    y: centerY + Math.sin(angle) * orbitRadius,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    radius: 2 + Math.random() * 3,
    angle,
    orbitRadius,
    orbitSpeed: 0.01 + Math.random() * 0.02,
    life: 1,
    isPrimary: Math.random() < 0.5,
  };
}

export const ParticleVisualizer: Visualizer = {
  name: 'Particle Ring',
  id: 'particles',

  init: () => {
    particles = [];
    cachedOrbGradient = null;
    cachedCoreGradient = null;
  },

  cleanup: () => {
    particles = [];
    cachedOrbGradient = null;
    cachedCoreGradient = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, deltaTime } = ctx;
    const { bass, mid, treble, volume, isBeat } = audioData;

    // Semi-transparent clear for trail effect
    c.fillStyle = colors.background;
    c.globalAlpha = 0.2;
    c.fillRect(0, 0, width, height);
    c.globalAlpha = 1;

    // Spawn new particles on beats or randomly (reduced rate)
    const spawnRate = isBeat ? 5 : Math.floor(volume * 2);
    for (let i = 0; i < spawnRate && particles.length < MAX_PARTICLES; i++) {
      particles.push(createParticle(centerX, centerY));
    }

    const baseOrbitRadius = Math.min(width, height) * 0.2;

    // Update particles and batch draw by color
    const primaryParticles: { x: number; y: number; size: number; alpha: number }[] = [];
    const secondaryParticles: { x: number; y: number; size: number; alpha: number }[] = [];

    particles = particles.filter((p) => {
      // Update position
      p.angle += p.orbitSpeed * (1 + bass * 2);

      // Orbit with audio influence
      const audioOrbit = p.orbitRadius * (1 + mid * 0.5);
      const targetX = centerX + Math.cos(p.angle) * audioOrbit;
      const targetY = centerY + Math.sin(p.angle) * audioOrbit;

      // Smooth movement towards orbit position
      p.x += (targetX - p.x) * 0.1 + p.vx * bass;
      p.y += (targetY - p.y) * 0.1 + p.vy * bass;

      // Add some chaos on beats
      if (isBeat) {
        p.vx += (Math.random() - 0.5) * 5;
        p.vy += (Math.random() - 0.5) * 5;
      }

      // Decay velocity
      p.vx *= 0.95;
      p.vy *= 0.95;

      // Age particle
      p.life -= deltaTime * 0.012;

      if (p.life <= 0) return false;

      // Collect particle data for batched drawing
      const alpha = Math.min(1, p.life * 2);
      const size = p.radius * (1 + treble) * alpha;

      if (p.isPrimary) {
        primaryParticles.push({ x: p.x, y: p.y, size, alpha });
      } else {
        secondaryParticles.push({ x: p.x, y: p.y, size, alpha });
      }

      return true;
    });

    // Batch draw primary particles
    c.fillStyle = colors.primary;
    primaryParticles.forEach(p => {
      c.globalAlpha = p.alpha;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    });

    // Batch draw secondary particles
    c.fillStyle = colors.secondary;
    secondaryParticles.forEach(p => {
      c.globalAlpha = p.alpha;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;

    // Draw center orb (cache gradients)
    const orbRadius = baseOrbitRadius * 0.3 * (1 + bass * 0.3);
    const colorKey = colors.primary + colors.secondary;

    // Only recreate gradients if colors changed significantly or radius changed a lot
    const radiusDiff = Math.abs(orbRadius - cachedOrbRadius);
    if (!cachedOrbGradient || cachedColors !== colorKey || radiusDiff > 10) {
      cachedOrbGradient = c.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, orbRadius * 2
      );
      cachedOrbGradient.addColorStop(0, colors.primary + '60');
      cachedOrbGradient.addColorStop(0.5, colors.secondary + '20');
      cachedOrbGradient.addColorStop(1, 'transparent');

      cachedCoreGradient = c.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, orbRadius
      );
      cachedCoreGradient.addColorStop(0, '#ffffff');
      cachedCoreGradient.addColorStop(0.3, colors.primary);
      cachedCoreGradient.addColorStop(1, colors.secondary);

      cachedOrbRadius = orbRadius;
      cachedColors = colorKey;
    }

    // Outer glow
    c.beginPath();
    c.arc(centerX, centerY, orbRadius * 2, 0, Math.PI * 2);
    c.fillStyle = cachedOrbGradient!;
    c.fill();

    // Core
    c.beginPath();
    c.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
    c.fillStyle = cachedCoreGradient!;
    c.fill();

    // Draw orbit ring
    c.beginPath();
    c.arc(centerX, centerY, baseOrbitRadius * (1 + mid * 0.3), 0, Math.PI * 2);
    c.strokeStyle = colors.accent;
    c.lineWidth = 1;
    c.globalAlpha = 0.3;
    c.stroke();
    c.globalAlpha = 1;
  },
};
