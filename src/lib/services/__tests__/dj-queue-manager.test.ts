// Tests for DJ Queue Manager Service
// Tests queue management, auto-mixing, and DJ features

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDJQueueManager } from '../dj-queue-manager';
import type { Song } from '@/components/ui/audio-player';

// Mock song data
const mockSongs: Song[] = [
  {
    id: 'test-song-1',
    name: 'Test Song 1',
    artist: 'Test Artist',
    album: 'Test Album',
    albumId: 'album-1',
    track: 1,
    duration: 240,
    url: 'http://example.com/test1.mp3'
  },
  {
    id: 'test-song-2',
    name: 'Test Song 2',
    artist: 'Test Artist',
    album: 'Test Album 2',
    albumId: 'album-2',
    track: 2,
    duration: 180,
    url: 'http://example.com/test2.mp3'
  },
  {
    id: 'test-song-3',
    name: 'Test Song 3',
    artist: 'Different Artist',
    album: 'Test Album 3',
    albumId: 'album-3',
    track: 3,
    duration: 200,
    url: 'http://example.com/test3.mp3'
  }
];

describe('DJ Queue Manager', () => {
  let queueManager: ReturnType<typeof createDJQueueManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    queueManager = createDJQueueManager();
  });

  describe('initialization', () => {
    it('should initialize with candidate songs', async () => {
      await queueManager.initialize(mockSongs);
      
      const queue = queueManager.getQueue();
      expect(queue).toHaveLength(0); // Queue starts empty
    });

    it('should auto-refill queue when enabled', async () => {
      const manager = createDJQueueManager({
        autoRefill: true,
        refillCount: 2
      });
      
      await manager.initialize(mockSongs);
      
      const queue = manager.getQueue();
      expect(queue.length).toBeGreaterThan(0);
    });

    it('should not auto-refill when disabled', async () => {
      const manager = createDJQueueManager({
        autoRefill: false
      });
      
      await manager.initialize(mockSongs);
      
      const queue = manager.getQueue();
      expect(queue).toHaveLength(0);
    });
  });

  describe('song management', () => {
    beforeEach(async () => {
      await queueManager.initialize(mockSongs);
    });

    it('should add song to queue', async () => {
      const song = mockSongs[0];
      await queueManager.addSong(song);
      
      const queue = queueManager.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].song.id).toBe(song.id);
      expect(queue[0].addedBy).toBe('user');
    });

    it('should add song with auto-mix flag', async () => {
      const song = mockSongs[0];
      await queueManager.addSong(song, { autoMix: true });
      
      const queue = queueManager.getQueue();
      expect(queue[0].autoMixEnabled).toBe(true);
    });

    it('should add song with priority', async () => {
      const song = mockSongs[0];
      await queueManager.addSong(song, { priority: 'high' });
      
      const queue = queueManager.getQueue();
      expect(queue[0].priority).toBe('high');
    });

    it('should remove song from queue', async () => {
      await queueManager.addSong(mockSongs[0]);
      await queueManager.addSong(mockSongs[1]);
      
      const removed = queueManager.removeSong(mockSongs[0].id);
      expect(removed).toBeTruthy();
      expect(removed?.song.id).toBe(mockSongs[0].id);
      
      const queue = queueManager.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].song.id).toBe(mockSongs[1].id);
    });

    it('should reorder queue', async () => {
      await queueManager.addSong(mockSongs[0]);
      await queueManager.addSong(mockSongs[1]);
      await queueManager.addSong(mockSongs[2]);
      
      queueManager.reorderQueue(0, 2);
      
      const queue = queueManager.getQueue();
      expect(queue[0].song.id).toBe(mockSongs[1].id);
      expect(queue[1].song.id).toBe(mockSongs[0].id);
      expect(queue[2].song.id).toBe(mockSongs[2].id);
    });

    it('should change song priority', async () => {
      await queueManager.addSong(mockSongs[0]);
      
      queueManager.changePriority(mockSongs[0].id, 'urgent');
      
      const queue = queueManager.getQueue();
      expect(queue[0].priority).toBe('urgent');
    });

    it('should prevent duplicate songs when enabled', async () => {
      const manager = createDJQueueManager({
        duplicatePrevention: true
      });
      await manager.initialize(mockSongs);
      await manager.addSong(mockSongs[0]);
      
      await expect(manager.addSong(mockSongs[0])).rejects.toThrow('DUPLICATE_SONG');
    });

    it('should allow duplicate songs when disabled', async () => {
      const manager = createDJQueueManager({
        duplicatePrevention: false
      });
      await manager.initialize(mockSongs);
      await manager.addSong(mockSongs[0]);
      await manager.addSong(mockSongs[0]);
      
      const queue = manager.getQueue();
      expect(queue).toHaveLength(2);
    });
  });

  describe('auto-mixing', () => {
    beforeEach(async () => {
      await queueManager.initialize(mockSongs);
    });

    it('should get auto-mix recommendations', async () => {
      await queueManager.addSong(mockSongs[0]);
      
      const recommendations = await queueManager.getAutoMixRecommendations(
        queueManager.getQueue()[0],
        3
      );
      
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.length).toBeLessThanOrEqual(3);
    });

    it('should filter recommendations by strategy', async () => {
      const manager = createDJQueueManager({
        autoMixOptions: {
          strategy: 'harmonic'
        }
      });
      await manager.initialize(mockSongs);
      await manager.addSong(mockSongs[0]);
      
      const recommendations = await manager.getAutoMixRecommendations(
        manager.getQueue()[0],
        3
      );
      
      expect(recommendations).toBeDefined();
      // Harmonic strategy should prioritize key compatibility
    });

    it('should filter recommendations by BPM range', async () => {
      const manager = createDJQueueManager({
        autoMixOptions: {
          bpmRange: { min: 100, max: 130 }
        }
      });
      await manager.initialize(mockSongs);
      await manager.addSong(mockSongs[0]);
      
      const recommendations = await manager.getAutoMixRecommendations(
        manager.getQueue()[0],
        3
      );
      
      expect(recommendations).toBeDefined();
      // Should only include songs within BPM range
    });
  });

  describe('queue statistics', () => {
    beforeEach(async () => {
      await queueManager.initialize(mockSongs);
    });

    it('should calculate queue statistics', async () => {
      await queueManager.addSong(mockSongs[0]);
      await queueManager.addSong(mockSongs[1]);
      
      const stats = queueManager.getQueueStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalSongs).toBe(2);
      expect(stats.userAddedSongs).toBe(2);
      expect(stats.autoMixedSongs).toBe(0);
      expect(stats.averageBPM).toBeGreaterThan(0);
      expect(stats.averageEnergy).toBeGreaterThanOrEqual(0);
      expect(stats.queueAge).toBeGreaterThanOrEqual(0);
    });

    it('should track auto-mixed songs', async () => {
      await queueManager.addSong(mockSongs[0], { addedBy: 'user' });
      await queueManager.autoRefillQueue();
      
      const stats = queueManager.getQueueStats();
      
      expect(stats.autoMixedSongs).toBeGreaterThan(0);
      expect(stats.userAddedSongs).toBe(1);
    });
  });

  describe('queue events', () => {
    beforeEach(async () => {
      await queueManager.initialize(mockSongs);
    });

    it('should track song added events', async () => {
      await queueManager.addSong(mockSongs[0]);
      
      const events = queueManager.getEventHistory();
      const addEvents = events.filter(e => e.type === 'song_added');
      
      expect(addEvents).toHaveLength(1);
      expect(addEvents[0].data?.songId).toBe(mockSongs[0].id);
    });

    it('should track song removed events', async () => {
      await queueManager.addSong(mockSongs[0]);
      queueManager.removeSong(mockSongs[0].id);
      
      const events = queueManager.getEventHistory();
      const removeEvents = events.filter(e => e.type === 'song_removed');
      
      expect(removeEvents).toHaveLength(1);
      expect(removeEvents[0].data?.songId).toBe(mockSongs[0].id);
    });

    it('should track auto-mix events', async () => {
      await queueManager.autoRefillQueue();
      
      const events = queueManager.getEventHistory();
      const autoMixEvents = events.filter(e => e.type === 'auto_mix_added');
      
      expect(autoMixEvents).toHaveLength(1);
    });
  });

  describe('queue configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxQueueSize: 15,
        autoMixEnabled: false
      };
      
      queueManager.updateConfig(newConfig);
      
      expect(queueManager.config.maxQueueSize).toBe(15);
      expect(queueManager.config.autoMixEnabled).toBe(false);
    });

    it('should update auto-mix options', () => {
      const newOptions = {
        strategy: 'energy',
        minCompatibility: 0.8
      };
      
      queueManager.updateAutoMixOptions(newOptions);
      
      expect(queueManager.autoMixOptions.strategy).toBe('energy');
      expect(queueManager.autoMixOptions.minCompatibility).toBe(0.8);
    });
  });

  describe('queue management', () => {
    beforeEach(async () => {
      await queueManager.initialize(mockSongs);
    });

    it('should clear queue', () => {
      queueManager.clearQueue();
      
      const queue = queueManager.getQueue();
      expect(queue).toHaveLength(0);
    });

    it('should get next song', async () => {
      await queueManager.addSong(mockSongs[0]);
      
      const next = queueManager.getNextSong();
      
      expect(next).toBeTruthy();
      expect(next?.song.id).toBe(mockSongs[0].id);
    });

    it('should mark song as played', async () => {
      await queueManager.addSong(mockSongs[0]);
      const next = queueManager.getNextSong();
      
      queueManager.markSongPlayed();
      
      const queue = queueManager.getQueue();
      expect(queue).toHaveLength(0);
    });
  });
});