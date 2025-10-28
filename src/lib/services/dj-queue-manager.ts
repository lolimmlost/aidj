// DJ-Style Queue Management Service
// Provides advanced queue management with auto-mixing capabilities

import type { Song } from '@/components/ui/audio-player';
import type { AudioAnalysis } from './audio-analysis';
import type { TransitionParameters, TransitionType } from './transition-effects';
import type { HarmonicMode } from './harmonic-mixer';
import type { EnergyPattern } from './energy-flow-analyzer';
import { ServiceError } from '../utils';
import { analyzeAudioFeatures } from './audio-analysis';
import { analyzeTransition } from './transition-effects';
import { getHarmonicMixingRecommendations } from './harmonic-mixer';

// Queue entry with DJ metadata
export interface DJQueueEntry {
  id: string;
  song: Song;
  analysis?: AudioAnalysis;
  position: number;
  addedAt: Date;
  addedBy: 'user' | 'auto' | 'recommendation';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  transition?: TransitionParameters;
  harmonicMode?: HarmonicMode;
  energyPattern?: EnergyPattern;
  autoMixEnabled: boolean;
  tags: string[];
  notes?: string;
}

// Queue configuration
export interface DJQueueConfig {
  maxQueueSize: number;
  autoMixEnabled: boolean;
  smartTransitions: boolean;
  harmonicMixing: boolean;
  energyMatching: boolean;
  bpmMatching: boolean;
  genreFiltering: boolean;
  duplicatePrevention: boolean;
  autoRefill: boolean;
  refillCount: number;
  transitionDuration: number;
  crossfadeType: 'linear' | 'equal_power' | 'custom';
  energyProfile: 'rising' | 'falling' | 'wave' | 'stable';
  harmonicProgression: HarmonicMode[];
  allowedGenres: string[];
  blockedGenres: string[];
  blockedArtists: string[];
  maxSongDuration: number; // in seconds
  minSongDuration: number; // in seconds
}

// Queue statistics
export interface DJQueueStats {
  totalSongs: number;
  autoMixedSongs: number;
  userAddedSongs: number;
  averageEnergy: number;
  averageBPM: number;
  keyDistribution: Record<string, number>;
  genreDistribution: Record<string, number>;
  transitionCount: number;
  harmonicTransitions: number;
  energyTransitions: number;
  queueAge: number; // Average age of queue entries in minutes
}

// Auto-mixing strategy
export type AutoMixStrategy = 
  | 'harmonic'           // Prioritize harmonic compatibility
  | 'energy'             // Prioritize energy flow
  | 'bpm'                // Prioritize BPM compatibility
  | 'genre'              // Prioritize genre consistency
  | 'balanced'           // Balance all factors
  | 'crowd_pleaser'     // Prioritize popular/danceable tracks
  | 'experimental'       // Try unusual combinations
  | 'classic_dj'        // Traditional DJ approach
  | 'radio_friendly'     // Safe, mainstream choices
  | 'underground'        // Niche/alternative selections;

// Auto-mixing options
export interface AutoMixOptions {
  strategy: AutoMixStrategy;
  maxResults: number;
  minCompatibility: number;
  allowKeyChanges: boolean;
  maxKeyChanges: number;
  energyRange: { min: number; max: number };
  bpmRange: { min: number; max: number };
  genreFocus: string[];
  genreAvoid: string[];
  artistAvoid: string[];
  durationRange: { min: number; max: number };
  transitionPreference: TransitionType[];
  harmonicPreference: HarmonicMode[];
}

// Queue event types
export type QueueEventType = 
  | 'song_added'
  | 'song_removed'
  | 'song_played'
  | 'song_skipped'
  | 'queue_cleared'
  | 'auto_mix_added'
  | 'transition_planned'
  | 'queue_reordered'
  | 'priority_changed';

// Queue event
export interface QueueEvent {
  type: QueueEventType;
  timestamp: Date;
  songId?: string;
  data?: Record<string, unknown>;
  userId?: string;
}

// Default queue configuration
export const DEFAULT_QUEUE_CONFIG: DJQueueConfig = {
  maxQueueSize: 20,
  autoMixEnabled: true,
  smartTransitions: true,
  harmonicMixing: true,
  energyMatching: true,
  bpmMatching: true,
  genreFiltering: false,
  duplicatePrevention: true,
  autoRefill: true,
  refillCount: 5,
  transitionDuration: 4000,
  crossfadeType: 'equal_power',
  energyProfile: 'wave',
  harmonicProgression: ['perfect_match', 'relative_minor', 'dominant', 'circle_progression'],
  allowedGenres: [],
  blockedGenres: [],
  blockedArtists: [],
  maxSongDuration: 600, // 10 minutes
  minSongDuration: 60   // 1 minute
};

// Default auto-mixing options
export const DEFAULT_AUTO_MIX_OPTIONS: AutoMixOptions = {
  strategy: 'balanced',
  maxResults: 10,
  minCompatibility: 0.6,
  allowKeyChanges: true,
  maxKeyChanges: 3,
  energyRange: { min: 0.3, max: 0.9 },
  bpmRange: { min: 90, max: 140 },
  genreFocus: [],
  genreAvoid: [],
  artistAvoid: [],
  durationRange: { min: 120, max: 480 }, // 2-8 minutes
  transitionPreference: ['harmonic', 'beatmatch', 'crossfade'],
  harmonicPreference: ['perfect_match', 'relative_minor', 'dominant']
};

/**
 * DJ Queue Manager Class
 */
export class DJQueueManager {
  private queue: DJQueueEntry[] = [];
  private config: DJQueueConfig;
  private autoMixOptions: AutoMixOptions;
  private eventHistory: QueueEvent[] = [];
  private candidateSongs: Song[] = [];
  private currentSong?: DJQueueEntry;
  private nextSong?: DJQueueEntry;

  constructor(
    config: Partial<DJQueueConfig> = {},
    autoMixOptions: Partial<AutoMixOptions> = {}
  ) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.autoMixOptions = { ...DEFAULT_AUTO_MIX_OPTIONS, ...autoMixOptions };
  }

  /**
   * Initialize the queue manager with candidate songs
   */
  async initialize(candidateSongs: Song[]): Promise<void> {
    this.candidateSongs = candidateSongs;
    await this.analyzeCandidateSongs();
    
    if (this.config.autoRefill && this.queue.length < this.config.refillCount) {
      await this.autoRefillQueue();
    }
    
    this.logEvent('queue_cleared', { candidateCount: candidateSongs.length });
  }

  /**
   * Add a song to the queue
   */
  async addSong(
    song: Song,
    options: {
      position?: number;
      priority?: DJQueueEntry['priority'];
      addedBy?: DJQueueEntry['addedBy'];
      autoMix?: boolean;
      tags?: string[];
      notes?: string;
    } = {}
  ): Promise<DJQueueEntry> {
    const {
      position = this.queue.length,
      priority = 'normal',
      addedBy = 'user',
      autoMix = false,
      tags = [],
      notes
    } = options;

    // Check for duplicates if enabled
    if (this.config.duplicatePrevention && this.isDuplicate(song)) {
      throw new ServiceError(
        'DUPLICATE_SONG',
        `Song "${song.name}" by ${song.artist} is already in the queue`
      );
    }

    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new ServiceError(
        'QUEUE_FULL',
        `Queue is full (max ${this.config.maxQueueSize} songs)`
      );
    }

    // Get audio analysis
    const analysis = await analyzeAudioFeatures(song);

    // Create queue entry
    const entry: DJQueueEntry = {
      id: this.generateId(),
      song,
      analysis,
      position,
      addedAt: new Date(),
      addedBy,
      priority,
      autoMixEnabled: autoMix || this.config.autoMixEnabled,
      tags
    };

    if (notes) entry.notes = notes;

    // Insert into queue
    this.queue.splice(position, 0, entry);
    this.updatePositions();

    // Plan transition if not first song
    if (position > 0 && this.config.smartTransitions) {
      await this.planTransition(entry);
    }

    // Auto-refill if needed
    if (this.config.autoRefill) {
      await this.autoRefillQueue();
    }

    this.logEvent('song_added', { songId: song.id, position, addedBy });

    return entry;
  }

  /**
   * Remove a song from the queue
   */
  removeSong(songId: string): DJQueueEntry | null {
    const index = this.queue.findIndex(entry => entry.id === songId);
    if (index === -1) return null;

    const removed = this.queue.splice(index, 1)[0];
    this.updatePositions();

    // Replan transitions for affected songs
    if (this.config.smartTransitions && index < this.queue.length) {
      this.queue.slice(index).forEach(entry => {
        this.planTransition(entry);
      });
    }

    this.logEvent('song_removed', { songId: removed.song.id });

    return removed;
  }

  /**
   * Get the next song to play
   */
  getNextSong(): DJQueueEntry | null {
    if (this.queue.length === 0) return null;

    const next = this.queue[0];
    this.currentSong = next;
    this.nextSong = this.queue[1];

    this.logEvent('song_played', { songId: next.song.id });

    return next;
  }

  /**
   * Mark current song as played and remove from queue
   */
  markSongPlayed(): void {
    if (this.currentSong) {
      this.removeSong(this.currentSong.id);
      this.currentSong = undefined;
    }
  }

  /**
   * Skip the current song
   */
  skipSong(): DJQueueEntry | null {
    if (!this.currentSong) return null;

    this.logEvent('song_skipped', { songId: this.currentSong.song.id });
    this.markSongPlayed();
    return null;
  }

  /**
   * Reorder the queue
   */
  reorderQueue(fromPosition: number, toPosition: number): void {
    if (fromPosition < 0 || fromPosition >= this.queue.length ||
        toPosition < 0 || toPosition >= this.queue.length) {
      throw new ServiceError('INVALID_POSITION', 'Invalid queue position');
    }

    const [moved] = this.queue.splice(fromPosition, 1);
    this.queue.splice(toPosition, 0, moved);
    this.updatePositions();

    // Replan transitions for affected songs
    if (this.config.smartTransitions) {
      const start = Math.min(fromPosition, toPosition);
      const end = Math.max(fromPosition, toPosition);
      this.queue.slice(start, end + 1).forEach(entry => {
        this.planTransition(entry);
      });
    }

    this.logEvent('queue_reordered', { fromPosition, toPosition });
  }

  /**
   * Change priority of a queue entry
   */
  changePriority(songId: string, priority: DJQueueEntry['priority']): void {
    const entry = this.queue.find(e => e.id === songId);
    if (!entry) {
      throw new ServiceError('SONG_NOT_FOUND', 'Song not found in queue');
    }

    entry.priority = priority;
    this.sortByPriority();

    this.logEvent('priority_changed', { songId, priority });
  }

  /**
   * Auto-refill the queue with compatible songs
   */
  async autoRefillQueue(): Promise<void> {
    if (!this.config.autoRefill || this.candidateSongs.length === 0) return;

    const currentSize = this.queue.length;
    const needed = Math.min(
      this.config.refillCount,
      this.config.maxQueueSize - currentSize
    );

    if (needed <= 0) return;

    // Get last song in queue for compatibility
    const lastSong = this.queue.length > 0 ? this.queue[this.queue.length - 1] : null;

    // Find compatible songs
    const recommendations = await this.getAutoMixRecommendations(lastSong, needed);

    // Add recommended songs to queue
    for (const recommendation of recommendations) {
      try {
        await this.addSong(recommendation.song, {
          addedBy: 'auto',
          autoMix: true,
          tags: ['auto-mix', recommendation.strategy],
          notes: `Auto-mixed using ${recommendation.strategy} strategy`
        });
      } catch (error) {
        console.warn('Failed to add auto-mix song:', error);
      }
    }

    this.logEvent('auto_mix_added', { count: recommendations.length });
  }

  /**
   * Get auto-mixing recommendations
   */
  async getAutoMixRecommendations(
    currentSong: DJQueueEntry | null,
    count: number = 5
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    if (this.candidateSongs.length === 0) return [];

    // Filter candidates based on current song and options
    const candidates = this.candidateSongs.filter(song => {
      // Skip songs already in queue
      if (this.queue.some(entry => entry.song.id === song.id)) return false;
      
      // Skip blocked artists
      if (this.config.blockedArtists.includes(song.artist || '')) return false;
      
      // Skip if duration is out of range
      if (song.duration && (song.duration < this.config.minSongDuration || 
                           song.duration > this.config.maxSongDuration)) return false;
      
      return true;
    });

    // If no current song, return random selection
    if (!currentSong) {
      return candidates
        .slice(0, count)
        .map(song => ({
          song,
          strategy: 'balanced' as AutoMixStrategy,
          compatibility: 0.5
        }));
    }

    // Get recommendations based on strategy
    switch (this.autoMixOptions.strategy) {
      case 'harmonic':
        return await this.getHarmonicRecommendations(currentSong, candidates, count);
      case 'energy':
        return await this.getEnergyRecommendations(currentSong, candidates, count);
      case 'bpm':
        return await this.getBPMRecommendations(currentSong, candidates, count);
      case 'genre':
        return await this.getGenreRecommendations(currentSong, candidates, count);
      case 'crowd_pleaser':
        return await this.getCrowdPleaserRecommendations(currentSong, candidates, count);
      case 'experimental':
        return await this.getExperimentalRecommendations(currentSong, candidates, count);
      case 'classic_dj':
        return await this.getClassicDJRecommendations(currentSong, candidates, count);
      case 'radio_friendly':
        return await this.getRadioFriendlyRecommendations(currentSong, candidates, count);
      case 'underground':
        return await this.getUndergroundRecommendations(currentSong, candidates, count);
      case 'balanced':
      default:
        return await this.getBalancedRecommendations(currentSong, candidates, count);
    }
  }

  /**
   * Get harmonic-based recommendations
   */
  private async getHarmonicRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    const recommendations = await getHarmonicMixingRecommendations(
      currentSong.song,
      candidates,
      {
        preferredMode: this.autoMixOptions.harmonicPreference[0],
        maxResults: count,
        minCompatibility: this.autoMixOptions.minCompatibility,
        allowKeyChanges: this.autoMixOptions.allowKeyChanges
      }
    );

    return recommendations.map(rec => ({
      song: candidates.find(s => s.id === rec.targetKey) || rec.targetKey as unknown as Song,
      strategy: 'harmonic' as AutoMixStrategy,
      compatibility: rec.compatibility
    }));
  }

  /**
   * Get energy-based recommendations
   */
  private async getEnergyRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    if (!currentSong.analysis) return [];

    const currentEnergy = currentSong.analysis.energy;
    const targetEnergy = this.config.energyProfile === 'rising' ? Math.min(1, currentEnergy + 0.2) :
                       this.config.energyProfile === 'falling' ? Math.max(0, currentEnergy - 0.2) :
                       currentEnergy;

    // Analyze candidates for energy
    const analyzed = await Promise.all(
      candidates.slice(0, count * 2).map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        const energyDiff = Math.abs(analysis.energy - targetEnergy);
        const compatibility = Math.max(0, 1 - energyDiff);
        
        return { song, analysis, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'energy' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get BPM-based recommendations
   */
  private async getBPMRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    if (!currentSong.analysis) return [];

    const currentBPM = currentSong.analysis.bpm;

    // Analyze candidates for BPM compatibility
    const analyzed = await Promise.all(
      candidates.slice(0, count * 2).map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        const bpmDiff = Math.abs(analysis.bpm - currentBPM);
        const compatibility = Math.max(0, 1 - (bpmDiff / 50)); // Normalize to 0-1
        
        return { song, analysis, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'bpm' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get genre-based recommendations
   */
  private async getGenreRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    const currentGenre = this.extractGenre(currentSong.song);
    
    // Filter by genre focus
    let filteredCandidates = candidates;
    if (this.autoMixOptions.genreFocus.length > 0) {
      filteredCandidates = candidates.filter(song => 
        this.autoMixOptions.genreFocus.some(genre => 
          this.extractGenre(song).includes(genre)
        )
      );
    }

    // Score by genre similarity
    const scored = filteredCandidates.slice(0, count * 2).map(song => {
      const songGenre = this.extractGenre(song);
      const similarity = this.calculateGenreSimilarity(currentGenre, songGenre);
      
      return { song, compatibility: similarity };
    });

    return scored
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'genre' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get crowd pleaser recommendations
   */
  private async getCrowdPleaserRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    // Analyze candidates for danceability and energy
    const analyzed = await Promise.all(
      candidates.slice(0, count * 2).map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        // Prioritize high energy and danceability
        const compatibility = (analysis.energy * 0.6) + (analysis.danceability * 0.4);
        
        return { song, analysis, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'crowd_pleaser' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get experimental recommendations
   */
  private async getExperimentalRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    // Randomly select from diverse genres
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const diverse = shuffled.slice(0, count * 3);
    
    // Analyze for uniqueness
    const analyzed = await Promise.all(
      diverse.map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        // Score by how different it is from current
        const currentAnalysis = currentSong.analysis;
        if (!currentAnalysis) return { song, compatibility: 0.5 };
        
        const bpmDiff = Math.abs(analysis.bpm - currentAnalysis.bpm) / 100;
        const energyDiff = Math.abs(analysis.energy - currentAnalysis.energy);
        const keyDiff = analysis.key === currentAnalysis.key ? 0 : 1;
        
        const compatibility = Math.min(1, (bpmDiff + energyDiff + keyDiff) / 3);
        
        return { song, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'experimental' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get classic DJ recommendations
   */
  private async getClassicDJRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    // Classic DJ approach: prioritize BPM and energy, with some harmonic consideration
    if (!currentSong.analysis) return [];

    const analyzed = await Promise.all(
      candidates.slice(0, count * 2).map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        
        // BPM compatibility (40%)
        const currentAnalysis = currentSong.analysis;
        if (!currentAnalysis) return { song, compatibility: 0 };
        
        const bpmDiff = Math.abs(analysis.bpm - currentAnalysis.bpm);
        const bpmScore = Math.max(0, 1 - (bpmDiff / 30));
        
        // Energy flow (30%)
        const energyScore = analysis.energy > 0.5 ? 0.8 : 0.4;
        
        // Harmonic compatibility (20%)
        const harmonicScore = analysis.key === currentAnalysis.key ? 1 : 0.6;
        
        // Danceability (10%)
        const danceScore = analysis.danceability;
        
        const compatibility = (bpmScore * 0.4) + (energyScore * 0.3) + 
                           (harmonicScore * 0.2) + (danceScore * 0.1);
        
        return { song, analysis, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'classic_dj' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get radio friendly recommendations
   */
  private async getRadioFriendlyRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    // Prioritize safe, mainstream choices
    const analyzed = await Promise.all(
      candidates.slice(0, count * 2).map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        
        // High valence (positivity) and moderate energy
        const valenceScore = analysis.valence > 0.6 ? 1 : analysis.valence;
        const energyScore = analysis.energy > 0.3 && analysis.energy < 0.8 ? 1 : 0.5;
        
        // Low complexity (more radio-friendly)
        const complexityScore = 1 - analysis.instrumentalness;
        
        const compatibility = (valenceScore * 0.4) + (energyScore * 0.3) + 
                           (complexityScore * 0.3);
        
        return { song, analysis, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'radio_friendly' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get underground recommendations
   */
  private async getUndergroundRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    // Prioritize niche/alternative selections
    const analyzed = await Promise.all(
      candidates.slice(0, count * 2).map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        
        // Higher instrumentalness and acousticness (more underground)
        const instrumentalScore = analysis.instrumentalness;
        const acousticScore = analysis.acousticness;
        
        // Lower valence (more experimental)
        const valenceScore = 1 - analysis.valence;
        
        // Higher complexity
        const complexityScore = analysis.instrumentalness;
        
        const compatibility = (instrumentalScore * 0.3) + (acousticScore * 0.3) + 
                           (valenceScore * 0.2) + (complexityScore * 0.2);
        
        return { song, analysis, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'underground' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Get balanced recommendations
   */
  private async getBalancedRecommendations(
    currentSong: DJQueueEntry,
    candidates: Song[],
    count: number
  ): Promise<Array<{ song: Song; strategy: AutoMixStrategy; compatibility: number }>> {
    if (!currentSong.analysis) return [];

    const analyzed = await Promise.all(
      candidates.slice(0, count * 2).map(async (song) => {
        const analysis = await analyzeAudioFeatures(song);
        
        // Balance all factors
        const currentAnalysis = currentSong.analysis;
        if (!currentAnalysis) return { song, compatibility: 0 };
        
        const bpmScore = Math.max(0, 1 - (Math.abs(analysis.bpm - currentAnalysis.bpm) / 50));
        const energyScore = 1 - Math.abs(analysis.energy - currentAnalysis.energy);
        const harmonicScore = analysis.key === currentAnalysis.key ? 1 : 0.7;
        const danceScore = analysis.danceability;
        
        const compatibility = (bpmScore * 0.25) + (energyScore * 0.25) + 
                           (harmonicScore * 0.25) + (danceScore * 0.25);
        
        return { song, analysis, compatibility };
      })
    );

    return analyzed
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, count)
      .map(item => ({
        song: item.song,
        strategy: 'balanced' as AutoMixStrategy,
        compatibility: item.compatibility
      }));
  }

  /**
   * Plan transition for a queue entry
   */
  private async planTransition(entry: DJQueueEntry): Promise<void> {
    if (!this.config.smartTransitions || entry.position === 0) return;

    const previousEntry = this.queue[entry.position - 1];
    if (!previousEntry || !previousEntry.analysis || !entry.analysis) return;

    try {
      const transitionAnalysis = await analyzeTransition(
        previousEntry.song,
        entry.song,
        previousEntry.analysis,
        entry.analysis
      );

      entry.transition = transitionAnalysis.recommendedParameters;
    } catch (error) {
      console.warn('Failed to plan transition:', error);
    }
  }

  /**
   * Check if a song is a duplicate
   */
  private isDuplicate(song: Song): boolean {
    return this.queue.some(entry => 
      entry.song.id === song.id || 
      (entry.song.name === song.name && entry.song.artist === song.artist)
    );
  }

  /**
   * Update queue positions
   */
  private updatePositions(): void {
    this.queue.forEach((entry, index) => {
      entry.position = index;
    });
  }

  /**
   * Sort queue by priority
   */
  private sortByPriority(): void {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    this.queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    this.updatePositions();
  }

  /**
   * Analyze candidate songs
   */
  private async analyzeCandidateSongs(): Promise<void> {
    // Pre-analyze candidate songs for faster recommendations
    const batchSize = 10;
    for (let i = 0; i < this.candidateSongs.length; i += batchSize) {
      const batch = this.candidateSongs.slice(i, i + batchSize);
      await Promise.all(
        batch.map(song => analyzeAudioFeatures(song))
      );
    }
  }

  /**
   * Extract genre from song metadata
   */
  private extractGenre(song: Song): string[] {
    const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
    const genres: string[] = [];
    
    const genreKeywords = [
      'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop', 'hip hop', 'rap',
      'country', 'blues', 'metal', 'punk', 'indie', 'alternative', 'folk', 'soul',
      'r&b', 'reggae', 'techno', 'house', 'ambient', 'experimental', 'psychedelic',
      'funk', 'disco', 'grunge', 'emo', 'ska', 'gospel', 'latin', 'world'
    ];
    
    for (const keyword of genreKeywords) {
      if (metadata.includes(keyword)) {
        genres.push(keyword);
      }
    }
    
    return genres.length > 0 ? genres : ['unknown'];
  }

  /**
   * Calculate genre similarity
   */
  private calculateGenreSimilarity(genre1: string[], genre2: string[]): number {
    if (genre1.length === 0 || genre2.length === 0) return 0;
    
    const intersection = genre1.filter(g => genre2.includes(g));
    const union = [...new Set([...genre1, ...genre2])];
    
    return intersection.length / union.length;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Log queue event
   */
  private logEvent(type: QueueEventType, data?: Record<string, unknown>): void {
    const event: QueueEvent = {
      type,
      timestamp: new Date(),
      data
    };
    
    this.eventHistory.push(event);
    
    // Keep only last 100 events
    if (this.eventHistory.length > 100) {
      this.eventHistory = this.eventHistory.slice(-100);
    }
  }

  /**
   * Get current queue
   */
  getQueue(): DJQueueEntry[] {
    return [...this.queue];
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): DJQueueStats {
    const totalSongs = this.queue.length;
    const autoMixedSongs = this.queue.filter(e => e.addedBy === 'auto').length;
    const userAddedSongs = this.queue.filter(e => e.addedBy === 'user').length;
    
    let totalEnergy = 0;
    let totalBPM = 0;
    const keyDistribution: Record<string, number> = {};
    const genreDistribution: Record<string, number> = {};
    
    this.queue.forEach(entry => {
      if (entry.analysis) {
        totalEnergy += entry.analysis.energy;
        totalBPM += entry.analysis.bpm;
        
        const key = entry.analysis.key;
        keyDistribution[key] = (keyDistribution[key] || 0) + 1;
        
        const genres = this.extractGenre(entry.song);
        genres.forEach(genre => {
          genreDistribution[genre] = (genreDistribution[genre] || 0) + 1;
        });
      }
    });
    
    const averageEnergy = totalSongs > 0 ? totalEnergy / totalSongs : 0;
    const averageBPM = totalSongs > 0 ? totalBPM / totalSongs : 0;
    
    const transitionCount = this.queue.filter(e => e.transition).length;
    const harmonicTransitions = this.queue.filter(e => 
      e.harmonicMode && e.harmonicMode !== 'compatible'
    ).length;
    const energyTransitions = this.queue.filter(e => e.energyPattern).length;
    
    const queueAge = this.queue.reduce((sum, entry) => {
      const age = (Date.now() - entry.addedAt.getTime()) / (1000 * 60); // minutes
      return sum + age;
    }, 0) / totalSongs;
    
    return {
      totalSongs,
      autoMixedSongs,
      userAddedSongs,
      averageEnergy,
      averageBPM,
      keyDistribution,
      genreDistribution,
      transitionCount,
      harmonicTransitions,
      energyTransitions,
      queueAge
    };
  }

  /**
   * Get event history
   */
  getEventHistory(): QueueEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DJQueueConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update auto-mixing options
   */
  updateAutoMixOptions(options: Partial<AutoMixOptions>): void {
    this.autoMixOptions = { ...this.autoMixOptions, ...options };
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.queue = [];
    this.currentSong = undefined;
    this.nextSong = undefined;
    this.logEvent('queue_cleared');
  }
}

/**
 * Create a DJ queue manager instance
 */
export function createDJQueueManager(
  config?: Partial<DJQueueConfig>,
  autoMixOptions?: Partial<AutoMixOptions>
): DJQueueManager {
  return new DJQueueManager(config, autoMixOptions);
}

// Extend DJQueueManager class with missing methods for UI
declare module '@/lib/services/dj-queue-manager' {
  interface DJQueueManager {
    getAutoMixOptions(): AutoMixOptions;
    getConfig(): DJQueueConfig;
  }
}
