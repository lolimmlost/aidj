import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { SkipForward } from 'lucide-react';
import { ArtistPicker } from './ArtistPicker';
import { SyncLikedSongs } from './SyncLikedSongs';
import { LastfmImport } from './LastfmImport';

const STEP_LABELS = ['Pick Your Artists', 'Sync Liked Songs', 'Connect Last.fm'];
const TOTAL_STEPS = 3;

interface OnboardingWizardProps {
  initialStep?: number;
}

export function OnboardingWizard({ initialStep = 1 }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const queryClient = useQueryClient();

  const handleSkipAll = useCallback(async () => {
    try {
      await fetch('/api/onboarding/skip', {
        method: 'POST',
        credentials: 'include',
      });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    } catch (err) {
      console.error('Failed to skip onboarding:', err);
    }
  }, [queryClient]);

  const handleStepComplete = useCallback(() => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep]);

  const handleFinish = useCallback(async () => {
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        credentials: 'include',
      });
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    }
  }, [queryClient]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === currentStep;
            const isDone = stepNum < currentStep;
            return (
              <div key={stepNum} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`h-px w-6 ${isDone ? 'bg-primary' : 'bg-border'}`}
                  />
                )}
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isDone
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? '✓' : stepNum}
                </div>
                <span
                  className={`hidden text-sm sm:inline ${
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkipAll}
          className="text-muted-foreground"
        >
          <SkipForward className="mr-1 h-4 w-4" />
          Skip setup
        </Button>
      </div>

      {/* Step Content */}
      {currentStep === 1 && (
        <ArtistPicker onComplete={handleStepComplete} />
      )}
      {currentStep === 2 && (
        <SyncLikedSongs onComplete={handleStepComplete} />
      )}
      {currentStep === 3 && (
        <LastfmImport onComplete={handleFinish} />
      )}
    </div>
  );
}
