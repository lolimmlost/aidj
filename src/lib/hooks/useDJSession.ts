// DJ Session Hook
// Provides access to DJ session state and actions

import { useAudioStore } from '@/lib/stores/audio';
import { getActiveDJSession } from '@/lib/services/dj-service';

export function useDJSession() {
  const {
    djSession,
    djQueue,
    isAutoMixing,
    isTransitioning,
    currentTransition,
    startDJSession,
    endDJSession,
    addToDJQueue,
    removeFromDJQueue,
    getDJRecommendations,
    setAutoMixing,
    autoMixNext,
    completeTransition,
    setCrossfadeEnabled,
    setCrossfadeDuration
  } = useAudioStore();

  // Get active session from service
  const activeSession = getActiveDJSession();

  return {
    djSession: djSession || activeSession,
    queue: djQueue,
    isAutoMixing,
    isTransitioning,
    currentTransition,
    startDJSession,
    endDJSession,
    addToDJQueue,
    removeFromDJQueue,
    getDJRecommendations,
    setAutoMixing,
    autoMixNext,
    completeTransition,
    setCrossfadeEnabled,
    setCrossfadeDuration
  };
}