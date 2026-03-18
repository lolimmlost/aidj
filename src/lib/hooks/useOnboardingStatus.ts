import { useQuery } from '@tanstack/react-query';
import type { OnboardingStatusResponse } from '@/lib/constants/onboarding';

export function useOnboardingStatus() {
  const { data, isLoading } = useQuery<OnboardingStatusResponse>({
    queryKey: ['onboarding-status'],
    queryFn: async () => {
      const res = await fetch('/api/onboarding/status', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch onboarding status');
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });

  const isNewUser =
    !isLoading &&
    !!data &&
    data.dataMaturity.listeningHistoryCount === 0 &&
    data.dataMaturity.artistAffinityCount === 0 &&
    !data.onboardingCompleted &&
    !data.onboardingSkipped;

  return {
    isNewUser,
    onboardingCompleted: data?.onboardingCompleted ?? false,
    dataMaturity: data?.dataMaturity ?? null,
    currentStep: data?.currentStep ?? 1,
    isLoading,
  };
}
