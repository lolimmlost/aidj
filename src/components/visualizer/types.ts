// Visualizer types and interfaces

export interface AudioData {
  // Raw frequency data (0-255 values)
  frequencyData: Uint8Array;
  // Raw waveform data (-1 to 1 values)
  waveformData: Float32Array;
  // Normalized frequency bars (0-1 values, typically 32-64 bars)
  bars: number[];
  // Bass, mid, treble levels (0-1)
  bass: number;
  mid: number;
  treble: number;
  // Overall volume level (0-1)
  volume: number;
  // Peak level for beat detection
  peak: number;
  // Is there a beat happening right now
  isBeat: boolean;
}

export interface VisualizerContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  audioData: AudioData;
  colors: ColorTheme;
  deltaTime: number;
  time: number;
}

export interface ColorTheme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  // Gradient colors for effects
  gradient: string[];
}

export interface Visualizer {
  name: string;
  id: string;
  // Initialize any state needed
  init?: (ctx: VisualizerContext) => void;
  // Render a frame
  render: (ctx: VisualizerContext) => void;
  // Cleanup when switching visualizers
  cleanup?: () => void;
}

export interface VisualizerSettings {
  sensitivity: number; // 0.5 - 2.0
  smoothing: number; // 0 - 0.95
  colorTheme: string;
  autoRotate: boolean;
  autoRotateInterval: number; // seconds
  showLyrics: boolean; // Show lyrics overlay
  lyricsOffset: number; // Lyrics offset in seconds (-5 to +5)
  fpsLimit: 0 | 30 | 60; // 0 = unlimited (native), 30 = 30fps, 60 = 60fps (for battery saving)
}

// Preset color themes
export const COLOR_THEMES: ColorTheme[] = [
  {
    name: 'Neon',
    primary: '#00ffff',
    secondary: '#ff00ff',
    accent: '#ffff00',
    background: '#000000',
    gradient: ['#00ffff', '#ff00ff', '#ffff00'],
  },
  {
    name: 'Sunset',
    primary: '#ff6b6b',
    secondary: '#feca57',
    accent: '#ff9ff3',
    background: '#1a1a2e',
    gradient: ['#ff6b6b', '#feca57', '#ff9ff3'],
  },
  {
    name: 'Ocean',
    primary: '#00d9ff',
    secondary: '#0099ff',
    accent: '#00ffcc',
    background: '#001122',
    gradient: ['#00d9ff', '#0099ff', '#00ffcc'],
  },
  {
    name: 'Forest',
    primary: '#00ff88',
    secondary: '#88ff00',
    accent: '#00ffcc',
    background: '#001a0d',
    gradient: ['#00ff88', '#88ff00', '#00ffcc'],
  },
  {
    name: 'Fire',
    primary: '#ff4400',
    secondary: '#ff8800',
    accent: '#ffcc00',
    background: '#110500',
    gradient: ['#ff4400', '#ff8800', '#ffcc00'],
  },
  {
    name: 'Purple Haze',
    primary: '#9d4edd',
    secondary: '#c77dff',
    accent: '#e0aaff',
    background: '#10002b',
    gradient: ['#9d4edd', '#c77dff', '#e0aaff'],
  },
  {
    name: 'Monochrome',
    primary: '#ffffff',
    secondary: '#aaaaaa',
    accent: '#666666',
    background: '#000000',
    gradient: ['#ffffff', '#aaaaaa', '#666666'],
  },
  {
    name: 'Vapor',
    primary: '#ff71ce',
    secondary: '#01cdfe',
    accent: '#05ffa1',
    background: '#1a1a2e',
    gradient: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff'],
  },
];

export const DEFAULT_SETTINGS: VisualizerSettings = {
  sensitivity: 1.0,
  smoothing: 0.8,
  colorTheme: 'Neon',
  autoRotate: false,
  autoRotateInterval: 30,
  showLyrics: true,
  lyricsOffset: 0,
  fpsLimit: 0, // Unlimited by default
};
