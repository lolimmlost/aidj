// Genre-Aware Audio Analysis Service
// Combines audio feature analysis with genre-based recommendations

import type { Song } from '@/lib/types/song';
import type { AudioAnalysis } from './audio-analysis';
import { analyzeAudioFeatures } from './audio-analysis';
import { ServiceError } from '../utils';

// Genre profile with audio characteristics
export interface GenreAudioProfile {
  genre: string;
  typicalBPMRange: { min: number; max: number };
  typicalEnergyRange: { min: number; max: number };
  typicalKeyCharacteristics: string[];
  commonInstruments: string[];
  danceabilityWeight: number; // How much this genre values danceability
  energyWeight: number; // How much this genre values energy
  acousticWeight: number; // How much this genre values acoustic elements
}

// Enhanced audio analysis with genre context
export interface EnhancedAudioAnalysis extends AudioAnalysis {
  genreProfile?: GenreAudioProfile;
  genreConfidence: number; // 0.0-1.0
  genreMatchScore: number; // 0.0-1.0
  danceabilityAdjustment: number; // Adjusted danceability based on genre
  energyAdjustment: number; // Adjusted energy based on genre
  acousticAdjustment: number; // Adjusted acousticness based on genre
  recommendedForGenre: boolean; // Whether this song fits the genre profile
}

// Genre-aware recommendation result
export interface GenreAwareRecommendation {
  song: Song;
  analysis: EnhancedAudioAnalysis;
  genreMatch: string;
  genreConfidence: number;
  recommendationScore: number; // 0.0-1.0
  reasons: string[];
  priority: 'high' | 'medium' | 'low';
}

// Predefined genre profiles
export const GENRE_PROFILES: Record<string, GenreAudioProfile> = {
  'electronic': {
    genre: 'electronic',
    typicalBPMRange: { min: 110, max: 140 },
    typicalEnergyRange: { min: 0.6, max: 0.9 },
    typicalKeyCharacteristics: ['synthetic', 'digital', 'processed'],
    commonInstruments: ['synthesizer', 'drum machine', 'sampler', 'sequencer'],
    danceabilityWeight: 0.8,
    energyWeight: 0.7,
    acousticWeight: 0.2
  },
  'house': {
    genre: 'house',
    typicalBPMRange: { min: 115, max: 135 },
    typicalEnergyRange: { min: 0.5, max: 0.8 },
    typicalKeyCharacteristics: ['four-on-the-floor', 'repetitive', 'groovy'],
    commonInstruments: ['drum machine', 'bassline', 'synthesizer', 'sampler'],
    danceabilityWeight: 0.9,
    energyWeight: 0.6,
    acousticWeight: 0.1
  },
  'techno': {
    genre: 'techno',
    typicalBPMRange: { min: 120, max: 150 },
    typicalEnergyRange: { min: 0.7, max: 1.0 },
    typicalKeyCharacteristics: ['industrial', 'mechanical', 'driving'],
    commonInstruments: ['drum machine', 'synthesizer', 'sequencer', 'effects'],
    danceabilityWeight: 0.7,
    energyWeight: 0.8,
    acousticWeight: 0.1
  },
  'trance': {
    genre: 'trance',
    typicalBPMRange: { min: 120, max: 145 },
    typicalEnergyRange: { min: 0.6, max: 0.9 },
    typicalKeyCharacteristics: ['ethereal', 'hypnotic', 'melodic'],
    commonInstruments: ['synthesizer', 'arpeggiator', 'pad', 'effects'],
    danceabilityWeight: 0.8,
    energyWeight: 0.7,
    acousticWeight: 0.1
  },
  'rock': {
    genre: 'rock',
    typicalBPMRange: { min: 100, max: 160 },
    typicalEnergyRange: { min: 0.4, max: 0.9 },
    typicalKeyCharacteristics: ['distorted', 'powerful', 'live'],
    commonInstruments: ['electric guitar', 'drums', 'bass', 'vocals'],
    danceabilityWeight: 0.5,
    energyWeight: 0.9,
    acousticWeight: 0.6
  },
  'pop': {
    genre: 'pop',
    typicalBPMRange: { min: 90, max: 130 },
    typicalEnergyRange: { min: 0.3, max: 0.8 },
    typicalKeyCharacteristics: ['catchy', 'polished', 'mainstream'],
    commonInstruments: ['vocals', 'synthesizer', 'drum machine', 'bass'],
    danceabilityWeight: 0.7,
    energyWeight: 0.5,
    acousticWeight: 0.3
  },
  'acoustic': {
    genre: 'acoustic',
    typicalBPMRange: { min: 60, max: 120 },
    typicalEnergyRange: { min: 0.2, max: 0.7 },
    typicalKeyCharacteristics: ['organic', 'natural', 'warm'],
    commonInstruments: ['acoustic guitar', 'piano', 'strings', 'vocals'],
    danceabilityWeight: 0.3,
    energyWeight: 0.4,
    acousticWeight: 0.9
  },
  'jazz': {
    genre: 'jazz',
    typicalBPMRange: { min: 60, max: 140 },
    typicalEnergyRange: { min: 0.3, max: 0.8 },
    typicalKeyCharacteristics: ['complex', 'improvised', 'sophisticated'],
    commonInstruments: ['piano', 'saxophone', 'trumpet', 'double bass', 'drums'],
    danceabilityWeight: 0.6,
    energyWeight: 0.5,
    acousticWeight: 0.8
  },
  'classical': {
    genre: 'classical',
    typicalBPMRange: { min: 60, max: 120 },
    typicalEnergyRange: { min: 0.2, max: 0.6 },
    typicalKeyCharacteristics: ['orchestral', 'structured', 'formal'],
    commonInstruments: ['orchestra', 'strings', 'woodwinds', 'brass', 'percussion'],
    danceabilityWeight: 0.2,
    energyWeight: 0.3,
    acousticWeight: 0.9
  },
  'hip-hop': {
    genre: 'hip-hop',
    typicalBPMRange: { min: 70, max: 110 },
    typicalEnergyRange: { min: 0.5, max: 0.9 },
    typicalKeyCharacteristics: ['urban', 'rhythmic', 'spoken'],
    commonInstruments: ['drum machine', 'sampler', 'turntables', 'vocals'],
    danceabilityWeight: 0.9,
    energyWeight: 0.7,
    acousticWeight: 0.1
  },
  'metal': {
    genre: 'metal',
    typicalBPMRange: { min: 100, max: 180 },
    typicalEnergyRange: { min: 0.7, max: 1.0 },
    typicalKeyCharacteristics: ['aggressive', 'distorted', 'heavy'],
    commonInstruments: ['electric guitar', 'double bass', 'drums', 'screamed vocals'],
    danceabilityWeight: 0.3,
    energyWeight: 0.9,
    acousticWeight: 0.4
  }
};

/**
 * Analyze song with genre-aware audio analysis
 */
export async function analyzeSongWithGenreContext(
  song: Song,
  previousSong?: Song,
  targetGenre?: string
): Promise<EnhancedAudioAnalysis> {
  try {
    // Get basic audio analysis
    const basicAnalysis = await analyzeAudioFeatures(song);
    
    // Determine genre profile
    const genreProfile = determineGenreProfile(song, targetGenre);
    
    // Calculate genre confidence
    const genreConfidence = calculateGenreConfidence(song, genreProfile);
    
    // Calculate genre match score
    const genreMatchScore = calculateGenreMatchScore(song, genreProfile);
    
    // Adjust audio features based on genre characteristics
    const adjustedFeatures = adjustAudioFeaturesForGenre(basicAnalysis, genreProfile);
    
    // Determine if song is recommended for this genre
    const recommendedForGenre = isRecommendedForGenre(basicAnalysis, genreProfile);
    
    return {
      ...basicAnalysis,
      genreProfile,
      genreConfidence,
      genreMatchScore,
      ...adjustedFeatures,
      recommendedForGenre
    };
  } catch (error) {
    throw new ServiceError(
      'GENRE_AUDIO_ANALYSIS_ERROR',
      `Failed to analyze song with genre context: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Determine the most likely genre profile for a song
 */
function determineGenreProfile(song: Song, targetGenre?: string): GenreAudioProfile | undefined {
  // If target genre is specified, use it
  if (targetGenre && GENRE_PROFILES[targetGenre]) {
    return GENRE_PROFILES[targetGenre];
  }
  
  // Extract genre hints from song metadata
  const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
  
  // Score each genre profile based on metadata
  const genreScores: Array<{ genre: string; score: number }> = [];
  
  for (const [genreName, profile] of Object.entries(GENRE_PROFILES)) {
    let score = 0;
    
    // Check for genre keywords in metadata
    if (metadata.includes(genreName)) {
      score += 10; // Strong match
    }
    
    // Check for common instruments
    for (const instrument of profile.commonInstruments) {
      if (metadata.includes(instrument.toLowerCase())) {
        score += 2;
      }
    }
    
    // Check for key characteristics
    for (const characteristic of profile.typicalKeyCharacteristics) {
      if (metadata.includes(characteristic.toLowerCase())) {
        score += 1;
      }
    }
    
    // Check BPM range compatibility
    const bpm = extractBPMFromMetadata(song);
    if (bpm >= profile.typicalBPMRange.min && bpm <= profile.typicalBPMRange.max) {
      score += 3;
    }
    
    // Check energy range compatibility
    const energy = extractEnergyFromMetadata(song);
    if (energy >= profile.typicalEnergyRange.min && energy <= profile.typicalEnergyRange.max) {
      score += 2;
    }
    
    if (score > 0) {
      genreScores.push({ genre: genreName, score });
    }
  }
  
  // Return the genre profile with highest score
  if (genreScores.length === 0) {
    return undefined;
  }
  
  genreScores.sort((a, b) => b.score - a.score);
  return GENRE_PROFILES[genreScores[0].genre];
}

/**
 * Calculate confidence in genre classification
 */
function calculateGenreConfidence(song: Song, genreProfile: GenreAudioProfile | undefined): number {
  if (!genreProfile) return 0.5; // Low confidence without profile
  
  // Extract metadata
  const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
  
  let confidence = 0.5; // Base confidence
  
  // Boost confidence based on explicit genre matches
  if (metadata.includes(genreProfile.genre)) {
    confidence += 0.3;
  }
  
  // Boost confidence based on instrument matches
  for (const instrument of genreProfile.commonInstruments) {
    if (metadata.includes(instrument.toLowerCase())) {
      confidence += 0.1;
    }
  }
  
  return Math.min(1.0, confidence);
}

/**
 * Calculate how well a song matches its genre profile
 */
function calculateGenreMatchScore(song: Song, genreProfile: GenreAudioProfile | undefined): number {
  if (!genreProfile) return 0.5; // Neutral score without profile
  
  // Extract metadata
  const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
  
  let score = 0.5; // Base score
  
  // Check for genre keywords
  if (metadata.includes(genreProfile.genre)) {
    score += 0.3;
  }
  
  // Check for common instruments
  for (const instrument of genreProfile.commonInstruments) {
    if (metadata.includes(instrument.toLowerCase())) {
      score += 0.1;
    }
  }
  
  // Check for key characteristics
  for (const characteristic of genreProfile.typicalKeyCharacteristics) {
    if (metadata.includes(characteristic.toLowerCase())) {
      score += 0.05;
    }
  }
  
  // Check BPM range compatibility
  const bpm = extractBPMFromMetadata(song);
  if (bpm >= genreProfile.typicalBPMRange.min && bpm <= genreProfile.typicalBPMRange.max) {
    score += 0.1;
  }
  
  // Check energy range compatibility
  const energy = extractEnergyFromMetadata(song);
  if (energy >= genreProfile.typicalEnergyRange.min && energy <= genreProfile.typicalEnergyRange.max) {
    score += 0.1;
  }
  
  return Math.min(1.0, score);
}

/**
 * Extract BPM from song metadata (fallback estimation)
 */
function extractBPMFromMetadata(song: Song): number {
  // Try to extract BPM from title or artist name
  const metadata = `${song.artist} ${song.name}`.toLowerCase();
  
  // Look for BPM indicators in title
  const bpmIndicators = ['bpm', 'tempo', 'speed'];
  for (const indicator of bpmIndicators) {
    if (metadata.includes(indicator)) {
      const match = metadata.match(/(\d+)\s*bpm/i);
      if (match) {
        return parseInt(match[1]);
      }
    }
  }
  
  // Default BPM based on genre hints
  const genreHints = extractGenreHints(song);
  if (genreHints.includes('electronic') || genreHints.includes('techno')) {
    return 125; // Electronic default
  } else if (genreHints.includes('rock') || genreHints.includes('metal')) {
    return 130; // Rock default
  } else if (genreHints.includes('hip-hop')) {
    return 95; // Hip-hop default
  } else if (genreHints.includes('acoustic') || genreHints.includes('jazz')) {
    return 85; // Acoustic default
  } else if (genreHints.includes('classical')) {
    return 75; // Classical default
  }
  
  return 100; // Default
}

/**
 * Extract energy from song metadata (fallback estimation)
 */
function extractEnergyFromMetadata(song: Song): number {
  const metadata = `${song.artist} ${song.name}`.toLowerCase();
  
  // Look for energy indicators
  const highEnergyWords = ['intense', 'powerful', 'energetic', 'upbeat', 'hype'];
  const lowEnergyWords = ['calm', 'ambient', 'chill', 'soft', 'mellow', 'relaxing'];
  
  let energy = 0.5; // Default medium energy
  
  // Check for high energy indicators
  for (const word of highEnergyWords) {
    if (metadata.includes(word)) {
      energy = Math.min(0.9, energy + 0.2);
    }
  }
  
  // Check for low energy indicators
  for (const word of lowEnergyWords) {
    if (metadata.includes(word)) {
      energy = Math.max(0.1, energy - 0.2);
    }
  }
  
  return energy;
}

/**
 * Extract genre hints from song metadata (reused from audio-analysis)
 */
function extractGenreHints(song: Song): string[] {
  const hints: string[] = [];
  const metadata = `${song.artist} ${song.name} ${song.album}`.toLowerCase();
  
  // Common genre keywords
  const genreKeywords = [
    'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop', 'hip hop', 'rap',
    'country', 'blues', 'metal', 'punk', 'indie', 'alternative', 'folk', 'soul',
    'r&b', 'reggae', 'techno', 'house', 'ambient', 'experimental', 'psychedelic',
    'funk', 'disco', 'grunge', 'emo', 'ska', 'gospel', 'latin', 'world',
    'acoustic', 'instrumental', 'dubstep', 'drum', 'bass', 'trance', 'dub'
  ];
  
  for (const keyword of genreKeywords) {
    if (metadata.includes(keyword)) {
      hints.push(keyword);
    }
  }
  
  return hints;
}

/**
 * Adjust audio features based on genre characteristics
 */
function adjustAudioFeaturesForGenre(
  analysis: AudioAnalysis,
  genreProfile: GenreAudioProfile | undefined
): {
  danceabilityAdjustment: number;
  energyAdjustment: number;
  acousticAdjustment: number;
} {
  if (!genreProfile) {
    return {
      danceabilityAdjustment: 0,
      energyAdjustment: 0,
      acousticAdjustment: 0
    };
  }
  
  // Calculate adjustments based on genre profile weights
  const { danceabilityWeight, energyWeight, acousticWeight } = genreProfile;
  
  // Adjust danceability
  let danceabilityAdjustment = 0;
  if (analysis.danceability < 0.5 && danceabilityWeight > 0.5) {
    danceabilityAdjustment = (0.5 - analysis.danceability) * danceabilityWeight;
  } else if (analysis.danceability > 0.5 && danceabilityWeight < 0.5) {
    danceabilityAdjustment = (analysis.danceability - 0.5) * danceabilityWeight;
  }
  
  // Adjust energy
  let energyAdjustment = 0;
  if (analysis.energy < 0.5 && energyWeight > 0.5) {
    energyAdjustment = (0.5 - analysis.energy) * energyWeight;
  } else if (analysis.energy > 0.5 && energyWeight > 0.5) {
    energyAdjustment = (analysis.energy - 0.5) * energyWeight;
  }
  
  // Adjust acousticness
  let acousticAdjustment = 0;
  if (analysis.acousticness < 0.5 && acousticWeight > 0.5) {
    acousticAdjustment = (0.5 - analysis.acousticness) * acousticWeight;
  } else if (analysis.acousticness > 0.5 && acousticWeight > 0.5) {
    acousticAdjustment = (analysis.acousticness - 0.5) * acousticWeight;
  }
  
  return {
    danceabilityAdjustment,
    energyAdjustment,
    acousticAdjustment
  };
}

/**
 * Check if a song is recommended for its genre
 */
function isRecommendedForGenre(
  analysis: AudioAnalysis,
  genreProfile: GenreAudioProfile | undefined
): boolean {
  if (!genreProfile) return false;
  
  // Check if song fits the genre profile
  const { typicalBPMRange, typicalEnergyRange } = genreProfile;
  
  const bpmInRange = analysis.bpm >= typicalBPMRange.min && analysis.bpm <= typicalBPMRange.max;
  const energyInRange = analysis.energy >= typicalEnergyRange.min && analysis.energy <= typicalEnergyRange.max;
  
  // Check if song has appropriate characteristics
  const hasAppropriateEnergy = energyInRange || analysis.energy > 0.8;
  const hasAppropriateDanceability = analysis.danceability >= 0.4 || (analysis.danceability > 0.3 && analysis.energy > 0.6);
  
  return bpmInRange && hasAppropriateEnergy && hasAppropriateDanceability;
}

/**
 * Get genre-aware recommendations for songs
 */
export async function getGenreAwareRecommendations(
  currentSong: Song,
  candidateSongs: Song[],
  options: {
    targetGenre?: string;
    maxResults?: number;
    minGenreConfidence?: number;
    prioritizeGenreMatch?: boolean;
  } = {}
): Promise<GenreAwareRecommendation[]> {
  try {
    // Analyze current song with genre context
    const currentAnalysis = await analyzeSongWithGenreContext(currentSong, undefined, options.targetGenre);
    
    // Analyze all candidate songs
    const recommendations: GenreAwareRecommendation[] = [];
    
    for (const song of candidateSongs) {
      // Skip if already in queue or same as current
      if (song.id === currentSong.id) continue;
      
      // Analyze candidate song
      const candidateAnalysis = await analyzeSongWithGenreContext(song, currentSong, options.targetGenre);
      
      // Calculate recommendation score
      let recommendationScore = 0;
      const reasons: string[] = [];
      
      // Base score on audio compatibility
      const audioCompatibility = calculateAudioCompatibility(currentAnalysis, candidateAnalysis);
      recommendationScore += audioCompatibility * 0.4;
      reasons.push(`Audio compatibility: ${(audioCompatibility * 100).toFixed(0)}%`);
      
      // Bonus for genre match
      if (options.prioritizeGenreMatch && candidateAnalysis.genreMatchScore > 0.7) {
        recommendationScore += 0.3;
        reasons.push('Strong genre match');
      }
      
      // Bonus for genre confidence
      if (options.minGenreConfidence && candidateAnalysis.genreConfidence >= options.minGenreConfidence) {
        recommendationScore += 0.2;
        reasons.push('High genre confidence');
      }
      
      // Bonus for genre-appropriate characteristics
      if (candidateAnalysis.recommendedForGenre) {
        recommendationScore += 0.1;
        reasons.push('Genre-appropriate characteristics');
      }
      
      // Determine priority
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (recommendationScore >= 0.8) {
        priority = 'high';
      } else if (recommendationScore >= 0.6) {
        priority = 'medium';
      }
      
      recommendations.push({
        song,
        analysis: candidateAnalysis,
        genreMatch: candidateAnalysis.genreProfile?.genre || 'unknown',
        genreConfidence: candidateAnalysis.genreConfidence,
        recommendationScore,
        reasons,
        priority
      });
    }
    
    // Sort by recommendation score and priority
    recommendations.sort((a, b) => {
      // First sort by priority
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityWeight[a.priority];
      const bPriority = priorityWeight[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Then sort by score within same priority
      return b.recommendationScore - a.recommendationScore;
    });
    
    // Return top results
    return recommendations.slice(0, options.maxResults || 10);
    
  } catch (error) {
    throw new ServiceError(
      'GENRE_AWARE_RECOMMENDATIONS_ERROR',
      `Failed to get genre-aware recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Calculate audio compatibility between two analyses
 */
function calculateAudioCompatibility(
  analysis1: AudioAnalysis,
  analysis2: AudioAnalysis
): number {
  // BPM compatibility
  const bpmDiff = Math.abs(analysis1.bpm - analysis2.bpm);
  const bpmCompatibility = Math.max(0, 1.0 - (bpmDiff / 100)); // Normalize BPM difference
  
  // Energy compatibility
  const energyDiff = Math.abs(analysis1.energy - analysis2.energy);
  const energyCompatibility = Math.max(0, 1.0 - energyDiff);
  
  // Key compatibility
  const keyCompatibility = analysis1.key === analysis2.key ? 1.0 : 0.5;
  
  // Danceability compatibility
  const danceabilityDiff = Math.abs(analysis1.danceability - analysis2.danceability);
  const danceabilityCompatibility = Math.max(0, 1.0 - danceabilityDiff);
  
  // Acousticness compatibility
  const acousticnessDiff = Math.abs(analysis1.acousticness - analysis2.acousticness);
  const acousticnessCompatibility = Math.max(0, 1.0 - acousticnessDiff);
  
  // Overall compatibility (weighted average)
  return (
    (bpmCompatibility * 0.3) +
    (energyCompatibility * 0.3) +
    (keyCompatibility * 0.2) +
    (danceabilityCompatibility * 0.1) +
    (acousticnessCompatibility * 0.1)
  );
}