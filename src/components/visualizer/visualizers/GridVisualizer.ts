import type { Visualizer, VisualizerContext } from '../types';

// Grid state
const GRID_SIZE = 16;
let gridValues = new Float32Array(GRID_SIZE * GRID_SIZE);

export const GridVisualizer: Visualizer = {
  name: '3D Grid',
  id: 'grid',

  init: () => {
    gridValues = new Float32Array(GRID_SIZE * GRID_SIZE);
  },

  cleanup: () => {},

  render: (ctx: VisualizerContext) => {
    const { ctx: c, width, height, centerX, centerY, audioData, colors, time } = ctx;
    const { bars, bass, mid, treble, isBeat } = audioData;

    // Clear canvas
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);

    const cellWidth = width / GRID_SIZE;
    const cellHeight = height / GRID_SIZE;
    const maxHeight = Math.min(width, height) * 0.15;

    // Update grid values based on audio
    const hasAudio = bars.length > 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const idx = y * GRID_SIZE + x;

        // Distance from center
        const dx = x - GRID_SIZE / 2;
        const dy = y - GRID_SIZE / 2;
        const dist = Math.sqrt(dx * dx + dy * dy) / (GRID_SIZE / 2);

        // Get audio value based on position
        const barIdx = hasAudio ? Math.floor((x / GRID_SIZE) * Math.min(bars.length, 32)) : 0;
        const barValue = hasAudio ? (bars[barIdx] || 0) : 0.3;

        // Create ripple effect from center
        const ripple = Math.sin(dist * 6 - time * 3) * 0.5 + 0.5;

        // Target value
        const target = barValue * (1 - dist * 0.5) * ripple + bass * 0.3 * (1 - dist);

        // Smooth transition
        gridValues[idx] = gridValues[idx] * 0.85 + target * 0.15;
      }
    }

    // Draw grid from back to front (3D effect)
    const perspective = 0.4;

    for (let y = 0; y < GRID_SIZE; y++) {
      const rowY = y / GRID_SIZE;
      const scale = 1 - rowY * perspective;
      const offsetY = rowY * perspective * height * 0.3;

      for (let x = 0; x < GRID_SIZE; x++) {
        const idx = y * GRID_SIZE + x;
        const value = gridValues[idx];

        // Calculate 3D-projected position
        const baseX = x * cellWidth * scale + (width * (1 - scale)) / 2;
        const baseY = y * cellHeight * scale + offsetY;
        const barHeight = value * maxHeight * scale;

        // Color based on height
        const hue = value;
        if (hue < 0.33) {
          c.fillStyle = colors.primary;
        } else if (hue < 0.66) {
          c.fillStyle = colors.secondary;
        } else {
          c.fillStyle = colors.accent;
        }

        c.globalAlpha = 0.3 + value * 0.7;

        // Draw bar
        const barWidth = cellWidth * scale * 0.8;
        c.fillRect(
          baseX + (cellWidth * scale - barWidth) / 2,
          baseY + cellHeight * scale - barHeight,
          barWidth,
          barHeight
        );
      }
    }
    c.globalAlpha = 1;

    // Draw grid lines
    c.strokeStyle = colors.primary;
    c.lineWidth = 1;
    c.globalAlpha = 0.2;

    // Horizontal lines
    c.beginPath();
    for (let y = 0; y <= GRID_SIZE; y++) {
      const rowY = y / GRID_SIZE;
      const scale = 1 - rowY * perspective;
      const offsetY = rowY * perspective * height * 0.3;
      const lineY = y * (height / GRID_SIZE) * scale + offsetY;
      const lineX1 = (width * (1 - scale)) / 2;
      const lineX2 = width - lineX1;
      c.moveTo(lineX1, lineY);
      c.lineTo(lineX2, lineY);
    }
    c.stroke();

    // Vertical lines
    c.beginPath();
    for (let x = 0; x <= GRID_SIZE; x++) {
      const topScale = 1;
      const bottomScale = 1 - perspective;
      const topX = x * cellWidth;
      const bottomX = x * cellWidth * bottomScale + (width * (1 - bottomScale)) / 2;
      c.moveTo(topX, 0);
      c.lineTo(bottomX, height * (1 - perspective * 0.7));
    }
    c.stroke();
    c.globalAlpha = 1;

    // Beat flash overlay
    if (isBeat) {
      c.fillStyle = colors.accent;
      c.globalAlpha = 0.1;
      c.fillRect(0, 0, width, height);
      c.globalAlpha = 1;
    }
  },
};
