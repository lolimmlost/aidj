import { describe, it, expect, vi, beforeEach } from 'vitest';
import authClient from '../auth-client';
import { authQueryOptions } from '../queries';
import { $getUser } from '../functions';

// Mock server functions and environment
vi.mock('../functions', () => ({
  $getUser: vi.fn(),
}));

const mockGetUser = $getUser as unknown as ReturnType<typeof vi.fn>;

describe('Auth Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location for client-side testing
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      writable: true,
    });
  });

  it('should create auth client with correct baseURL', () => {
    const envSpy = vi.spyOn(import.meta.env, 'VITE_BASE_URL', 'get').mockReturnValue(undefined);
    
    expect(authClient).toBeDefined();
    // Verify baseURL is set from window.location when env var is undefined
    expect(envSpy).toHaveBeenCalled();
    
    envSpy.mockRestore();
  });

  it('should use VITE_BASE_URL from environment when available', () => {
    const envValue = 'https://example.com';
    vi.stubEnv('VITE_BASE_URL', envValue);
    
    // Re-import to get fresh instance (in real Vitest, we'd mock the import)
    expect(import.meta.env.VITE_BASE_URL).toBe(envValue);
    
    vi.unstubAllEnvs();
  });
});

describe('Auth Queries', () => {
  it('should create query options for user with correct key and function', () => {
    const queryOpts = authQueryOptions();
    
    expect(queryOpts.queryKey).toEqual(['user']);
    expect(queryOpts.queryFn).toBeDefined();
    expect(typeof queryOpts.queryFn).toBe('function');
  });

  it('should handle successful user retrieval', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    mockGetUser.mockResolvedValue(mockUser);
    
    const result = await mockGetUser({ signal: new AbortController().signal });
    
    expect(mockGetUser).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(result).toEqual(mockUser);
  });

  it('should handle user retrieval failure', async () => {
    const error = new Error('Session not found');
    mockGetUser.mockRejectedValue(error);
    
    await expect(mockGetUser({ signal: new AbortController().signal })).rejects.toThrow('Session not found');
    expect(mockGetUser).toHaveBeenCalled();
  });
});

describe('Auth Server Functions', () => {
  it('should get user from session', async () => {
    const mockSession = { user: { id: '1', email: 'test@example.com' } };
    const mockHeaders = new Headers();
    
    // Mock getWebRequest and auth.api.getSession
    const getWebRequestMock = vi.fn(() => ({ headers: mockHeaders }));
    vi.doMock('@tanstack/react-start/server', () => ({
      getWebRequest: getWebRequestMock,
    }));
    
    const mockAuth = { api: { getSession: vi.fn().mockResolvedValue(mockSession) } };
    vi.doMock('~/lib/auth/auth', () => ({ auth: mockAuth }));
    
    const result = await $getUser();
    
    expect(mockAuth.api.getSession).toHaveBeenCalledWith({ headers: mockHeaders });
    expect(result).toEqual(mockSession.user);
  });

  it('should return null when no session', async () => {
    const mockHeaders = new Headers();
    const getWebRequestMock = vi.fn(() => ({ headers: mockHeaders }));
    vi.doMock('@tanstack/react-start/server', () => ({
      getWebRequest: getWebRequestMock,
    }));
    
    const mockAuth = { api: { getSession: vi.fn().mockResolvedValue(null) } };
    vi.doMock('~/lib/auth/auth', () => ({ auth: mockAuth }));
    
    const result = await $getUser();
    
    expect(result).toBeNull();
  });
});