import type { Visualizer, VisualizerContext } from '../types';
import { getAdaptiveCount } from '../perf-utils';

// Simplified noise function
function noise(angle: number, time: number): number {
  return Math.sin(angle * 3 + time) * 0.5 + Math.sin(angle * 5 + time * 0.7) * 0.3;
}

// Cached gradients
let cachedGradients: CanvasGradient[] = [];
let cachedCenterGlow: CanvasGradient | null = null;
let cachedColors: string = '';
let cachedBaseRadius: number = 0;

export const BlobVisualizer: Visualizer = {
  name: 'Organic Blob',
  id: 'blob',

  init: () => {
    cachedGradients = [];
    cachedCenterGlow = null;
  },

  cleanup: () => {
    cachedGradients = [];
    cachedCenterGlow = null;
  },

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time, quality } = ctx;
    const { bars, bass, mid, treble, volume, isBeat } = audioData;

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    const baseRadius = Math.min(width, height) * 0.2;
    const points = getAdaptiveCount(64, quality);

    // Cache gradients if colors or size changed
    const colorKey = colors.primary + colors.secondary + colors.accent;
    const radiusDiff = Math.abs(baseRadius - cachedBaseRadius);

    if (cachedColors !== colorKey || radiusDiff > 10) {
      const layers = [
        { scale: 1.3, color: colors.accent },
        { scale: 1.15, color: colors.secondary },
        { scale: 1, color: colors.primary },
      ];

      cachedGradients = layers.map(layer => {
        const gradient = c.createRadialGradient(
          centerX, centerY, 0,
          centerX, centerY, baseRadius * layer.scale * 1.5
        );
        gradient.addColorStop(0, layer.color + 'ff');
        gradient.addColorStop(1, layer.color + '00');
        return gradient;
      });

      const glowRadius = baseRadius * 0.4;
      cachedCenterGlow = c.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, glowRadius
      );
      cachedCenterGlow.addColorStop(0, '#ffffff');
      cachedCenterGlow.addColorStop(0.2, colors.primary + 'cc');
      cachedCenterGlow.addColorStop(0.6, colors.secondary + '66');
      cachedCenterGlow.addColorStop(1, 'transparent');

      cachedColors = colorKey;
      cachedBaseRadius = baseRadius;
    }

    // Draw multiple blob layers
    const layerConfigs = [
      { scale: 1.3, alpha: 0.2, audioMult: treble, color: colors.accent },
      { scale: 1.15, alpha: 0.4, audioMult: mid, color: colors.secondary },
      { scale: 1, alpha: 0.8, audioMult: bass, color: colors.primary },
    ];

    layerConfigs.forEach((layer, layerIndex) => {
      c.beginPath();

      const timeOffset = time * 0.5;

      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;

        // Get frequency influence (simplified sampling)
        const barIndex = Math.floor((i / points) * 16);
        const barValue = bars[barIndex * 4] || 0;

        // Simplified noise
        const noiseValue = noise(angle, timeOffset);

        const radius =
          baseRadius *
          layer.scale *
          (1 + barValue * 0.4 * layer.audioMult) *
          (1 + noiseValue * 0.15) *
          (1 + layer.audioMult * 0.25);

        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (i === 0) {
          c.moveTo(x, y);
        } else {
          c.lineTo(x, y);
        }
      }

      c.closePath();

      // Fill with cached gradient
      c.fillStyle = cachedGradients[layerIndex] || layer.color;
      c.globalAlpha = layer.alpha;
      c.fill();

      // Stroke (simplified, no separate alpha change)
      c.strokeStyle = layer.color;
      c.lineWidth = 1.5;
      c.globalAlpha = layer.alpha * 0.4;
      c.stroke();
    });

    c.globalAlpha = 1;

    // Draw center glow
    const glowRadius = baseRadius * 0.4 * (1 + volume * 0.5);
    c.beginPath();
    c.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    c.fillStyle = cachedCenterGlow!;
    c.fill();

    // Beat flash effect (no shadow for performance)
    if (isBeat) {
      c.beginPath();
      c.arc(centerX, centerY, baseRadius * 1.5, 0, Math.PI * 2);
      c.strokeStyle = colors.primary;
      c.lineWidth = 3;
      c.globalAlpha = 0.5;
      c.stroke();
      c.globalAlpha = 1;
    }
  },
};
