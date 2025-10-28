// DJ Mixer Interface Component
// Provides professional DJ controls and visualization

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Crosshair,
  Settings,
  Mic
} from 'lucide-react';

// DJ mixer state
interface DJMixerState {
  // Deck controls
  deckA: {
    playing: boolean;
    volume: number;
    pitch: number;
    tempo: number;
    key: string;
    loaded: boolean;
    position: number;
    duration: number;
  };
  deckB: {
    playing: boolean;
    volume: number;
    pitch: number;
    tempo: number;
    key: string;
    loaded: boolean;
    position: number;
    duration: number;
  };
  
  // Mixer controls
  crossfader: number;
  masterVolume: number;
  cueVolume: number;
  boothVolume: number;
  
  // EQ controls
  deckAEQ: { low: number; mid: number; high: number };
  deckBEQ: { low: number; mid: number; high: number };
  
  // Effects
  deckAEffects: boolean[];
  deckBEffects: boolean[];
  
  // Monitoring
  headphoneMix: number;
  cueMaster: boolean;
  splitCue: boolean;
  
  // Auto-mixing
  autoMixEnabled: boolean;
  autoMixMode: 'harmonic' | 'energy' | 'bpm' | 'balanced';
  transitionType: 'crossfade' | 'cut' | 'beatmatch' | 'harmonic';
  transitionDuration: number;
  
  // Visualization
  waveformEnabled: boolean;
  spectrumEnabled: boolean;
  phaseEnabled: boolean;
}

// Visualizer component for waveforms
const WaveformVisualizer: React.FC<{
  audioData?: Float32Array;
  color?: string;
  height?: number;
}> = ({ audioData, color = '#3b82f6', height = 100 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !audioData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const sliceWidth = canvas.width / audioData.length;
    let x = 0;
    
    for (let i = 0; i < audioData.length; i++) {
      const v = audioData[i] / 128.0;
      const y = (v * canvas.height) / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }, [audioData, color]);
  
  return (
    <canvas 
      ref={canvasRef}
      width={400}
      height={height}
      className="w-full h-full rounded bg-black/20"
    />
  );
};

// Spectrum analyzer component
const SpectrumAnalyzer: React.FC<{
  frequencyData?: Uint8Array;
  bars?: number;
}> = ({ frequencyData, bars = 32 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !frequencyData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate bar width
    const barWidth = canvas.width / bars;
    const barSpacing = 2;
    
    // Draw frequency bars
    for (let i = 0; i < bars; i++) {
      const dataIndex = Math.floor(i * frequencyData.length / bars);
      const barHeight = (frequencyData[dataIndex] / 255) * canvas.height;
      
      // Color gradient based on frequency
      const hue = (i / bars) * 120; // 0-120 (red to green)
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
      
      ctx.fillRect(
        i * barWidth + barSpacing,
        canvas.height - barHeight,
        barWidth - barSpacing * 2,
        barHeight
      );
    }
  }, [frequencyData, bars]);
  
  return (
    <canvas 
      ref={canvasRef}
      width={400}
      height={100}
      className="w-full h-full rounded bg-black/20"
    />
  );
};

// Phase meter component
const PhaseMeter: React.FC<{
  phase: number;
}> = ({ phase }) => {
  const getPhaseColor = () => {
    if (Math.abs(phase) < 0.1) return 'bg-green-500';
    if (Math.abs(phase) < 0.3) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="flex items-center space-x-2">
      <div className="w-2 h-8 bg-gray-700 rounded-full relative overflow-hidden">
        <div 
          className={`absolute w-full transition-colors ${getPhaseColor()}`}
          style={{
            height: `${Math.abs(phase) * 100}%`,
            bottom: '0',
            transform: phase < 0 ? 'scaleY(-1)' : 'scaleY(1)',
            transformOrigin: phase < 0 ? 'top' : 'bottom'
          }}
        />
      </div>
      <span className="text-xs text-gray-400">
        {phase > 0 ? '+' : ''}{phase.toFixed(2)}
      </span>
    </div>
  );
};

// Deck component
const Deck: React.FC<{
  deck: 'A' | 'B';
  state: DJMixerState['deckA' | 'deckB'];
  eqState: DJMixerState['deckAEQ' | 'deckBEQ'];
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onVolumeChange: (volume: number) => void;
  onPitchChange: (pitch: number) => void;
  onEQChange: (band: 'low' | 'mid' | 'high', value: number) => void;
  waveform?: Float32Array;
}> = ({
  deck,
  state,
  eqState,
  onPlay,
  onPause,
  onStop,
  onVolumeChange,
  onPitchChange,
  onEQChange,
  waveform
}) => {
  return (
    <Card className="bg-gray-900 text-white border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Deck {deck}</span>
          <div className="flex items-center space-x-2">
            <Badge variant={state.playing ? "default" : "secondary"}>
              {state.playing ? "PLAYING" : "STOPPED"}
            </Badge>
            {state.loaded && (
              <Badge variant="outline">
                {state.key} • {state.tempo} BPM
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transport controls */}
        <div className="flex items-center justify-center space-x-2">
          <Button variant="outline" size="sm" onClick={onStop}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button 
            variant={state.playing ? "default" : "outline"}
            onClick={state.playing ? onPause : onPlay}
          >
            {state.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm">
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Waveform display */}
        <div className="h-24 bg-black/30 rounded">
          {waveform ? (
            <WaveformVisualizer 
              audioData={waveform} 
              color={deck === 'A' ? '#3b82f6' : '#ef4444'}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              No audio loaded
            </div>
          )}
        </div>
        
        {/* Progress bar */}
        <div className="space-y-1">
          <Progress 
            value={(state.position / state.duration) * 100} 
            className="h-2"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>{formatTime(state.position)}</span>
            <span>{formatTime(state.duration)}</span>
          </div>
        </div>
        
        {/* Volume control */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Volume2 className="h-4 w-4" />
            <Slider
              value={[state.volume]}
              onValueChange={([value]) => onVolumeChange(value)}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs w-8">{state.volume}%</span>
          </div>
        </div>
        
        {/* Pitch control */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Crosshair className="h-4 w-4" />
            <Slider
              value={[state.pitch]}
              onValueChange={([value]) => onPitchChange(value)}
              min={-8}
              max={8}
              step={0.1}
              className="flex-1"
            />
            <span className="text-xs w-12">{state.pitch > 0 ? '+' : ''}{state.pitch.toFixed(1)}%</span>
          </div>
        </div>
        
        {/* 3-band EQ */}
        <div className="space-y-3">
          <div className="text-sm font-medium">3-Band EQ</div>
          {(['low', 'mid', 'high'] as const).map((band) => (
            <div key={band} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase">{band}</span>
                <span>+{band === 'low' ? '12' : band === 'mid' ? '6' : '12'} dB</span>
              </div>
              <Slider
                value={[eqState[band]]}
                onValueChange={([value]) => onEQChange(band, value)}
                min={-12}
                max={12}
                step={0.5}
                className="h-2"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// Time formatting helper function
const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Main DJ Mixer Interface
export const DJMixerInterface: React.FC = () => {
  const [state, setState] = useState<DJMixerState>({
    // Deck A
    deckA: {
      playing: false,
      volume: 75,
      pitch: 0,
      tempo: 120,
      key: 'C',
      loaded: false,
      position: 0,
      duration: 240
    },
    // Deck B
    deckB: {
      playing: false,
      volume: 75,
      pitch: 0,
      tempo: 128,
      key: 'G',
      loaded: false,
      position: 0,
      duration: 180
    },
    // Mixer
    crossfader: 50,
    masterVolume: 80,
    cueVolume: 50,
    boothVolume: 50,
    // EQ
    deckAEQ: { low: 0, mid: 0, high: 0 },
    deckBEQ: { low: 0, mid: 0, high: 0 },
    // Effects
    deckAEffects: [false, false, false],
    deckBEffects: [false, false, false],
    // Monitoring
    headphoneMix: 50,
    cueMaster: false,
    splitCue: false,
    // Auto-mixing
    autoMixEnabled: false,
    autoMixMode: 'balanced',
    transitionType: 'crossfade',
    transitionDuration: 4000,
    // Visualization
    waveformEnabled: true,
    spectrumEnabled: true,
    phaseEnabled: true
  });

  // Mock audio data for visualization
  const [waveformData, setWaveformData] = useState<Float32Array>();
  const [frequencyData, setFrequencyData] = useState<Uint8Array>();
  const [phase, setPhase] = useState(0);

  // Simulate audio data updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Generate mock waveform data
      const waveform = new Float32Array(256);
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin(i * 0.1) * 128 + Math.random() * 20;
      }
      setWaveformData(waveform);

      // Generate mock frequency data
      const frequency = new Uint8Array(128);
      for (let i = 0; i < frequency.length; i++) {
        frequency[i] = Math.random() * 255 * (1 - i / frequency.length);
      }
      setFrequencyData(frequency);

      // Generate mock phase data
      setPhase(Math.sin(Date.now() * 0.001) * 0.5);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Update state helpers
  const updateState = useCallback((updates: Partial<DJMixerState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const updateDeck = useCallback((deck: 'A' | 'B', updates: Partial<DJMixerState['deckA']>) => {
    setState(prev => ({
      ...prev,
      [`deck${deck}`]: { ...prev[`deck${deck}`], ...updates }
    }));
  }, []);

  const updateEQ = useCallback((deck: 'A' | 'B', band: 'low' | 'mid' | 'high', value: number) => {
    setState(prev => ({
      ...prev,
      [`deck${deck}EQ`]: { ...prev[`deck${deck}EQ`], [band]: value }
    }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">DJ Mixer</h1>
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="outline" size="sm">
              <Mic className="h-4 w-4 mr-2" />
              Voice
            </Button>
          </div>
        </div>

        <Tabs defaultValue="mixer" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="mixer">Mixer</TabsTrigger>
            <TabsTrigger value="effects">Effects</TabsTrigger>
            <TabsTrigger value="automix">Auto-Mix</TabsTrigger>
            <TabsTrigger value="visualizer">Visualizer</TabsTrigger>
          </TabsList>

          {/* Mixer Tab */}
          <TabsContent value="mixer" className="space-y-6">
            {/* Decks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Deck
                deck="A"
                state={state.deckA}
                eqState={state.deckAEQ}
                onPlay={() => updateDeck('A', { playing: true })}
                onPause={() => updateDeck('A', { playing: false })}
                onStop={() => updateDeck('A', { playing: false, position: 0 })}
                onVolumeChange={(volume) => updateDeck('A', { volume })}
                onPitchChange={(pitch) => updateDeck('A', { pitch })}
                onEQChange={(band, value) => updateEQ('A', band, value)}
                waveform={waveformData}
              />
              <Deck
                deck="B"
                state={state.deckB}
                eqState={state.deckBEQ}
                onPlay={() => updateDeck('B', { playing: true })}
                onPause={() => updateDeck('B', { playing: false })}
                onStop={() => updateDeck('B', { playing: false, position: 0 })}
                onVolumeChange={(volume) => updateDeck('B', { volume })}
                onPitchChange={(pitch) => updateDeck('B', { pitch })}
                onEQChange={(band, value) => updateEQ('B', band, value)}
                waveform={waveformData}
              />
            </div>

            {/* Mixer Section */}
            <Card className="bg-gray-900 text-white border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg">Mixer Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Crossfader */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>A</span>
                    <span>Crossfader</span>
                    <span>B</span>
                  </div>
                  <Slider
                    value={[state.crossfader]}
                    onValueChange={([value]) => updateState({ crossfader: value })}
                    min={0}
                    max={100}
                    step={1}
                    className="h-3"
                  />
                </div>

                {/* Master Volume */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <Volume2 className="h-4 w-4" />
                    <span>Master Volume</span>
                    <span>{state.masterVolume}%</span>
                  </div>
                  <Slider
                    value={[state.masterVolume]}
                    onValueChange={([value]) => updateState({ masterVolume: value })}
                    min={0}
                    max={100}
                    step={1}
                    className="h-2"
                  />
                </div>

                {/* Monitoring Controls */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm">Cue Mix</label>
                    <Slider
                      value={[state.headphoneMix]}
                      onValueChange={([value]) => updateState({ headphoneMix: value })}
                      min={0}
                      max={100}
                      step={1}
                      className="h-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm">Cue/Master</label>
                    <Switch
                      checked={state.cueMaster}
                      onCheckedChange={(checked) => updateState({ cueMaster: checked })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm">Split Cue</label>
                    <Switch
                      checked={state.splitCue}
                      onCheckedChange={(checked) => updateState({ splitCue: checked })}
                    />
                  </div>
                </div>

                {/* Phase Meter */}
                {state.phaseEnabled && (
                  <div className="space-y-2">
                    <div className="text-sm">Phase Correlation</div>
                    <PhaseMeter phase={phase} />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Effects Tab */}
          <TabsContent value="effects" className="space-y-6">
            <Card className="bg-gray-900 text-white border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg">Deck Effects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Deck A Effects */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Deck A</h3>
                    <div className="space-y-2">
                      {['Filter', 'Reverb', 'Delay'].map((effect, index) => (
                        <div key={effect} className="flex items-center justify-between">
                          <span>{effect}</span>
                          <Switch
                            checked={state.deckAEffects[index]}
                            onCheckedChange={(checked) => {
                              const newEffects = [...state.deckAEffects];
                              newEffects[index] = checked;
                              updateState({ deckAEffects: newEffects });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deck B Effects */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Deck B</h3>
                    <div className="space-y-2">
                      {['Filter', 'Reverb', 'Delay'].map((effect, index) => (
                        <div key={effect} className="flex items-center justify-between">
                          <span>{effect}</span>
                          <Switch
                            checked={state.deckBEffects[index]}
                            onCheckedChange={(checked) => {
                              const newEffects = [...state.deckBEffects];
                              newEffects[index] = checked;
                              updateState({ deckBEffects: newEffects });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Auto-Mix Tab */}
          <TabsContent value="automix" className="space-y-6">
            <Card className="bg-gray-900 text-white border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg">Auto-Mixing Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Enable Auto-Mix */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">Enable Auto-Mixing</h3>
                    <p className="text-sm text-gray-400">
                      Automatically select and mix compatible songs
                    </p>
                  </div>
                  <Switch
                    checked={state.autoMixEnabled}
                    onCheckedChange={(checked) => updateState({ autoMixEnabled: checked })}
                  />
                </div>

                {/* Auto-Mix Mode */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mixing Strategy</label>
                  <Select
                    value={state.autoMixMode}
                    onValueChange={(value: DJMixerState['autoMixMode']) => 
                      updateState({ autoMixMode: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="harmonic">Harmonic Mixing</SelectItem>
                      <SelectItem value="energy">Energy Flow</SelectItem>
                      <SelectItem value="bpm">BPM Matching</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transition Type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Transition Type</label>
                  <Select
                    value={state.transitionType}
                    onValueChange={(value: DJMixerState['transitionType']) => 
                      updateState({ transitionType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crossfade">Crossfade</SelectItem>
                      <SelectItem value="cut">Cut</SelectItem>
                      <SelectItem value="beatmatch">Beatmatch</SelectItem>
                      <SelectItem value="harmonic">Harmonic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transition Duration */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Transition Duration: {state.transitionDuration / 1000}s
                  </label>
                  <Slider
                    value={[state.transitionDuration]}
                    onValueChange={([value]) => updateState({ transitionDuration: value })}
                    min={1000}
                    max={10000}
                    step={500}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Visualizer Tab */}
          <TabsContent value="visualizer" className="space-y-6">
            <Card className="bg-gray-900 text-white border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg">Audio Visualization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Visualization Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between">
                    <span>Waveform</span>
                    <Switch
                      checked={state.waveformEnabled}
                      onCheckedChange={(checked) => updateState({ waveformEnabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Spectrum</span>
                    <Switch
                      checked={state.spectrumEnabled}
                      onCheckedChange={(checked) => updateState({ spectrumEnabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Phase Meter</span>
                    <Switch
                      checked={state.phaseEnabled}
                      onCheckedChange={(checked) => updateState({ phaseEnabled: checked })}
                    />
                  </div>
                </div>

                {/* Visualizations */}
                {state.waveformEnabled && (
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium">Waveform</h3>
                    <div className="h-32 bg-black/30 rounded">
                      {waveformData && (
                        <WaveformVisualizer audioData={waveformData} />
                      )}
                    </div>
                  </div>
                )}

                {state.spectrumEnabled && (
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium">Frequency Spectrum</h3>
                    <div className="h-32 bg-black/30 rounded">
                      {frequencyData && (
                        <SpectrumAnalyzer frequencyData={frequencyData} />
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DJMixerInterface;