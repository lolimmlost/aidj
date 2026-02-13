import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../feedback';

// Mock dependencies
vi.mock('~/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('~/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
  },
}));

// Import after mocks
import { auth } from '~/lib/auth/auth';
import { db } from '~/lib/db';

const mockGetSession = vi.mocked(auth.api.getSession);
const mockDb = vi.mocked(db);

describe('GET /api/recommendations/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetSession.mockResolvedValue(null);

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback?songIds=song1,song2', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('returns feedback data when user is authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      // Mock database response
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() =>
            Promise.resolve([
              { songId: 'song1', feedbackType: 'thumbs_up' },
              { songId: 'song2', feedbackType: 'thumbs_down' },
            ])
          ),
        })),
      });

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback?songIds=song1,song2', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        feedback: {
          song1: 'thumbs_up',
          song2: 'thumbs_down',
        },
      });
    });
  });

  describe('Query Parameter Validation', () => {
    it('returns 400 when songIds parameter is missing', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({
        code: 'MISSING_SONG_IDS',
        message: 'songIds query parameter is required',
      });
    });

    it('returns 400 when songIds parameter is empty', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback?songIds=', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({
        code: 'MISSING_SONG_IDS',
        message: 'songIds query parameter is required',
      });
    });
  });

  describe('Feedback Data Retrieval', () => {
    it('returns empty feedback map when no feedback exists', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      // Mock database response with no results
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      });

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback?songIds=song1,song2', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        feedback: {},
      });
    });

    it('filters feedback by user ID', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      // Mock database response
      const mockWhere = vi.fn(() =>
        Promise.resolve([{ songId: 'song1', feedbackType: 'thumbs_up' }])
      );

      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn(() => ({
          where: mockWhere,
        })),
      });

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback?songIds=song1', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(200);
      expect(mockWhere).toHaveBeenCalled();
    });

    it('handles multiple song IDs with mixed feedback', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      // Mock database response with mixed feedback
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() =>
            Promise.resolve([
              { songId: 'song1', feedbackType: 'thumbs_up' },
              { songId: 'song2', feedbackType: 'thumbs_down' },
              { songId: 'song3', feedbackType: 'thumbs_up' },
            ])
          ),
        })),
      });

      const mockRequest = new Request(
        'http://localhost:3000/api/recommendations/feedback?songIds=song1,song2,song3,song4',
        {
          method: 'GET',
        }
      );

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        feedback: {
          song1: 'thumbs_up',
          song2: 'thumbs_down',
          song3: 'thumbs_up',
        },
      });
      // Note: song4 has no feedback, so it shouldn't appear in the map
    });

    it('ignores null songId values', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      // Mock database response with null songId
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() =>
            Promise.resolve([
              { songId: 'song1', feedbackType: 'thumbs_up' },
              { songId: null, feedbackType: 'thumbs_down' }, // Should be ignored
            ])
          ),
        })),
      });

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback?songIds=song1', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        feedback: {
          song1: 'thumbs_up',
          // null songId should not appear
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when database query fails', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
        session: {
          id: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-123',
          expiresAt: new Date(Date.now() + 3600000),
          token: 'test-token',
        },
      };

      mockGetSession.mockResolvedValue(mockSession);

      // Mock database error
      (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.reject(new Error('Database connection failed'))),
        })),
      });

      const mockRequest = new Request('http://localhost:3000/api/recommendations/feedback?songIds=song1', {
        method: 'GET',
      });

      const response = await GET({ request: mockRequest });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({
        code: 'FEEDBACK_FETCH_ERROR',
        message: 'Database connection failed',
      });
    });
  });
});
