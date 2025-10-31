// Web Audio API Mocks for DJ Testing
// Provides mock implementations of Web Audio API interfaces for testing audio components

export class MockAudioContext {
  destination: MockAudioNode;
  currentTime: number = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  sampleRate: number = 44100;
  
  constructor() {
    this.destination = new MockAudioNode();
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): MockAudioBuffer {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource(): MockAudioBufferSourceNode {
    return new MockAudioBufferSourceNode(this);
  }

  createGainNode(): MockGainNode {
    return new MockGainNode(this);
  }

  createAnalyser(): MockAnalyserNode {
    return new MockAnalyserNode(this);
  }

  createBiquadFilter(): MockBiquadFilterNode {
    return new MockBiquadFilterNode(this);
  }

  createOscillator(): MockOscillatorNode {
    return new MockOscillatorNode(this);
  }

  createDelay(): MockDelayNode {
    return new MockDelayNode(this);
  }

  createPanner(): MockPannerNode {
    return new MockPannerNode(this);
  }

  createStereoPanner(): MockStereoPannerNode {
    return new MockStereoPannerNode(this);
  }

  createChannelMerger(): MockAudioNode {
    return new MockAudioNode();
  }

  createChannelSplitter(): MockAudioNode {
    return new MockAudioNode();
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  decodeAudioData(): Promise<MockAudioBuffer> {
    return Promise.resolve(new MockAudioBuffer(2, 44100, this.sampleRate));
  }
}

export class MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private _channelData: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._channelData = [];
    
    for (let i = 0; i < numberOfChannels; i++) {
      this._channelData.push(new Float32Array(length));
    }
  }

  getChannelData(channel: number): Float32Array {
    return this._channelData[channel] || new Float32Array(this.length);
  }

  copyToChannel(destination: Float32Array, channelNumber: number, startInChannel?: number): void {
    const source = this._channelData[channelNumber] || new Float32Array(this.length);
    const start = startInChannel || 0;
    for (let i = 0; i < Math.min(destination.length, source.length - start); i++) {
      source[i + start] = destination[i];
    }
  }

  copyFromChannel(source: Float32Array, channelNumber: number, startInChannel?: number): void {
    const destination = this._channelData[channelNumber] || new Float32Array(this.length);
    const start = startInChannel || 0;
    for (let i = 0; i < Math.min(source.length, destination.length - start); i++) {
      destination[i + start] = source[i];
    }
  }
}

export class MockAudioNode {
  context: MockAudioContext;
  numberOfInputs: number = 1;
  numberOfOutputs: number = 1;
  channelCount: number = 2;
  channelCountMode: 'max' | 'clamped-max' | 'explicit' = 'max';
  channelInterpretation: 'speakers' | 'discrete' = 'speakers';
  
  constructor(context?: MockAudioContext) {
    this.context = context || new MockAudioContext();
  }

  connect(): void {
    // Mock connection
  }

  disconnect(): void {
    // Mock disconnection
  }
}

export class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: MockAudioBuffer | null = null;
  loop: boolean = false;
  loopStart: number = 0;
  loopEnd: number = 0;
  playbackRate: MockAudioParam = new MockAudioParam(1.0);
  onended: ((event: Event) => void) | null = null;
  private _started: boolean = false;
  private _stopped: boolean = false;

  constructor(context: MockAudioContext) {
    super(context);
  }

  start(): void {
    this._started = true;
    // Simulate playback ending
    setTimeout(() => {
      if (this.onended && !this._stopped) {
        this.onended(new Event('ended'));
      }
    }, 100);
  }

  stop(): void {
    this._stopped = true;
  }
}

export class MockAudioParam {
  automationRate: 'a-rate' | 'k-rate' = 'a-rate';
  defaultValue: number;
  maxValue: number;
  minValue: number;
  value: number;
  private _events: Array<{
    type: string;
    value: number;
    startTime?: number;
    endTime?: number;
  }> = [];

  constructor(defaultValue: number, minValue = -3.4028235e38, maxValue = 3.4028235e38) {
    this.defaultValue = defaultValue;
    this.minValue = minValue;
    this.maxValue = maxValue;
    this.value = defaultValue;
  }

  setValueAtTime(value: number, startTime: number): void {
    this.value = value;
    this._events.push({ type: 'setValueAtTime', value, startTime });
  }

  linearRampToValueAtTime(value: number, endTime: number): void {
    this.value = value;
    this._events.push({ type: 'linearRampToValueAtTime', value, endTime });
  }

  exponentialRampToValueAtTime(value: number, endTime: number): void {
    this.value = value;
    this._events.push({ type: 'exponentialRampToValueAtTime', value, endTime });
  }

  cancelScheduledValues(startTime: number): void {
    this._events = this._events.filter(event => event.startTime !== undefined && event.startTime < startTime);
  }
}

export class MockGainNode extends MockAudioNode {
  gain: MockAudioParam = new MockAudioParam(1.0);

  constructor(context: MockAudioContext) {
    super(context);
  }
}

export class MockAnalyserNode extends MockAudioNode {
  fftSize: number = 2048;
  frequencyBinCount: number = 1024;
  minDecibels: number = -100;
  maxDecibels: number = -30;
  smoothingTimeConstant: number = 0.8;
  private _frequencyData: Uint8Array;
  private _timeDomainData: Uint8Array;

  constructor(context: MockAudioContext) {
    super(context);
    this._frequencyData = new Uint8Array(this.frequencyBinCount);
    this._timeDomainData = new Uint8Array(this.fftSize);
    
    // Generate mock frequency data
    for (let i = 0; i < this.frequencyBinCount; i++) {
      this._frequencyData[i] = Math.floor(Math.random() * 256 * (1 - i / this.frequencyBinCount));
    }
    
    // Generate mock time domain data
    for (let i = 0; i < this.fftSize; i++) {
      this._timeDomainData[i] = Math.floor(Math.random() * 256);
    }
  }

  getFloatFrequencyData(array: Float32Array): void {
    for (let i = 0; i < Math.min(array.length, this.frequencyBinCount); i++) {
      array[i] = this._frequencyData[i] - 128;
    }
  }

  getByteFrequencyData(array: Uint8Array): void {
    for (let i = 0; i < Math.min(array.length, this.frequencyBinCount); i++) {
      array[i] = this._frequencyData[i];
    }
  }

  getFloatTimeDomainData(array: Float32Array): void {
    for (let i = 0; i < Math.min(array.length, this.fftSize); i++) {
      array[i] = (this._timeDomainData[i] - 128) / 128;
    }
  }

  getByteTimeDomainData(array: Uint8Array): void {
    for (let i = 0; i < Math.min(array.length, this.fftSize); i++) {
      array[i] = this._timeDomainData[i];
    }
  }
}

export class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency: MockAudioParam = new MockAudioParam(350, 10, 20000);
  detune: MockAudioParam = new MockAudioParam(0);
  Q: MockAudioParam = new MockAudioParam(1, 0.0001, 1000);
  gain: MockAudioParam = new MockAudioParam(0);

  constructor(context: MockAudioContext) {
    super(context);
  }

  getFrequencyResponse(
    frequencyHz: Float32Array,
    magResponse: Float32Array,
    phaseResponse: Float32Array
  ): void {
    for (let i = 0; i < frequencyHz.length; i++) {
      magResponse[i] = 1.0;
      phaseResponse[i] = 0.0;
    }
  }
}

export class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  frequency: MockAudioParam = new MockAudioParam(440, 0, 20000);
  detune: MockAudioParam = new MockAudioParam(0);
  onended: ((event: Event) => void) | null = null;
  private _started: boolean = false;
  private _stopped: boolean = false;

  constructor(context: MockAudioContext) {
    super(context);
  }

  start(): void {
    this._started = true;
    setTimeout(() => {
      if (this.onended && !this._stopped) {
        this.onended(new Event('ended'));
      }
    }, 100);
  }

  stop(): void {
    this._stopped = true;
  }
}

export class MockDelayNode extends MockAudioNode {
  delayTime: MockAudioParam = new MockAudioParam(0, 0, 1);

  constructor(context: MockAudioContext) {
    super(context);
  }
}

export class MockPannerNode extends MockAudioNode {
  panningModel: PanningModelType = 'equalpower';
  distanceModel: DistanceModelType = 'inverse';
  refDistance: number = 1;
  maxDistance: number = 10000;
  rolloffFactor: number = 1;
  coneInnerAngle: number = 360;
  coneOuterAngle: number = 360;
  coneOuterGain: number = 0;
  positionX: MockAudioParam = new MockAudioParam(0);
  positionY: MockAudioParam = new MockAudioParam(0);
  positionZ: MockAudioParam = new MockAudioParam(0);
  orientationX: MockAudioParam = new MockAudioParam(1);
  orientationY: MockAudioParam = new MockAudioParam(0);
  orientationZ: MockAudioParam = new MockAudioParam(0);
}

export class MockStereoPannerNode extends MockAudioNode {
  pan: MockAudioParam = new MockAudioParam(0, -1, 1);

  constructor(context: MockAudioContext) {
    super(context);
  }
}

// Type definitions for the mock classes
export type BiquadFilterType = 
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass';

export type OscillatorType = 
  | 'sine'
  | 'square'
  | 'sawtooth'
  | 'triangle'
  | 'custom';

export type PanningModelType = 'equalpower' | 'HRTF';
export type DistanceModelType = 'linear' | 'inverse' | 'exponential';

// Global mock setup
export function setupWebAudioMocks() {
  // Type assertion for global object
  const globalObj = global as Record<string, unknown>;
  globalObj.AudioContext = MockAudioContext;
  globalObj.webkitAudioContext = MockAudioContext;
  globalObj.OfflineAudioContext = MockAudioContext;
}

// Helper function to create mock audio data for testing
export function createMockAudioData(length: number = 256): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin(i * 0.1) * 128 + Math.random() * 20;
  }
  return data;
}

// Helper function to create mock frequency data
export function createMockFrequencyData(bins: number = 128): Uint8Array {
  const data = new Uint8Array(bins);
  for (let i = 0; i < bins; i++) {
    data[i] = Math.floor(Math.random() * 255 * (1 - i / bins));
  }
  return data;
}