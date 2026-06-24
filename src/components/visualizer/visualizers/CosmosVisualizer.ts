import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

// COSMOS — a journey through space past procedural planets.
//
// The camera drifts forward through a starfield. Planets spawn ahead,
// grow as they approach, then recede behind. Each planet has a unique
// palette, optional ring system, and atmosphere glow. Audio drives:
//   • camera speed (volume/bass)
//   • planet atmosphere pulse (bass)
//   • nebula cloud opacity (mid)
//   • shooting stars on beats

interface Star {
  x: number;
  y: number;
  z: number;
  brightness: number;
}

interface Planet {
  x: number;
  y: number;
  z: number;
  radius: number;
  hueBase: number;
  hasRings: boolean;
  ringTilt: number;
  atmosphereHue: number;
  surfaceDetail: number;
  bandCount: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  length: number;
  hue: number;
}

interface NebulaCloud {
  x: number;
  y: number;
  z: number;
  radius: number;
  hue: number;
  drift: number;
}

const BASE_STAR_COUNT = 300;
const BASE_NEBULA_COUNT = 5;
const MAX_PLANETS = 3;
const MAX_SHOOTING_STARS = 12;
const SPAWN_DEPTH = 1200;
const NEAR_CLIP = 10;

let stars: Star[] = [];
let planets: Planet[] = [];
let shootingStars: ShootingStar[] = [];
let nebulae: NebulaCloud[] = [];
let initializedCount = 0;
let cameraZ = 0;
let timeSinceLastPlanet = 0;
let globalTime = 0;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function buildStars(count: number, width: number, height: number) {
  stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: (Math.random() - 0.5) * width * 3,
      y: (Math.random() - 0.5) * height * 3,
      z: Math.random() * SPAWN_DEPTH,
      brightness: 0.3 + Math.random() * 0.7,
    });
  }
}

function spawnPlanet(width: number, height: number): Planet {
  return {
    x: (Math.random() - 0.5) * width * 1.2,
    y: (Math.random() - 0.5) * height * 0.8,
    z: cameraZ + SPAWN_DEPTH + rand(100, 400),
    radius: rand(30, 80),
    hueBase: rand(0, 360),
    hasRings: Math.random() > 0.45,
    ringTilt: rand(0.15, 0.45),
    atmosphereHue: rand(0, 360),
    surfaceDetail: rand(3, 8),
    bandCount: Math.floor(rand(3, 7)),
  };
}

function buildNebulae(count: number, width: number, height: number) {
  nebulae = [];
  for (let i = 0; i < count; i++) {
    nebulae.push({
      x: (Math.random() - 0.5) * width * 2.5,
      y: (Math.random() - 0.5) * height * 2.5,
      z: Math.random() * SPAWN_DEPTH,
      radius: rand(100, 300),
      hue: rand(0, 360),
      drift: rand(-0.3, 0.3),
    });
  }
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export const CosmosVisualizer: Visualizer = {
  name: 'Cosmos',
  id: 'cosmos',

  init: () => {
    stars = [];
    planets = [];
    shootingStars = [];
    nebulae = [];
    initializedCount = 0;
    cameraZ = 0;
    timeSinceLastPlanet = 0;
    globalTime = 0;
  },

  cleanup: () => {
    stars = [];
    planets = [];
    shootingStars = [];
    nebulae = [];
    initializedCount = 0;
    cameraZ = 0;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, deltaTime, quality } = ctx;
    const { bass, mid, treble, volume, isBeat } = audioData;
    const dt = Math.min(deltaTime, 0.05);
    globalTime += dt;

    const starCount = getAdaptiveCount(BASE_STAR_COUNT, quality);
    const nebulaCount = getAdaptiveCount(BASE_NEBULA_COUNT, quality);

    if (initializedCount !== starCount) {
      buildStars(starCount, width, height);
      buildNebulae(nebulaCount, width, height);
      initializedCount = starCount;
    }

    // ---- Camera movement ----
    const speed = (40 + volume * 120 + bass * 80) * dt;
    cameraZ += speed;

    // ---- Background ----
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    const primaryHSL = hexToHSL(colors.primary);

    // ---- Nebula clouds (behind everything) ----
    if (quality !== 'low') {
      c.globalCompositeOperation = 'lighter';
      for (const n of nebulae) {
        const relZ = n.z - (cameraZ % SPAWN_DEPTH);
        const dz = relZ < 0 ? relZ + SPAWN_DEPTH : relZ;
        const depthFade = 1 - dz / SPAWN_DEPTH;
        const scale = 500 / (dz + 200);

        const sx = n.x * scale + centerX + Math.sin(globalTime * n.drift) * 30;
        const sy = n.y * scale + centerY;
        const sr = n.radius * scale * (0.8 + mid * 0.6);

        const grad = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
        const hue = (n.hue + primaryHSL.h) % 360;
        grad.addColorStop(0, `hsla(${hue}, 70%, 50%, ${0.06 * depthFade * (0.5 + mid * 0.5)})`);
        grad.addColorStop(0.5, `hsla(${hue + 30}, 60%, 40%, ${0.03 * depthFade})`);
        grad.addColorStop(1, 'transparent');

        c.fillStyle = grad;
        c.beginPath();
        c.arc(sx, sy, sr, 0, Math.PI * 2);
        c.fill();
      }
    }

    // ---- Stars ----
    c.globalCompositeOperation = 'lighter';
    const focalLength = 500;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      let relZ = s.z - (cameraZ % SPAWN_DEPTH);
      if (relZ < 0) relZ += SPAWN_DEPTH;

      if (relZ < NEAR_CLIP) {
        stars[i] = {
          x: (Math.random() - 0.5) * width * 3,
          y: (Math.random() - 0.5) * height * 3,
          z: (cameraZ % SPAWN_DEPTH) + SPAWN_DEPTH - 10,
          brightness: 0.3 + Math.random() * 0.7,
        };
        continue;
      }

      const scale = focalLength / relZ;
      const sx = s.x * scale + centerX;
      const sy = s.y * scale + centerY;

      if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) continue;

      const depth = 1 - relZ / SPAWN_DEPTH;
      const alpha = s.brightness * depth * (0.5 + volume * 0.5);
      const size = (1 + depth * 2) * (1 + bass * 0.5);

      // Streak effect for nearby stars
      if (depth > 0.7 && quality !== 'low') {
        const streakLen = (depth - 0.7) * speed * 3;
        c.strokeStyle = colors.primary;
        c.globalAlpha = alpha * 0.8;
        c.lineWidth = size * 0.5;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx, sy + streakLen);
        c.stroke();
      }

      c.globalAlpha = alpha;
      c.fillStyle = depth > 0.5 ? colors.primary : depth > 0.25 ? colors.secondary : colors.accent;
      c.beginPath();
      c.arc(sx, sy, size, 0, Math.PI * 2);
      c.fill();
    }

    // ---- Planet spawning ----
    timeSinceLastPlanet += dt;
    if (planets.length < MAX_PLANETS && timeSinceLastPlanet > 3.5) {
      planets.push(spawnPlanet(width, height));
      timeSinceLastPlanet = 0;
    }

    // ---- Planets ----
    c.globalCompositeOperation = 'source-over';

    for (let i = planets.length - 1; i >= 0; i--) {
      const p = planets[i];
      const relZ = p.z - cameraZ;

      if (relZ < -200) {
        planets.splice(i, 1);
        continue;
      }

      const dz = Math.max(10, relZ);
      const scale = focalLength / dz;
      const sx = p.x * scale + centerX;
      const sy = p.y * scale + centerY;
      const sr = p.radius * scale;

      if (sr < 1 || sx + sr * 2 < 0 || sx - sr * 2 > width || sy + sr * 2 < 0 || sy - sr * 2 > height) continue;

      const approachFactor = Math.min(1, sr / 15);

      // Atmosphere glow
      if (quality !== 'low' && sr > 4) {
        const glowR = sr * (1.6 + bass * 0.5);
        const atmoGrad = c.createRadialGradient(sx, sy, sr * 0.9, sx, sy, glowR);
        const atmoHue = (p.atmosphereHue + primaryHSL.h) % 360;
        atmoGrad.addColorStop(0, `hsla(${atmoHue}, 80%, 60%, ${0.3 * approachFactor})`);
        atmoGrad.addColorStop(0.5, `hsla(${atmoHue}, 60%, 40%, ${0.1 * approachFactor})`);
        atmoGrad.addColorStop(1, 'transparent');
        c.fillStyle = atmoGrad;
        c.beginPath();
        c.arc(sx, sy, glowR, 0, Math.PI * 2);
        c.fill();
      }

      // Planet body
      c.save();
      c.beginPath();
      c.arc(sx, sy, sr, 0, Math.PI * 2);
      c.clip();

      // Base color
      const bodyHue = p.hueBase;
      const bodyGrad = c.createLinearGradient(sx - sr, sy - sr, sx + sr, sy + sr);
      bodyGrad.addColorStop(0, `hsl(${bodyHue}, 50%, 35%)`);
      bodyGrad.addColorStop(0.5, `hsl(${bodyHue + 20}, 40%, 25%)`);
      bodyGrad.addColorStop(1, `hsl(${bodyHue + 40}, 45%, 15%)`);
      c.fillStyle = bodyGrad;
      c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);

      // Surface bands
      if (quality !== 'low' && sr > 8) {
        for (let b = 0; b < p.bandCount; b++) {
          const bandY = sy - sr + (b / p.bandCount) * sr * 2;
          const bandH = sr * 2 / p.bandCount;
          const bandAlpha = 0.15 + Math.sin(b * p.surfaceDetail + globalTime * 0.3) * 0.1;
          c.fillStyle = `hsla(${bodyHue + b * 15}, 40%, ${30 + b * 5}%, ${bandAlpha})`;
          c.fillRect(sx - sr, bandY, sr * 2, bandH);
        }
      }

      // Terminator shadow (day/night divide)
      const shadowGrad = c.createLinearGradient(sx - sr * 0.3, sy, sx + sr, sy);
      shadowGrad.addColorStop(0, 'transparent');
      shadowGrad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
      c.fillStyle = shadowGrad;
      c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);

      c.restore();

      // Rings
      if (p.hasRings && sr > 5) {
        c.save();
        c.translate(sx, sy);
        c.scale(1, p.ringTilt);

        const ringInner = sr * 1.3;
        const ringOuter = sr * 2.0;
        const ringSegments = quality === 'low' ? 32 : 64;

        for (let r = 0; r < 3; r++) {
          const rInner = ringInner + r * (ringOuter - ringInner) / 3;
          const rOuter = rInner + (ringOuter - ringInner) / 3 - 1;
          const ringAlpha = (0.25 - r * 0.06) * approachFactor;
          const ringHue = (bodyHue + r * 30 + 180) % 360;

          c.globalAlpha = ringAlpha;
          c.strokeStyle = `hsl(${ringHue}, 50%, 65%)`;
          c.lineWidth = (rOuter - rInner) * 0.6;
          c.beginPath();

          // Draw only the back half of rings behind the planet
          for (let s = 0; s <= ringSegments; s++) {
            const angle = Math.PI + (s / ringSegments) * Math.PI;
            const rx = Math.cos(angle) * (rInner + rOuter) * 0.5;
            const ry = Math.sin(angle) * (rInner + rOuter) * 0.5;
            if (s === 0) c.moveTo(rx, ry);
            else c.lineTo(rx, ry);
          }
          c.stroke();
        }

        // Front half of rings (drawn on top of planet)
        for (let r = 0; r < 3; r++) {
          const rInner = ringInner + r * (ringOuter - ringInner) / 3;
          const rOuter = rInner + (ringOuter - ringInner) / 3 - 1;
          const ringAlpha = (0.3 - r * 0.06) * approachFactor;
          const ringHue = (bodyHue + r * 30 + 180) % 360;

          c.globalAlpha = ringAlpha;
          c.strokeStyle = `hsl(${ringHue}, 50%, 65%)`;
          c.lineWidth = (rOuter - rInner) * 0.6;
          c.beginPath();

          for (let s = 0; s <= ringSegments; s++) {
            const angle = (s / ringSegments) * Math.PI;
            const rx = Math.cos(angle) * (rInner + rOuter) * 0.5;
            const ry = Math.sin(angle) * (rInner + rOuter) * 0.5;
            if (s === 0) c.moveTo(rx, ry);
            else c.lineTo(rx, ry);
          }
          c.stroke();
        }

        c.restore();
      }

      // Bass pulse highlight
      if (bass > 0.5 && sr > 10) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = (bass - 0.5) * 0.3 * approachFactor;
        c.fillStyle = colors.primary;
        c.beginPath();
        c.arc(sx, sy, sr * 1.1, 0, Math.PI * 2);
        c.fill();
        c.globalCompositeOperation = 'source-over';
      }
    }

    // ---- Shooting stars on beat ----
    if (isBeat && shootingStars.length < MAX_SHOOTING_STARS) {
      const count = 1 + Math.floor(treble * 3);
      for (let i = 0; i < count; i++) {
        const fromLeft = Math.random() > 0.5;
        shootingStars.push({
          x: fromLeft ? rand(-50, width * 0.3) : rand(width * 0.7, width + 50),
          y: rand(-50, height * 0.3),
          vx: fromLeft ? rand(200, 500) : rand(-500, -200),
          vy: rand(100, 300),
          life: 1,
          length: rand(40, 100),
          hue: rand(0, 360),
        });
      }
    }

    // Update & draw shooting stars
    c.globalCompositeOperation = 'lighter';
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const ss = shootingStars[i];
      ss.x += ss.vx * dt;
      ss.y += ss.vy * dt;
      ss.life -= dt * 1.5;

      if (ss.life <= 0) {
        shootingStars.splice(i, 1);
        continue;
      }

      const tailX = ss.x - (ss.vx * dt * ss.length * 0.15);
      const tailY = ss.y - (ss.vy * dt * ss.length * 0.15);

      const grad = c.createLinearGradient(tailX, tailY, ss.x, ss.y);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, colors.accent);

      c.globalAlpha = ss.life * 0.8;
      c.strokeStyle = grad;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(tailX, tailY);
      c.lineTo(ss.x, ss.y);
      c.stroke();

      // Head glow
      c.fillStyle = colors.accent;
      c.globalAlpha = ss.life;
      c.beginPath();
      c.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
      c.fill();
    }

    // ---- Subtle vignette ----
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    const vigGrad = c.createRadialGradient(centerX, centerY, height * 0.3, centerX, centerY, height * 0.9);
    vigGrad.addColorStop(0, 'transparent');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    c.fillStyle = vigGrad;
    c.fillRect(0, 0, width, height);

    // ---- Beat flash ----
    if (isBeat) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.08;
      c.fillStyle = colors.primary;
      c.fillRect(0, 0, width, height);
    }

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  },
};
