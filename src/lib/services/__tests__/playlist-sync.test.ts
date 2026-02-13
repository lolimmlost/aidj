import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncNavidromePlaylists, needsSync } from '../playlist-sync';
import * as navidrome from '../navidrome';
import { db } from '@/lib/db';
// Schema imports removed - unused in test file

// Mock the navidrome service
vi.mock('../navidrome', () => ({
  getPlaylists: vi.fn(),
  getPlaylist: vi.fn(),
}));

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    limit: vi.fn(),
  },
}));

describe('Playlist Sync Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncNavidromePlaylists', () => {
    it('should add new playlists from Navidrome', async () => {
      const userId = 'user-123';
      const mockNavidromePlaylists = [
        {
          id: 'nav-pl-1',
          name: 'New Playlist',
          songCount: 10,
          duration: 600,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-01T00:00:00Z',
        },
      ];

      const mockNavidromePlaylistWithSongs = {
        ...mockNavidromePlaylists[0],
        entry: [
          { id: 's1', title: 'Song 1', artist: 'Artist 1', albumId: 'a1', duration: '180', track: '1' },
          { id: 's2', title: 'Song 2', artist: 'Artist 2', albumId: 'a2', duration: '240', track: '2' },
        ],
      };

      // Mock Navidrome API
      vi.mocked(navidrome.getPlaylists).mockResolvedValue(mockNavidromePlaylists);
      vi.mocked(navidrome.getPlaylist).mockResolvedValue(mockNavidromePlaylistWithSongs);

      // Mock empty local playlists
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Mock insert operations
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'local-pl-1' }]),
        }),
      });

      const result = await syncNavidromePlaylists(userId);

      expect(result.added).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(navidrome.getPlaylists).toHaveBeenCalled();
    });

    it('should update existing playlists when song count changes', async () => {
      const userId = 'user-123';
      const mockNavidromePlaylists = [
        {
          id: 'nav-pl-1',
          name: 'Updated Playlist',
          songCount: 15, // Changed from 10
          duration: 900, // Changed from 600
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-02T00:00:00Z',
        },
      ];

      const mockLocalPlaylists = [
        {
          id: 'local-pl-1',
          userId: 'user-123',
          name: 'Updated Playlist',
          navidromeId: 'nav-pl-1',
          songCount: 10,
          totalDuration: 600,
          lastSynced: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      const mockNavidromePlaylistWithSongs = {
        ...mockNavidromePlaylists[0],
        entry: [
          { id: 's1', title: 'Song 1', artist: 'Artist 1', albumId: 'a1', duration: '180', track: '1' },
        ],
      };

      vi.mocked(navidrome.getPlaylists).mockResolvedValue(mockNavidromePlaylists);
      vi.mocked(navidrome.getPlaylist).mockResolvedValue(mockNavidromePlaylistWithSongs);

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockLocalPlaylists),
        }),
      });

      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const result = await syncNavidromePlaylists(userId);

      expect(result.added).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should mark playlists as deleted when removed from Navidrome', async () => {
      const userId = 'user-123';
      const mockNavidromePlaylists: never[] = []; // No playlists in Navidrome

      const mockLocalPlaylists = [
        {
          id: 'local-pl-1',
          userId: 'user-123',
          name: 'Deleted Playlist',
          navidromeId: 'nav-pl-1',
          songCount: 10,
          totalDuration: 600,
          lastSynced: new Date('2024-01-01T00:00:00Z'),
          description: 'A playlist',
        },
      ];

      vi.mocked(navidrome.getPlaylists).mockResolvedValue(mockNavidromePlaylists);

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockLocalPlaylists),
        }),
      });

      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await syncNavidromePlaylists(userId);

      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(db.update).toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue syncing', async () => {
      const userId = 'user-123';
      const mockNavidromePlaylists = [
        {
          id: 'nav-pl-1',
          name: 'Good Playlist',
          songCount: 10,
          duration: 600,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-01T00:00:00Z',
        },
        {
          id: 'nav-pl-2',
          name: 'Error Playlist',
          songCount: 5,
          duration: 300,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(navidrome.getPlaylists).mockResolvedValue(mockNavidromePlaylists);

      // First playlist succeeds, second fails
      vi.mocked(navidrome.getPlaylist)
        .mockResolvedValueOnce({
          ...mockNavidromePlaylists[0],
          entry: [],
        })
        .mockRejectedValueOnce(new Error('Failed to fetch playlist'));

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'local-pl-1' }]),
        }),
      });

      const result = await syncNavidromePlaylists(userId);

      expect(result.added).toBe(1); // First playlist added successfully
      expect(result.errors).toHaveLength(1); // Second playlist had error
      expect(result.errors[0]).toContain('Error Playlist');
    });

    it('should throw error when Navidrome is unavailable', async () => {
      const userId = 'user-123';

      vi.mocked(navidrome.getPlaylists).mockRejectedValue(new Error('Network error'));

      await expect(syncNavidromePlaylists(userId)).rejects.toThrow('Playlist sync failed');
    });
  });

  describe('needsSync', () => {
    it('should return true when song count changed', async () => {
      const playlistId = 'local-pl-1';

      const mockLocalPlaylist = {
        id: 'local-pl-1',
        navidromeId: 'nav-pl-1',
        songCount: 10,
      };

      const mockNavidromePlaylists = [
        {
          id: 'nav-pl-1',
          name: 'Test Playlist',
          songCount: 15, // Changed
          duration: 900,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-02T00:00:00Z',
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLocalPlaylist]),
          }),
        }),
      });

      vi.mocked(navidrome.getPlaylists).mockResolvedValue(mockNavidromePlaylists);

      const result = await needsSync(playlistId);

      expect(result).toBe(true);
    });

    it('should return true when playlist deleted in Navidrome', async () => {
      const playlistId = 'local-pl-1';

      const mockLocalPlaylist = {
        id: 'local-pl-1',
        navidromeId: 'nav-pl-1',
        songCount: 10,
      };

      const mockNavidromePlaylists: never[] = []; // Playlist not in Navidrome

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLocalPlaylist]),
          }),
        }),
      });

      vi.mocked(navidrome.getPlaylists).mockResolvedValue(mockNavidromePlaylists);

      const result = await needsSync(playlistId);

      expect(result).toBe(true);
    });

    it('should return false when playlist is not a Navidrome playlist', async () => {
      const playlistId = 'local-pl-1';

      const mockLocalPlaylist = {
        id: 'local-pl-1',
        navidromeId: null, // Local-only playlist
        songCount: 10,
      };

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLocalPlaylist]),
          }),
        }),
      });

      const result = await needsSync(playlistId);

      expect(result).toBe(false);
    });

    it('should return false when song count unchanged', async () => {
      const playlistId = 'local-pl-1';

      const mockLocalPlaylist = {
        id: 'local-pl-1',
        navidromeId: 'nav-pl-1',
        songCount: 10,
      };

      const mockNavidromePlaylists = [
        {
          id: 'nav-pl-1',
          name: 'Test Playlist',
          songCount: 10, // Same
          duration: 600,
          owner: 'testuser',
          public: false,
          created: '2024-01-01T00:00:00Z',
          changed: '2024-01-01T00:00:00Z',
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockLocalPlaylist]),
          }),
        }),
      });

      vi.mocked(navidrome.getPlaylists).mockResolvedValue(mockNavidromePlaylists);

      const result = await needsSync(playlistId);

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const playlistId = 'local-pl-1';

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('Database error')),
          }),
        }),
      });

      const result = await needsSync(playlistId);

      expect(result).toBe(false); // Returns false on error
    });
  });
});
