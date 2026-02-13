// Web Audio API Integration Service
// Provides real-time audio processing and visualization capabilities

import type { BufferAnalysis } from './audio-buffer-analyzer';
import { ServiceError } from '../utils';

// Audio processor configuration
export interface AudioProcessorConfig {
  sampleRate: number;
  bufferSize: number;
  inputChannels: number;
  outputChannels: number;
  fftSize: number;
  enableVisualization: boolean;
  enableRealTimeAnalysis: boolean;
  analysisUpdateInterval: number; // ms
  latencyCompensation: boolean;
  autoGainControl: boolean;
  compressorEnabled: boolean;
  reverbEnabled: boolean;
  filterEnabled: boolean;
}

// Audio node connections
export interface AudioNodeConnections {
  input: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
  gain: GainNode | null;
  compressor: DynamicsCompressorNode | null;
  filter: BiquadFilterNode | null;
  reverb: ConvolverNode | null;
  splitter: ChannelSplitterNode | null;
  merger: ChannelMergerNode | null;
}

// Visualization data
export interface VisualizationData {
  waveform: Float32Array;
  frequency: Uint8Array;
  bars: number[]; // Frequency bars for visualization
  peaks: number[]; // Frequency peaks
  rms: number; // RMS level
  peak: number; // Peak level
  time: number; // Current time
}

// Default processor configuration
export const DEFAULT_PROCESSOR_CONFIG: AudioProcessorConfig = {
  sampleRate: 44100,
  bufferSize: 4096,
  inputChannels: 2,
  outputChannels: 2,
  fftSize: 2048,
  enableVisualization: true,
  enableRealTimeAnalysis: true,
  analysisUpdateInterval: 100, // 100ms
  latencyCompensation: true,
  autoGainControl: true,
  compressorEnabled: true,
  reverbEnabled: false,
  filterEnabled: true
};

/**
 * Web Audio Processor Class
 * Manages Web Audio API nodes and real-time processing
 */
export class WebAudioProcessor {
  private audioContext: AudioContext | null = null;
  private nodes: AudioNodeConnections = {
    input: null,
    analyser: null,
    gain: null,
    compressor: null,
    filter: null,
    reverb: null,
    splitter: null,
    merger: null
  };
  
  private config: AudioProcessorConfig;
  private visualizationData: VisualizationData;
  private analysisData: BufferAnalysis | null = null;
  private isProcessing: boolean = false;
  private currentTime: number = 0;
  private analysisTimer: number | null = null;
  
  // Event callbacks
  private onAudioProcess?: (data: VisualizationData) => void;
  private onAnalysisUpdate?: (analysis: BufferAnalysis) => void;
  private onError?: (error: Error) => void;
  
  constructor(config: Partial<AudioProcessorConfig> = {}) {
    this.config = { ...DEFAULT_PROCESSOR_CONFIG, ...config };
    this.visualizationData = {
      waveform: new Float32Array(this.config.bufferSize),
      frequency: new Uint8Array(this.config.fftSize / 2),
      bars: new Array(32).fill(0),
      peaks: [],
      rms: 0,
      peak: 0,
      time: 0
    };
  }

  /**
   * Initialize audio context and nodes
   */
  async initialize(): Promise<void> {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      
      // Create audio nodes
      await this.createAudioNodes();
      
      // Connect nodes
      this.connectNodes();
      
      // Start processing loop
      this.startProcessing();
      
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error('Unknown error'));
      throw new ServiceError(
        'AUDIO_PROCESSOR_INIT_ERROR',
        `Failed to initialize audio processor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create audio nodes
   */
  private async createAudioNodes(): Promise<void> {
    if (!this.audioContext) return;
    
    // Create analyser node for visualization
    this.nodes.analyser = this.audioContext.createAnalyser();
    this.nodes.analyser.fftSize = this.config.fftSize;
    this.nodes.analyser.smoothingTimeConstant = 0.8;
    this.nodes.analyser.minDecibels = -90;
    this.nodes.analyser.maxDecibels = -10;
    
    // Create gain node for volume control
    this.nodes.gain = this.audioContext.createGain();
    this.nodes.gain.gain.value = 1.0;
    
    // Create compressor for dynamics
    if (this.config.compressorEnabled) {
      this.nodes.compressor = this.audioContext.createDynamicsCompressor();
      this.nodes.compressor.threshold.value = -24;
      this.nodes.compressor.knee.value = 30;
      this.nodes.compressor.ratio.value = 12;
      this.nodes.compressor.attack.value = 0.003;
      this.nodes.compressor.release.value = 0.25;
    }
    
    // Create filter for EQ
    if (this.config.filterEnabled) {
      this.nodes.filter = this.audioContext.createBiquadFilter();
      this.nodes.filter.type = 'lowpass';
      this.nodes.filter.frequency.value = 20000;
      this.nodes.filter.Q.value = 1;
    }
    
    // Create channel splitter for stereo processing
    this.nodes.splitter = this.audioContext.createChannelSplitter(this.config.inputChannels);
    
    // Create channel merger for output
    this.nodes.merger = this.audioContext.createChannelMerger(this.config.outputChannels);
  }

  /**
   * Connect audio nodes
   */
  private connectNodes(): void {
    if (!this.audioContext) return;
    
    // Connect input to splitter
    // This would be connected to actual input source
    
    // Connect splitter to analyser
    if (this.nodes.splitter && this.nodes.analyser) {
      this.nodes.splitter.connect(this.nodes.analyser);
    }
    
    // Connect splitter to filter
    if (this.nodes.splitter && this.nodes.filter) {
      this.nodes.splitter.connect(this.nodes.filter);
    }
    
    // Connect filter to compressor
    if (this.nodes.filter && this.nodes.compressor) {
      this.nodes.filter.connect(this.nodes.compressor);
    }
    
    // Connect compressor to gain
    if (this.nodes.compressor && this.nodes.gain) {
      this.nodes.compressor.connect(this.nodes.gain);
    }
    
    // Connect gain to merger
    if (this.nodes.gain && this.nodes.merger) {
      this.nodes.gain.connect(this.nodes.merger);
    }
    
    // Connect merger to destination
    if (this.nodes.merger) {
      this.nodes.merger.connect(this.audioContext.destination);
    }
  }

  /**
   * Start audio processing loop
   */
  private startProcessing(): void {
    if (!this.audioContext || !this.nodes.analyser) return;
    
    this.isProcessing = true;
    
    // Start visualization update loop
    if (this.config.enableVisualization) {
      this.updateVisualization();
    }
    
    // Start analysis update loop
    if (this.config.enableRealTimeAnalysis) {
      this.analysisTimer = window.setInterval(() => {
        this.updateAnalysis();
      }, this.config.analysisUpdateInterval);
    }
  }

  /**
   * Stop audio processing
   */
  stop(): void {
    this.isProcessing = false;
    
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
  }

  /**
   * Connect media element as input source
   */
  connectMediaElement(element: HTMLAudioElement): void {
    if (!this.audioContext) return;
    
    try {
      // Create or get existing source
      if (!this.nodes.input) {
        this.nodes.input = this.audioContext.createMediaElementSource(element);
        
        // Connect to processing chain
        this.nodes.input.connect(this.nodes.splitter!);
      }
      
      // Handle autoplay policies
      if (this.nodes.input) {
        this.nodes.input.mediaElement.play().then(() => {
          // Successfully started
        }).catch((error) => {
          this.onError?.(error);
        });
      }
      
    } catch (error) {
      this.onError?.(error);
    }
  }

  /**
   * Disconnect media element
   */
  disconnectMediaElement(): void {
    if (this.nodes.input) {
      try {
        this.nodes.input.disconnect();
        this.nodes.input = null;
      } catch (error) {
        this.onError?.(error);
      }
    }
  }

  /**
   * Update visualization data
   */
  private updateVisualization(): void {
    if (!this.nodes.analyser) return;
    
    // Get frequency data
    const frequencyData = new Uint8Array(this.nodes.analyser.frequencyBinCount);
    this.nodes.analyser.getByteFrequencyData(frequencyData);
    
    // Get time domain data for waveform
    const timeData = new Float32Array(this.nodes.analyser.fftSize);
    this.nodes.analyser.getFloatTimeDomainData(timeData);
    
    // Update visualization data
    this.visualizationData.frequency = frequencyData;
    this.visualizationData.waveform = timeData;
    this.visualizationData.time = Date.now();
    
    // Calculate frequency bars
    this.calculateFrequencyBars(frequencyData);
    
    // Calculate RMS and peak
    this.calculateLevels(timeData);
    
    // Trigger callback
    this.onAudioProcess?.(this.visualizationData);
  }

  /**
   * Calculate frequency bars for visualization
   */
  private calculateFrequencyBars(frequencyData: Uint8Array): void {
    const barCount = 32;
    const barWidth = Math.floor(frequencyData.length / barCount);
    
    this.visualizationData.bars = new Array(barCount).fill(0);
    
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const startBin = i * barWidth;
      const endBin = Math.min((i + 1) * barWidth, frequencyData.length);
      
      for (let j = startBin; j < endBin; j++) {
        sum += frequencyData[j];
      }
      
      this.visualizationData.bars[i] = sum / barWidth;
    }
    
    // Find peaks
    this.visualizationData.peaks = [];
    for (let i = 1; i < barCount - 1; i++) {
      if (this.visualizationData.bars[i] > this.visualizationData.bars[i - 1] && 
          this.visualizationData.bars[i] > this.visualizationData.bars[i + 1]) {
        this.visualizationData.peaks.push(i);
      }
    }
  }

  /**
   * Calculate RMS and peak levels
   */
  private calculateLevels(timeData: Float32Array): void {
    let sum = 0;
    let peak = 0;
    
    for (let i = 0; i < timeData.length; i++) {
      const value = Math.abs(timeData[i]);
      sum += value * value;
      peak = Math.max(peak, value);
    }
    
    this.visualizationData.rms = Math.sqrt(sum / timeData.length);
    this.visualizationData.peak = peak;
  }

  /**
   * Update real-time analysis
   */
  private updateAnalysis(): void {
    if (!this.nodes.analyser) return;
    
    // Get current audio data
    const timeData = new Float32Array(this.nodes.analyser.fftSize);
    this.nodes.analyser.getFloatTimeDomainData(timeData);
    
    // Perform buffer analysis
    this.analysisData = this.analyzeAudioBuffer({
      getChannelData: (_channel: number) => timeData,
      length: timeData.length,
      sampleRate: this.config.sampleRate,
      numberOfChannels: 1
    });
    
    // Trigger callback
    this.onAnalysisUpdate?.(this.analysisData);
  }

  /**
   * Set audio parameters
   */
  setVolume(value: number): void {
    if (this.nodes.gain) {
      this.nodes.gain.gain.setValueAtTime(value, this.audioContext!.currentTime);
    }
  }

  /**
   * Set filter parameters
   */
  setFilter(type: BiquadFilterType, frequency: number, Q: number): void {
    if (this.nodes.filter) {
      this.nodes.filter.type = type;
      this.nodes.filter.frequency.setValueAtTime(frequency, this.audioContext!.currentTime);
      this.nodes.filter.Q.setValueAtTime(Q, this.audioContext!.currentTime);
    }
  }

  /**
   * Set compressor parameters
   */
  setCompressor(threshold: number, knee: number, ratio: number, attack: number, release: number): void {
    if (this.nodes.compressor) {
      this.nodes.compressor.threshold.setValueAtTime(threshold, this.audioContext!.currentTime);
      this.nodes.compressor.knee.setValueAtTime(knee, this.audioContext!.currentTime);
      this.nodes.compressor.ratio.setValueAtTime(ratio, this.audioContext!.currentTime);
      this.nodes.compressor.attack.setValueAtTime(attack, this.audioContext!.currentTime);
      this.nodes.compressor.release.setValueAtTime(release, this.audioContext!.currentTime);
    }
  }

  /**
   * Get current visualization data
   */
  getVisualizationData(): VisualizationData {
    return { ...this.visualizationData };
  }

  /**
   * Get current analysis data
   */
  getAnalysisData(): BufferAnalysis | null {
    return this.analysisData;
  }

  /**
   * Get audio context state
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Check if processing is active
   */
  isActive(): boolean {
    return this.isProcessing;
  }

  /**
   * Get current time
   */
  getCurrentTime(): number {
    return this.audioContext ? this.audioContext.currentTime : 0;
  }

  /**
   * Set event callbacks
   */
  onAudioProcessed(callback: (data: VisualizationData) => void): void {
    this.onAudioProcess = callback;
  }

  onAnalysisUpdated(callback: (analysis: BufferAnalysis) => void): void {
    this.onAnalysisUpdate = callback;
  }

  onErrorOccurred(callback: (error: Error) => void): void {
    this.onError = callback;
  }

  /**
   * Create impulse response for reverb
   */
  static createReverbImpulse(
    duration: number = 2.0,
    decay: number = 2.0,
    reverse: boolean = false,
    sampleRate: number = 44100
  ): AudioBuffer {
    const length = Math.floor(duration * sampleRate);
    const impulse = new Float32Array(length);
    
    // Generate simple impulse response
    for (let i = 0; i < length; i++) {
      if (reverse) {
        impulse[i] = i === 0 ? 1 : 0;
      } else {
        const envelope = Math.exp(-i / (length * decay));
        impulse[i] = envelope * (i < length / 2 ? 1 : -1);
      }
    }
    
    // Create audio buffer
    const audioContext = new AudioContext();
    return audioContext.createBuffer(1, length, sampleRate, impulse);
  }

  /**
   * Create low-pass filter impulse response
   */
  static createLowPassImpulse(
    cutoff: number = 1000,
    sampleRate: number = 44100
  ): AudioBuffer {
    const length = Math.floor(sampleRate * 0.1); // 100ms
    const impulse = new Float32Array(length);
    
    // Generate low-pass filter impulse
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const omega = 2 * Math.PI * cutoff / sampleRate;
      impulse[i] = Math.sin(omega * t) * Math.exp(-Math.abs(t) * 5);
    }
    
    // Create audio buffer
    const audioContext = new AudioContext();
    return audioContext.createBuffer(1, length, sampleRate, impulse);
  }

  /**
   * Get supported audio formats
   */
  static getSupportedFormats(): string[] {
    const audioContext = new AudioContext();
    
    // Check for different formats
    const formats: string[] = [];
    
    // Check for WebM
    if (audioContext.createMediaElementSource) {
      const audio = document.createElement('audio');
      if (audio.canPlayType) {
        const webMFormats = [
          'audio/webm',
          'audio/ogg',
          'audio/wav'
        ];
        
        webMFormats.forEach(format => {
          if (audio.canPlayType(format)) {
            formats.push(format);
          }
        });
      }
    }
    
    return formats;
  }

  /**
   * Check for specific codec support
   */
  static supportsCodec(codec: string): boolean {
    const audio = document.createElement('audio');
    return audio.canPlayType(codec);
  }

  /**
   * Get microphone access
   */
  async requestMicrophoneAccess(): Promise<MediaStream | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseCancellation: true,
          autoGainControl: true,
          sampleRate: this.DEFAULT_PROCESSOR_CONFIG.sampleRate
        }
      });
      
      return stream;
    } catch (error) {
      console.error('Microphone access denied:', error);
      return null;
    }
  }

  /**
   * Create audio worklet for advanced processing
   */
  static async createAudioWorklet(
    processorCode: string,
    options: { name?: string; } = {}
  ): Promise<AudioWorkletNode | null> {
    if (!window.AudioWorklet) {
      console.warn('AudioWorklet not supported');
      return null;
    }
    
    try {
      // Create worklet module
      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      
      // Create worklet node
      const workletNode = new AudioWorkletNode(
        this.audioContext || new AudioContext(),
        workletUrl,
        options.name || 'audio-processor'
      );
      
      await workletNode.port.postMessage({
        type: 'init',
        config: this.DEFAULT_PROCESSOR_CONFIG
      });
      
      return workletNode;
    } catch (error) {
      console.error('Failed to create audio worklet:', error);
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop();
    
    // Disconnect all nodes
    if (this.nodes.input) {
      this.nodes.input.disconnect();
      this.nodes.input = null;
    }
    
    if (this.nodes.analyser) {
      this.nodes.analyser.disconnect();
      this.nodes.analyser = null;
    }
    
    if (this.nodes.gain) {
      this.nodes.gain.disconnect();
      this.nodes.gain = null;
    }
    
    if (this.nodes.compressor) {
      this.nodes.compressor.disconnect();
      this.nodes.compressor = null;
    }
    
    if (this.nodes.filter) {
      this.nodes.filter.disconnect();
      this.nodes.filter = null;
    }
    
    if (this.nodes.splitter) {
      this.nodes.splitter.disconnect();
      this.nodes.splitter = null;
    }
    
    if (this.nodes.merger) {
      this.nodes.merger.disconnect();
      this.nodes.merger = null;
    }
    
    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Create a global audio processor instance
 */
export const createAudioProcessor = (
  config: Partial<AudioProcessorConfig> = {}
): WebAudioProcessor => {
  return new WebAudioProcessor(config);
};

/**
 * Audio worklet processor code
 */
export const AUDIO_WORKLET_PROCESSOR = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }
  
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, number>) {
    const input = inputs[0];
    
    // Simple processing - pass through with gain
    if (parameters.gain !== undefined) {
      for (let i = 0; i < input.length; i++) {
        input[i] *= parameters.gain;
      }
    }
    
    // Copy to output
    outputs[0].set(input);
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;