// Story 7.6: Set Builder Store
// Manages DJ sets, history, and templates

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DJSet, DJSetPlanningOptions } from '@/lib/services/dj-set-planner';

// Saved DJ Set with additional metadata
export interface SavedDJSet extends DJSet {
  savedAt: number;
  template?: string;
  exported?: boolean;
  navidromePlaylistId?: string;
}

// Set template definition
export interface SetTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  options: Partial<DJSetPlanningOptions>;
}

// Pre-defined templates
export const SET_TEMPLATES: SetTemplate[] = [
  {
    id: 'club_energy',
    name: 'Club Energy',
    description: 'High energy set with rising energy curve. Perfect for club nights.',
    icon: '🔥',
    options: {
      duration: 60,
      energyProfile: 'rising',
      bpmProfile: 'gradual_rise',
      intensity: 'high',
      transitionStyle: 'dramatic',
      harmonicMode: 'energy',
    },
  },
  {
    id: 'chill_lounge',
    name: 'Chill Lounge',
    description: 'Relaxed vibes with steady energy. Great for lounges and backgrounds.',
    icon: '🌙',
    options: {
      duration: 90,
      energyProfile: 'plateau',
      bpmProfile: 'steady',
      intensity: 'chill',
      transitionStyle: 'smooth',
      harmonicMode: 'perfect_match',
    },
  },
  {
    id: 'wave_journey',
    name: 'Wave Journey',
    description: 'Dynamic energy flow with peaks and valleys. Engages crowds.',
    icon: '🌊',
    options: {
      duration: 60,
      energyProfile: 'wave',
      bpmProfile: 'wave',
      intensity: 'moderate',
      transitionStyle: 'varied',
      harmonicMode: 'balanced',
    },
  },
  {
    id: 'warmup',
    name: 'Opening/Warmup',
    description: 'Gentle start with gradual energy build. Perfect for opening sets.',
    icon: '🌅',
    options: {
      duration: 45,
      energyProfile: 'rising',
      bpmProfile: 'gradual_rise',
      intensity: 'chill',
      transitionStyle: 'smooth',
      harmonicMode: 'perfect_match',
    },
  },
  {
    id: 'peak_time',
    name: 'Peak Time',
    description: 'Maximum energy for the peak hours. High impact transitions.',
    icon: '⚡',
    options: {
      duration: 60,
      energyProfile: 'plateau',
      bpmProfile: 'steady',
      intensity: 'peak',
      transitionStyle: 'dramatic',
      harmonicMode: 'energy',
    },
  },
  {
    id: 'closing',
    name: 'Closing Set',
    description: 'Wind down with falling energy. Ends the night gracefully.',
    icon: '🌃',
    options: {
      duration: 45,
      energyProfile: 'falling',
      bpmProfile: 'gradual_fall',
      intensity: 'moderate',
      transitionStyle: 'smooth',
      harmonicMode: 'balanced',
    },
  },
];

interface SetBuilderState {
  // Current set being built
  currentSet: SavedDJSet | null;

  // Set history (max 20 sets)
  history: SavedDJSet[];

  // Generation state
  isGenerating: boolean;
  generationProgress: string;

  // Actions
  setCurrentSet: (set: SavedDJSet | null) => void;
  saveSet: (set: DJSet, template?: string) => string;
  deleteSet: (id: string) => void;
  clearHistory: () => void;
  setGenerating: (generating: boolean, progress?: string) => void;
  markExported: (setId: string, navidromePlaylistId: string) => void;

  // Queries
  getSetById: (id: string) => SavedDJSet | undefined;
  getRecentSets: (limit?: number) => SavedDJSet[];
}

export const useSetBuilderStore = create<SetBuilderState>()(
  persist(
    (set, get) => ({
      currentSet: null,
      history: [],
      isGenerating: false,
      generationProgress: '',

      setCurrentSet: (currentSet) => set({ currentSet }),

      saveSet: (djSet, template) => {
        const savedSet: SavedDJSet = {
          ...djSet,
          savedAt: Date.now(),
          template,
          exported: false,
        };

        set((state) => ({
          currentSet: savedSet,
          history: [savedSet, ...state.history.slice(0, 19)], // Keep max 20
        }));

        return djSet.id;
      },

      deleteSet: (id) => {
        set((state) => ({
          history: state.history.filter((s) => s.id !== id),
          currentSet: state.currentSet?.id === id ? null : state.currentSet,
        }));
      },

      clearHistory: () => {
        set({ history: [], currentSet: null });
      },

      setGenerating: (isGenerating, generationProgress = '') => {
        set({ isGenerating, generationProgress });
      },

      markExported: (setId, navidromePlaylistId) => {
        set((state) => ({
          history: state.history.map((s) =>
            s.id === setId ? { ...s, exported: true, navidromePlaylistId } : s
          ),
          currentSet:
            state.currentSet?.id === setId
              ? { ...state.currentSet, exported: true, navidromePlaylistId }
              : state.currentSet,
        }));
      },

      getSetById: (id) => {
        return get().history.find((s) => s.id === id);
      },

      getRecentSets: (limit = 10) => {
        return get().history.slice(0, limit);
      },
    }),
    {
      name: 'set-builder-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
