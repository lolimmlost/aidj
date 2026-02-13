import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Settings, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { visualizers, getNextVisualizer, getPreviousVisualizer } from './visualizers';
import { COLOR_THEMES, DEFAULT_SETTINGS, type Visualizer, type ColorTheme, type VisualizerSettings, type VisualizerContext } from './types';
import { getQualityLevel, type QualityLevel } from './perf-utils';
import { useAudioStore } from '@/lib/stores/audio';
import { getLyrics, getCurrentLineIndex, type LyricsResponse } from '@/lib/services/lyrics';

// Throttle helper - returns value that only updates every N ms
function useThrottledValue<T>(value: T, ms: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdateRef = useRef(0);
  const pendingValueRef = useRef(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    pendingValueRef.current = value;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate >= ms) {
      // Enough time has passed, update immediately
      lastUpdateRef.current = now;
      setThrottledValue(value);
    } else if (!timeoutRef.current) {
      // Schedule an update for when the throttle period ends
      timeoutRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThrottledValue(pendingValueRef.current);
        timeoutRef.current = null;
      }, ms - timeSinceLastUpdate);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, ms]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return throttledValue;
}

interface VisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioElement: HTMLAudioElement | null;
}

export function VisualizerModal({ isOpen, onClose, audioElement }: VisualizerModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // Visualizer state
  const [currentVisualizer, setCurrentVisualizer] = useState<Visualizer>(visualizers[0]);
  const [settings, setSettings] = useState<VisualizerSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>(
    COLOR_THEMES.find((t) => t.name === DEFAULT_SETTINGS.colorTheme) || COLOR_THEMES[0]
  );

  // Audio analyzer hook
  const { audioData, connect, disconnect, isActive: _isActive } = useAudioAnalyzer({
    sensitivity: settings.sensitivity,
    smoothingTimeConstant: settings.smoothing,
  });

  // Lyrics state
  const { playlist, currentSongIndex, currentTime } = useAudioStore();
  const currentSong = playlist[currentSongIndex] || null;
  const [lyricsData, setLyricsData] = useState<LyricsResponse | null>(null);
  const lastSongIdRef = useRef<string | null>(null);

  // Throttle currentTime updates for lyrics (100ms is plenty for lyrics sync)
  const throttledTime = useThrottledValue(currentTime, 100);

  // Cache for resize check (avoid getBoundingClientRect every frame)
  const lastResizeCheckRef = useRef(0);
  const cachedDimensionsRef = useRef({ width: 0, height: 0 });

  // Reusable context object to avoid object creation every frame
  const vizCtxRef = useRef<VisualizerContext | null>(null);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!currentSong || !isOpen) return;

    // Don't refetch for same song
    if (lastSongIdRef.current === currentSong.id && lyricsData) return;
    lastSongIdRef.current = currentSong.id;

    const fetchLyrics = async () => {
      try {
        const result = await getLyrics(
          currentSong.artist || 'Unknown Artist',
          currentSong.name || currentSong.title || 'Unknown',
          {
            songId: currentSong.id,
            album: currentSong.album,
            duration: currentSong.duration,
          }
        );
        setLyricsData(result);
      } catch (err) {
        console.error('Error fetching lyrics for visualizer:', err);
        setLyricsData(null);
      }
    };

    fetchLyrics();
  }, [currentSong?.id, isOpen]);

  // Calculate lyric index once with throttled time (memoized)
  const lyricIndex = useMemo(() => {
    if (!settings.showLyrics || !lyricsData?.syncedLyrics) return -1;
    const adjustedTime = throttledTime + settings.lyricsOffset;
    return getCurrentLineIndex(lyricsData.syncedLyrics, adjustedTime);
  }, [settings.showLyrics, settings.lyricsOffset, lyricsData?.syncedLyrics, throttledTime]);

  // Get current lyric line with offset (uses cached index)
  const currentLyricLine = useMemo(() => {
    if (!lyricsData?.syncedLyrics || lyricIndex < 0 || lyricIndex >= lyricsData.syncedLyrics.length) {
      return null;
    }
    return lyricsData.syncedLyrics[lyricIndex].text;
  }, [lyricsData?.syncedLyrics, lyricIndex]);

  // Get next lyric line for preview (uses cached index)
  const nextLyricLine = useMemo(() => {
    if (!lyricsData?.syncedLyrics || lyricIndex < 0 || lyricIndex + 1 >= lyricsData.syncedLyrics.length) {
      return null;
    }
    return lyricsData.syncedLyrics[lyricIndex + 1].text;
  }, [lyricsData?.syncedLyrics, lyricIndex]);

  // Auto-rotate timer
  const autoRotateRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to audio element when modal opens or song changes
  useEffect(() => {
    if (isOpen && audioElement) {
      connect(audioElement);
      startTimeRef.current = performance.now();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isOpen, audioElement, connect, disconnect]);

  // Reconnect when song changes (audio src changes)
  useEffect(() => {
    if (isOpen && audioElement && currentSong?.id) {
      // Small delay to let audio element update its source
      const timer = setTimeout(() => {
        disconnect();
        connect(audioElement);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentSong?.id, isOpen, audioElement, connect, disconnect]);

  // Initialize visualizer
  useEffect(() => {
    if (currentVisualizer.init && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        currentVisualizer.init({
          canvas,
          ctx,
          width: canvas.width,
          height: canvas.height,
          centerX: canvas.width / 2,
          centerY: canvas.height / 2,
          audioData,
          colors: currentTheme,
          deltaTime: 0,
          time: 0,
          quality: qualityRef.current,
        });
      }
    }

    return () => {
      currentVisualizer.cleanup?.();
    };
  }, [currentVisualizer, currentTheme]);

  // Auto-rotate visualizers
  useEffect(() => {
    if (settings.autoRotate && isOpen) {
      autoRotateRef.current = setInterval(() => {
        setCurrentVisualizer((prev) => getNextVisualizer(prev.id));
      }, settings.autoRotateInterval * 1000);
    }

    return () => {
      if (autoRotateRef.current) {
        clearInterval(autoRotateRef.current);
        autoRotateRef.current = null;
      }
    };
  }, [settings.autoRotate, settings.autoRotateInterval, isOpen]);

  // Refs for animation state (avoid re-creating callback)
  const audioDataRef = useRef(audioData);
  const currentThemeRef = useRef(currentTheme);
  const currentVisualizerRef = useRef(currentVisualizer);
  const isOpenRef = useRef(isOpen);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const fpsLimitRef = useRef(settings.fpsLimit);
  const lastFrameTimeRef = useRef(0);
  const qualityRef = useRef<QualityLevel>(settings.quality === 'auto' ? getQualityLevel() : settings.quality);

  // Keep refs in sync
  useEffect(() => { audioDataRef.current = audioData; }, [audioData]);
  useEffect(() => { currentThemeRef.current = currentTheme; }, [currentTheme]);
  useEffect(() => { currentVisualizerRef.current = currentVisualizer; }, [currentVisualizer]);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  /* eslint-disable react-hooks/immutability */
  useEffect(() => { fpsLimitRef.current = settings.fpsLimit; }, [settings.fpsLimit]);
  useEffect(() => { qualityRef.current = settings.quality === 'auto' ? getQualityLevel() : settings.quality; }, [settings.quality]);
  /* eslint-enable react-hooks/immutability */

  // Animation loop - stable callback, no dependencies
  /* eslint-disable react-hooks/purity */
  const animate = useCallback(() => {
    if (!canvasRef.current || !isOpenRef.current) return;

    const canvas = canvasRef.current;
    const now = performance.now();

    // Frame rate limiting (skip frames if needed)
    const fpsLimit = fpsLimitRef.current;
    if (fpsLimit > 0) {
      const minFrameTime = 1000 / fpsLimit;
      const elapsed = now - lastFrameTimeRef.current;
      if (elapsed < minFrameTime) {
        // Schedule next frame and skip this one
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTimeRef.current = now;
    }

    // Get context once and cache it
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d', {
        alpha: false, // No transparency needed - faster
        desynchronized: true, // Reduce latency on supported browsers
      });
    }
    const ctx = ctxRef.current;
    if (!ctx) return;

    const deltaTime = (now - lastTimeRef.current) / 1000;
    const time = (now - startTimeRef.current) / 1000;
    lastTimeRef.current = now;

    // Resize canvas only every 200ms (not every frame)
    const timeSinceResize = now - lastResizeCheckRef.current;
    if (timeSinceResize > 200 || cachedDimensionsRef.current.width === 0) {
      lastResizeCheckRef.current = now;
      const rect = canvas.getBoundingClientRect();
      const targetWidth = Math.floor(rect.width);
      const targetHeight = Math.floor(rect.height);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        cachedDimensionsRef.current.width = targetWidth;
        cachedDimensionsRef.current.height = targetHeight;
      }
    }

    const width = cachedDimensionsRef.current.width || canvas.width;
    const height = cachedDimensionsRef.current.height || canvas.height;

    // Reuse or create visualizer context object
    if (!vizCtxRef.current) {
      vizCtxRef.current = {
        canvas,
        ctx,
        width,
        height,
        centerX: width / 2,
        centerY: height / 2,
        audioData: audioDataRef.current,
        colors: currentThemeRef.current,
        deltaTime,
        time,
        quality: qualityRef.current,
      };
    } else {
      // Update existing object (avoid creating new object every frame)
      const vizCtx = vizCtxRef.current;
      vizCtx.canvas = canvas;
      vizCtx.ctx = ctx;
      vizCtx.width = width;
      vizCtx.height = height;
      vizCtx.centerX = width / 2;
      vizCtx.centerY = height / 2;
      vizCtx.audioData = audioDataRef.current;
      vizCtx.colors = currentThemeRef.current;
      vizCtx.deltaTime = deltaTime;
      vizCtx.time = time;
      vizCtx.quality = qualityRef.current;
    }

    // Render current visualizer
    currentVisualizerRef.current.render(vizCtxRef.current);

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(animate);
  }, []); // Empty deps - uses refs
  /* eslint-enable react-hooks/purity */

  // Start/stop animation loop
  useEffect(() => {
    if (isOpen) {
      lastTimeRef.current = performance.now();
      ctxRef.current = null; // Reset cached context on open
      vizCtxRef.current = null; // Reset reusable context object
      cachedDimensionsRef.current = { width: 0, height: 0 }; // Force dimension recalc
      lastResizeCheckRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      ctxRef.current = null; // Clear cached context on close
      vizCtxRef.current = null;
    };
  }, [isOpen, animate]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case ']':
        case '.':
          e.preventDefault();
          setCurrentVisualizer((prev) => getNextVisualizer(prev.id));
          break;
        case '[':
        case ',':
          e.preventDefault();
          setCurrentVisualizer((prev) => getPreviousVisualizer(prev.id));
          break;
        case 's':
        case 'S':
          e.preventDefault();
          setShowSettings((prev) => !prev);
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          // eslint-disable-next-line react-hooks/immutability
          setSettings((prev) => ({ ...prev, autoRotate: !prev.autoRotate }));
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setSettings((prev) => ({ ...prev, showLyrics: !prev.showLyrics }));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle next/previous visualizer
  const handleNext = () => {
    currentVisualizer.cleanup?.();
    setCurrentVisualizer(getNextVisualizer(currentVisualizer.id));
  };

  const handlePrevious = () => {
    currentVisualizer.cleanup?.();
    setCurrentVisualizer(getPreviousVisualizer(currentVisualizer.id));
  };

  // Handle theme change
  const handleThemeChange = (theme: ColorTheme) => {
    setCurrentTheme(theme);
    setSettings((prev) => ({ ...prev, colorTheme: theme.name }));
  };

  // Toggle auto-rotate
  const toggleAutoRotate = () => {
    setSettings((prev) => ({ ...prev, autoRotate: !prev.autoRotate }));
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex flex-col" style={{ bottom: '80px' }}>
      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ backgroundColor: currentTheme.background }}
      />

      {/* Controls overlay */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center justify-between p-4">
          {/* Visualizer name */}
          <div className="flex items-center gap-4">
            <span className="text-white/80 text-sm font-medium bg-black/30 px-3 py-1.5 rounded-full backdrop-blur-sm">
              {currentVisualizer.name}
            </span>
            {settings.autoRotate && (
              <span className="text-white/60 text-xs bg-black/20 px-2 py-1 rounded-full">
                Auto-rotating
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Settings backdrop - click to close */}
        {showSettings && (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setShowSettings(false)}
          />
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="absolute top-16 left-4 right-4 md:left-auto md:right-4 md:w-72 max-h-[70vh] overflow-y-auto bg-black/90 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-4 z-20">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium">Settings</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(false)}
                className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Color themes */}
            <div>
              <label className="text-white/60 text-sm block mb-2">Color Theme</label>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_THEMES.map((theme) => (
                  <button
                    key={theme.name}
                    onClick={() => handleThemeChange(theme)}
                    className={cn(
                      'w-full aspect-square rounded-lg border-2 transition-all',
                      currentTheme.name === theme.name
                        ? 'border-white scale-110'
                        : 'border-transparent hover:border-white/50'
                    )}
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary}, ${theme.accent})`,
                    }}
                    title={theme.name}
                  />
                ))}
              </div>
            </div>

            {/* Sensitivity */}
            <div>
              <label className="text-white/60 text-sm block mb-2">
                Sensitivity: {settings.sensitivity.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.sensitivity}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, sensitivity: parseFloat(e.target.value) }))
                }
                className="w-full accent-white"
              />
            </div>

            {/* Smoothing */}
            <div>
              <label className="text-white/60 text-sm block mb-2">
                Smoothing: {settings.smoothing.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="0.95"
                step="0.05"
                value={settings.smoothing}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, smoothing: parseFloat(e.target.value) }))
                }
                className="w-full accent-white"
              />
            </div>

            {/* FPS Limit */}
            <div>
              <label className="text-white/60 text-sm block mb-2">
                Frame Rate: {settings.fpsLimit === 0 ? 'Unlimited' : `${settings.fpsLimit} FPS`}
              </label>
              <div className="flex gap-2">
                {([0, 30, 60] as const).map((fps) => (
                  <button
                    key={fps}
                    onClick={() => setSettings((prev) => ({ ...prev, fpsLimit: fps }))}
                    className={cn(
                      'flex-1 py-1.5 text-xs rounded transition-colors',
                      settings.fpsLimit === fps
                        ? 'bg-white text-black font-medium'
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    )}
                  >
                    {fps === 0 ? 'Max' : fps}
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-1">Lower FPS saves battery</p>
            </div>

            {/* Quality */}
            <div>
              <label className="text-white/60 text-sm block mb-2">
                Quality: {settings.quality === 'auto' ? 'Auto' : settings.quality.charAt(0).toUpperCase() + settings.quality.slice(1)}
              </label>
              <div className="flex gap-2">
                {(['auto', 'high', 'medium', 'low'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setSettings((prev) => ({ ...prev, quality: q }))}
                    className={cn(
                      'flex-1 py-1.5 text-xs rounded transition-colors capitalize',
                      settings.quality === q
                        ? 'bg-white text-black font-medium'
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    )}
                  >
                    {q === 'auto' ? 'Auto' : q}
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-1">Reduces particles and effects on lower settings</p>
            </div>

            {/* Auto-rotate */}
            <div className="flex items-center justify-between">
              <label className="text-white/60 text-sm">Auto-rotate</label>
              <button
                onClick={toggleAutoRotate}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors',
                  settings.autoRotate ? 'bg-primary' : 'bg-white/20'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform',
                    settings.autoRotate ? 'translate-x-6' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            {settings.autoRotate && (
              <div>
                <label className="text-white/60 text-sm block mb-2">
                  Interval: {settings.autoRotateInterval}s
                </label>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="10"
                  value={settings.autoRotateInterval}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      autoRotateInterval: parseInt(e.target.value),
                    }))
                  }
                  className="w-full accent-white"
                />
              </div>
            )}

            {/* Lyrics toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <label className="text-white/60 text-sm flex items-center gap-2">
                <Type className="h-4 w-4" />
                Show Lyrics
              </label>
              <button
                onClick={() => setSettings((prev) => ({ ...prev, showLyrics: !prev.showLyrics }))}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors',
                  settings.showLyrics ? 'bg-primary' : 'bg-white/20'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform',
                    settings.showLyrics ? 'translate-x-6' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            {settings.showLyrics && (
              <div>
                <label className="text-white/60 text-sm block mb-2">
                  Lyrics Offset: {settings.lyricsOffset > 0 ? '+' : ''}{settings.lyricsOffset.toFixed(1)}s
                </label>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.1"
                  value={settings.lyricsOffset}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lyricsOffset: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-white"
                />
                <div className="flex justify-between text-xs text-white/40 mt-1">
                  <span>Earlier</span>
                  <button
                    onClick={() => setSettings((prev) => ({ ...prev, lyricsOffset: 0 }))}
                    className="hover:text-white/60"
                  >
                    Reset
                  </button>
                  <span>Later</span>
                </div>
              </div>
            )}

            {/* Lyrics status */}
            {settings.showLyrics && (
              <div className="text-xs text-white/40">
                {!lyricsData ? 'Loading lyrics...' :
                  lyricsData.syncedLyrics ? `✓ Synced lyrics (${lyricsData.syncedLyrics.length} lines)` :
                    lyricsData.lyrics ? 'Plain lyrics (no sync)' :
                      'No lyrics found'}
              </div>
            )}
          </div>
        )}

        {/* Lyrics overlay */}
        {settings.showLyrics && currentLyricLine && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 pointer-events-none">
            {/* Current lyric line */}
            <div
              className="text-center transition-all duration-300"
              style={{
                textShadow: `0 0 20px ${currentTheme.background}, 0 0 40px ${currentTheme.background}, 0 2px 4px rgba(0,0,0,0.8)`,
              }}
            >
              <p
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight"
                style={{
                  color: currentTheme.primary,
                }}
              >
                {currentLyricLine}
              </p>
            </div>

            {/* Next lyric preview */}
            {nextLyricLine && (
              <p
                className="text-lg md:text-xl text-white/40 mt-4 text-center max-w-3xl"
                style={{
                  textShadow: `0 0 10px ${currentTheme.background}`,
                }}
              >
                {nextLyricLine}
              </p>
            )}
          </div>
        )}

        {/* Spacer when no lyrics */}
        {(!settings.showLyrics || !currentLyricLine) && <div className="flex-1" />}

        {/* Bottom navigation */}
        <div className="flex items-center justify-center gap-4 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevious}
            className="text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          {/* Visualizer dots */}
          <div className="flex items-center gap-1.5 px-4">
            {visualizers.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  currentVisualizer.cleanup?.();
                  setCurrentVisualizer(v);
                }}
                className={cn(
                  'h-2 rounded-full transition-all',
                  v.id === currentVisualizer.id
                    ? 'bg-white w-4'
                    : 'bg-white/40 hover:bg-white/60 w-2'
                )}
                title={v.name}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>

        {/* Keyboard hints - hidden on mobile */}
        <div className="hidden md:block absolute bottom-20 left-4 text-white/40 text-xs space-y-1">
          <p>[ ] or , . Switch visualizer</p>
          <p>L Toggle lyrics</p>
          <p>S Settings</p>
          <p>R Auto-rotate</p>
          <p>ESC Close</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
