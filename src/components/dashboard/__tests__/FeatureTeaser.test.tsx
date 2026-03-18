import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureTeaser } from '../FeatureTeaser';
import { Sparkles } from 'lucide-react';

describe('FeatureTeaser', () => {
  it('renders title and description', () => {
    render(
      <FeatureTeaser
        title="AI Recommendations"
        description="Discover new songs"
        icon={Sparkles}
        progress={12}
        total={30}
        locked={true}
      />
    );
    expect(screen.getByText('AI Recommendations')).toBeDefined();
    expect(screen.getByText('Discover new songs')).toBeDefined();
  });

  it('shows progress when locked', () => {
    render(
      <FeatureTeaser
        title="Test"
        description="Test desc"
        icon={Sparkles}
        progress={12}
        total={30}
        locked={true}
      />
    );
    expect(screen.getByText('12/30 plays')).toBeDefined();
    expect(screen.getByText('Play more to unlock')).toBeDefined();
  });

  it('hides progress when not locked', () => {
    render(
      <FeatureTeaser
        title="Test"
        description="Test desc"
        icon={Sparkles}
        progress={30}
        total={30}
        locked={false}
      />
    );
    expect(screen.queryByText('Play more to unlock')).toBeNull();
  });
});
