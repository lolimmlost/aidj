import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useQuery
const mockUseQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

import { useOnboardingStatus } from '../useOnboardingStatus';

describe('useOnboardingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return isNewUser=true when user has no data and onboarding not completed', () => {
    mockUseQuery.mockReturnValue({
      data: {
        onboardingCompleted: false,
        onboardingSkipped: false,
        currentStep: 1,
        dataMaturity: {
          listeningHistoryCount: 0,
          artistAffinityCount: 0,
          feedbackCount: 0,
          hasLikedSongs: false,
          hasLastfmImport: false,
        },
      },
      isLoading: false,
    });

    const result = useOnboardingStatus();

    expect(result.isNewUser).toBe(true);
    expect(result.onboardingCompleted).toBe(false);
    expect(result.currentStep).toBe(1);
  });

  it('should return isNewUser=false when user has listening history', () => {
    mockUseQuery.mockReturnValue({
      data: {
        onboardingCompleted: false,
        onboardingSkipped: false,
        currentStep: 1,
        dataMaturity: {
          listeningHistoryCount: 15,
          artistAffinityCount: 0,
          feedbackCount: 0,
          hasLikedSongs: false,
          hasLastfmImport: false,
        },
      },
      isLoading: false,
    });

    const result = useOnboardingStatus();

    expect(result.isNewUser).toBe(false);
  });

  it('should return isNewUser=false when user has artist affinities', () => {
    mockUseQuery.mockReturnValue({
      data: {
        onboardingCompleted: false,
        onboardingSkipped: false,
        currentStep: 1,
        dataMaturity: {
          listeningHistoryCount: 0,
          artistAffinityCount: 5,
          feedbackCount: 0,
          hasLikedSongs: false,
          hasLastfmImport: false,
        },
      },
      isLoading: false,
    });

    const result = useOnboardingStatus();

    expect(result.isNewUser).toBe(false);
  });

  it('should return isNewUser=false when onboarding is completed', () => {
    mockUseQuery.mockReturnValue({
      data: {
        onboardingCompleted: true,
        onboardingSkipped: false,
        currentStep: 3,
        dataMaturity: {
          listeningHistoryCount: 0,
          artistAffinityCount: 0,
          feedbackCount: 0,
          hasLikedSongs: false,
          hasLastfmImport: false,
        },
      },
      isLoading: false,
    });

    const result = useOnboardingStatus();

    expect(result.isNewUser).toBe(false);
    expect(result.onboardingCompleted).toBe(true);
  });

  it('should return isNewUser=false when onboarding is skipped', () => {
    mockUseQuery.mockReturnValue({
      data: {
        onboardingCompleted: false,
        onboardingSkipped: true,
        currentStep: 1,
        dataMaturity: {
          listeningHistoryCount: 0,
          artistAffinityCount: 0,
          feedbackCount: 0,
          hasLikedSongs: false,
          hasLastfmImport: false,
        },
      },
      isLoading: false,
    });

    const result = useOnboardingStatus();

    expect(result.isNewUser).toBe(false);
  });

  it('should return isNewUser=false while loading', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const result = useOnboardingStatus();

    expect(result.isNewUser).toBe(false);
    expect(result.isLoading).toBe(true);
  });

  it('should use correct query key and staleTime', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    useOnboardingStatus();

    const queryConfig = mockUseQuery.mock.calls[0][0];
    expect(queryConfig.queryKey).toEqual(['onboarding-status']);
    expect(queryConfig.staleTime).toBe(60_000);
  });

  it('should return defaults when data is undefined', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    const result = useOnboardingStatus();

    expect(result.onboardingCompleted).toBe(false);
    expect(result.dataMaturity).toBeNull();
    expect(result.currentStep).toBe(1);
  });
});
