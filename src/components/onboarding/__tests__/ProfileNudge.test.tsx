import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileNudge } from '../ProfileNudge';

describe('ProfileNudge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nudge card', () => {
    const onStartWizard = vi.fn();
    render(<ProfileNudge onStartWizard={onStartWizard} />);
    expect(screen.getByText('Complete your profile')).toBeDefined();
    expect(screen.getByText('Set up')).toBeDefined();
  });

  it('calls onStartWizard when Set up clicked', () => {
    const onStartWizard = vi.fn();
    render(<ProfileNudge onStartWizard={onStartWizard} />);
    fireEvent.click(screen.getByText('Set up'));
    expect(onStartWizard).toHaveBeenCalledOnce();
  });

  it('dismisses when X clicked and persists to localStorage', () => {
    const onStartWizard = vi.fn();
    render(<ProfileNudge onStartWizard={onStartWizard} />);
    const dismissButton = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissButton);
    expect(screen.queryByText('Complete your profile')).toBeNull();
    expect(localStorage.getItem('aidj-profile-nudge-dismissed')).toBe('true');
  });

  it('does not render if previously dismissed', () => {
    localStorage.setItem('aidj-profile-nudge-dismissed', 'true');
    const onStartWizard = vi.fn();
    render(<ProfileNudge onStartWizard={onStartWizard} />);
    expect(screen.queryByText('Complete your profile')).toBeNull();
  });
});
