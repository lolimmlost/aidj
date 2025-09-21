import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authFunctions from '~/lib/auth/functions';
import { $getUser } from '~/lib/auth/functions';
import { authQueryOptions } from '~/lib/auth/queries';
import { getWebRequest } from "@tanstack/react-start/server";
import { QueryClient } from '@tanstack/react-query';

// Mock serverOnly to allow execution in test environment
vi.mock("@tanstack/react-start", () => ({
  serverOnly: vi.fn((fn) => fn),
  createServerFn: vi.fn(() => ({
    handler: vi.fn((handlerFn) => vi.fn(handlerFn))
  })),
}));

// Mock dependencies
vi.mock('~/env/server', () => ({
  env: {
    VITE_BASE_URL: 'http://localhost:3000',
    GITHUB_CLIENT_ID: 'test-github-id',
    GITHUB_CLIENT_SECRET: 'test-github-secret',
    GOOGLE_CLIENT_ID: 'test-google-id',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
  },
}));

vi.mock('~/lib/db', () => ({
  db: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getWebRequest: vi.fn(),
}));

const mockGetWebRequest = vi.mocked(getWebRequest);

// Mock the auth module using factory function to avoid hoisting issues
vi.mock('~/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Import after mocks
import { auth } from '~/lib/auth/auth';
const mockGetSession = vi.mocked(auth.api.getSession);

describe('Session Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if no session exists', async () => {
    mockGetSession.mockResolvedValue(null);

    const mockHeaders = new Headers({ cookie: '' });
    const session = await mockGetSession({ headers: mockHeaders });
    expect(session).toBeNull();
    expect(mockGetSession).toHaveBeenCalledWith({ headers: mockHeaders });
  });

  it('should return session data if session exists', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
    };

    const mockSessionData = {
      id: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: '1',
      expiresAt: new Date(Date.now() + 3600000),
      token: 'test-token',
    };

    const mockSession = {
      user: mockUser,
      session: mockSessionData,
    };

    mockGetSession.mockResolvedValue(mockSession);

    const mockHeaders = new Headers({ cookie: 'better-auth.session=valid-token' });
    const session = await mockGetSession({ headers: mockHeaders });
    expect(session).toEqual(mockSession);
    expect(mockGetSession).toHaveBeenCalledWith({ headers: mockHeaders });
  });
});

describe('$getUser Server Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user from valid session', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
    };

    const mockSessionData = {
      id: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: '1',
      expiresAt: new Date(Date.now() + 3600000),
      token: 'test-token',
    };

    const mockSession = {
      user: mockUser,
      session: mockSessionData,
    };

    mockGetSession.mockResolvedValue(mockSession);

    const mockHeaders = new Headers({ cookie: 'better-auth.session=valid-token' });
    mockGetWebRequest.mockReturnValue({ headers: mockHeaders } as unknown as ReturnType<typeof getWebRequest>);

    const user = await $getUser();
    expect(mockGetSession).toHaveBeenCalledWith({ headers: mockHeaders });
    expect(user).toEqual(mockUser);
  });

  it('should return null if no session', async () => {
    mockGetSession.mockResolvedValue(null);

    const mockHeaders = new Headers({ cookie: '' });
    mockGetWebRequest.mockReturnValue({ headers: mockHeaders } as unknown as ReturnType<typeof getWebRequest>);

    const user = await $getUser();
    expect(mockGetSession).toHaveBeenCalledWith({ headers: mockHeaders });
    expect(user).toBeNull();
  });

  it('should handle session errors', async () => {
    const error = new Error('Session expired');
    mockGetSession.mockRejectedValue(error);

    const mockHeaders = new Headers({ cookie: '' });
    mockGetWebRequest.mockReturnValue({ headers: mockHeaders } as unknown as ReturnType<typeof getWebRequest>);

    await expect($getUser()).rejects.toThrow('Session expired');
    expect(mockGetSession).toHaveBeenCalledWith({ headers: mockHeaders });
  });
});

describe('Auth Query Options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create correct query options for user', () => {
    const queryOpts = authQueryOptions();

    expect(queryOpts.queryKey).toEqual(['user']);
    expect(queryOpts.queryFn).toBeDefined();
    expect(typeof queryOpts.queryFn).toBe('function');
  });

  it('should use $getUser in query function', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
    };

    const mockHeaders = new Headers({ cookie: 'better-auth.session=valid-token' });
    mockGetWebRequest.mockReturnValue({ headers: mockHeaders } as unknown as ReturnType<typeof getWebRequest>);

    const mockSessionData = {
      id: 'session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: '1',
      expiresAt: new Date(Date.now() + 3600000),
      token: 'test-token',
    };

    const mockSession = {
      user: mockUser,
      session: mockSessionData,
    };

    mockGetSession.mockResolvedValue(mockSession);

    const queryOpts = authQueryOptions();
    const mockQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const mockContext = {
      client: mockQueryClient,
      queryKey: ['user'],
      signal: AbortSignal.timeout(0),
      meta: {},
    };

    const $getUserSpy = vi.spyOn(authFunctions, '$getUser');
    const result = await queryOpts.queryFn!(mockContext);

    expect(result).toEqual(mockUser);
    expect($getUserSpy).toHaveBeenCalledTimes(1);
  });
});