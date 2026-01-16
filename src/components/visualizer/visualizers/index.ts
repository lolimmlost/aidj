import type { Visualizer } from '../types';
import { BarsVisualizer } from './BarsVisualizer';
import { WaveformVisualizer } from './WaveformVisualizer';
import { CircularVisualizer } from './CircularVisualizer';
import { ParticleVisualizer } from './ParticleVisualizer';
import { BlobVisualizer } from './BlobVisualizer';
import { SpiralVisualizer } from './SpiralVisualizer';
import { GridVisualizer } from './GridVisualizer';
import { OscilloscopeVisualizer } from './OscilloscopeVisualizer';
import { StarfieldVisualizer } from './StarfieldVisualizer';
import { PulseRingsVisualizer } from './PulseRingsVisualizer';

// Registry of all available visualizers
export const visualizers: Visualizer[] = [
  BarsVisualizer,
  WaveformVisualizer,
  CircularVisualizer,
  ParticleVisualizer,
  BlobVisualizer,
  SpiralVisualizer,
  GridVisualizer,
  OscilloscopeVisualizer,
  StarfieldVisualizer,
  PulseRingsVisualizer,
];

// Get visualizer by ID
export function getVisualizerById(id: string): Visualizer | undefined {
  return visualizers.find((v) => v.id === id);
}

// Get next visualizer in the list
export function getNextVisualizer(currentId: string): Visualizer {
  const currentIndex = visualizers.findIndex((v) => v.id === currentId);
  const nextIndex = (currentIndex + 1) % visualizers.length;
  return visualizers[nextIndex];
}

// Get previous visualizer in the list
export function getPreviousVisualizer(currentId: string): Visualizer {
  const currentIndex = visualizers.findIndex((v) => v.id === currentId);
  const prevIndex = currentIndex <= 0 ? visualizers.length - 1 : currentIndex - 1;
  return visualizers[prevIndex];
}

export {
  BarsVisualizer,
  WaveformVisualizer,
  CircularVisualizer,
  ParticleVisualizer,
  BlobVisualizer,
  SpiralVisualizer,
  GridVisualizer,
  OscilloscopeVisualizer,
  StarfieldVisualizer,
  PulseRingsVisualizer,
};
