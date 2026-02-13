# Audio Player UX Specification

## Overview

This document outlines the unified design system and user experience guidelines for the audio player components in the application. The goal is to create a cohesive, intuitive, and accessible audio playback experience across all touchpoints.

## Related Decisions

- [Queue UI Pattern Decision](./decisions/queue-ui-pattern-decision.md) - Mobile queue interaction pattern evaluation

## Design Philosophy

### Core Principles

1. **Consistency First**: All audio components share the same visual language, interaction patterns, and behavior
2. **Progressive Enhancement**: Basic functionality works everywhere, enhanced features layer on top
3. **Accessibility by Default**: All interactions are keyboard-navigable and screen-reader friendly
4. **Mobile-First Responsive**: Design works seamlessly on all screen sizes
5. **Contextual Awareness**: Interface adapts based on user behavior and preferences

## Design System

### Color Palette

```css
/* Primary Colors */
--audio-primary: hsl(var(--primary));
--audio-primary-foreground: hsl(var(--primary-foreground));

/* Accent Colors */
--audio-accent: hsl(var(--accent));
--audio-accent-foreground: hsl(var(--accent-foreground));

/* State Colors */
--audio-playing: hsl(142, 76%, 36%); /* Green */
--audio-playing-foreground: hsl(0, 0%, 98%); /* White */
--audio-ai: hsl(262, 83%, 58%); /* Purple */
--audio-ai-foreground: hsl(0, 0%, 98%); /* White */
--audio-queue: hsl(217, 91%, 60%); /* Blue */
--audio-queue-foreground: hsl(0, 0%, 98%); /* White */

/* Subtle Backgrounds */
--audio-ai-subtle: hsl(262, 83%, 58%/0.1);
--audio-queue-subtle: hsl(217, 91%, 60%/0.1);
```

### Typography Scale

```css
--audio-text-xs: 0.75rem;    /* 12px */
--audio-text-sm: 0.875rem;   /* 14px */
--audio-text-base: 1rem;     /* 16px */
--audio-text-lg: 1.125rem;   /* 18px */
--audio-text-xl: 1.25rem;     /* 20px */
```

### Spacing System

```css
--audio-space-xs: 0.25rem;   /* 4px */
--audio-space-sm: 0.5rem;    /* 8px */
--audio-space-md: 0.75rem;   /* 12px */
--audio-space-lg: 1rem;      /* 16px */
--audio-space-xl: 1.5rem;    /* 24px */
--audio-space-xxl: 2rem;    /* 32px */
```

### Border Radius

```css
--audio-radius-sm: 0.25rem;  /* 4px */
--audio-radius-md: 0.375rem; /* 6px */
--audio-radius-lg: 0.5rem;   /* 8px */
--audio-radius-full: 9999px;
```

## Component Specifications

### Audio Button Component

#### Variants
- **Primary**: Main action buttons (play/pause)
- **Secondary**: Standard controls (skip, volume)
- **Ghost**: Subtle actions (like, add to playlist)
- **Playing**: Active state for play button
- **AI**: AI-specific actions

#### Sizes
- **Small**: 32×32px (compact controls)
- **Medium**: 40×40px (standard controls)
- **Large**: 48×48px (primary play button)

#### Behavior
- Hover state: 20% darker background
- Active state: Ring effect (2px, primary color)
- Loading state: Spinning indicator
- Disabled state: 50% opacity

#### Accessibility
- Minimum touch target: 44×44px
- Keyboard focus: Visible ring
- Screen reader: Descriptive labels

### Progress Bar Component

#### States
- **Default**: Inactive track
- **Active**: Playing with progress
- **Loading**: Buffering indicator
- **Error**: Error state

#### Interaction
- Click to seek
- Drag to scrub
- Keyboard: Arrow keys (±5s), Shift+Arrow (±30s)

#### Information Display
- Current time / Total duration
- Percentage complete
- Buffer status (when applicable)

### Volume Control

#### Visual Design
- Slider: Horizontal, 100px width
- Icon: Mute/unmute toggle
- Label: Optional percentage display

#### Interaction
- Click mute toggle: 0% ↔ 50%
- Drag slider: 0-100%
- Keyboard: Arrow keys (±5%), Shift+Arrow (±20%)

### Song Information Display

#### Layout Options
- **Compact**: Artwork + title + artist
- **Expanded**: Artwork + title + artist + album + controls

#### Artwork
- Default: Gradient with artist initials
- Playing: Animated pulse effect
- Size: 48×48px (standard), 40×40px (compact)

#### Text Hierarchy
- Title: Font weight 600, truncate
- Artist: Font weight 400, muted color, truncate
- Album: Font weight 400, smaller size, truncate

### Status Indicators

#### Types
- **Playing**: Green background, play icon
- **Paused**: Gray background, pause icon
- **Loading**: Yellow background, spinner icon
- **Error**: Red background, warning icon
- **AI Active**: Purple background, sparkle icon

#### Placement
- Inline with controls
- Badge format with count when applicable

## Layout Patterns

### Mobile Layout (< 768px)

#### Structure
1. **Error Display** (when applicable)
2. **Song Info + Controls** (horizontal)
3. **Progress Bar** (full width, compact)
4. **AI DJ Toggle** (full width)

#### Spacing
- Vertical rhythm: 12px between sections
- Horizontal padding: 16px
- Touch targets: Minimum 44px

### Desktop Layout (≥ 768px)

#### Structure
1. **Left**: Song information
2. **Center**: Playback controls
3. **Right**: Progress + volume + AI DJ

#### Proportions
- Song info: 40% width
- Controls: 20% width (centered)
- Settings: 40% width

## AI DJ Integration

### Visual Indicators

#### Status States
- **Inactive**: Grayed out toggle
- **Active**: Purple toggle with sparkle
- **Loading**: Spinning indicator
- **Error**: Red indicator with retry option

#### Queue Integration
- AI-added songs: Purple background, sparkle icon
- Count badge: Number of AI songs
- Time indicator: Last added timestamp

### User Controls

#### Toggle Switch
- Compact: Small switch in audio player
- Expanded: Large card with status and settings

#### Feedback Mechanisms
- Success toast: "✨ AI DJ added X songs"
- Error toast: "⚠️ AI DJ failed" with retry
- Loading indicator: Spinner with status text

## Interaction Patterns

### Playback Controls

#### Play/Pause
- Single tap: Toggle play/pause
- Space key: Toggle play/pause
- Media keys: Play/pause

#### Skip Controls
- Previous: Restart current song or go to previous
- Next: Go to next song in queue
- Keyboard: Arrow keys, Media keys

#### Seeking
- Click progress bar: Jump to position
- Drag progress bar: Scrub through track
- Keyboard: Arrow keys (±5s), Shift+Arrow (±30s)

### Queue Management

#### Reordering
- Drag and drop: Reorder songs
- Keyboard: Accessible reordering
- Visual feedback: Ghost item during drag

#### Removal
- Hover reveal: Delete button appears
- Swipe gesture: Remove on mobile
- Keyboard: Delete key when focused

### Volume Control

#### Mute Toggle
- Click icon: Mute/unmute
- Keyboard: M key

#### Slider Adjustment
- Drag slider: Fine control
- Click track: Jump to level
- Keyboard: Arrow keys (±5%), Shift+Arrow (±20%)

## Accessibility Guidelines

### Keyboard Navigation

#### Tab Order
1. Previous button
2. Play/pause button
3. Next button
4. Progress bar
5. Volume slider
6. Song information
7. Like button
8. Queue button
9. AI DJ toggle

#### Key Bindings
- Space: Play/pause
- Arrow Left/Right: Seek ±5s
- Shift + Arrow: Seek ±30s
- Arrow Up/Down: Volume ±5%
- M: Mute/unmute
- L: Like/unlike current song
- Q: Toggle queue
- A: Toggle AI DJ

### Screen Reader Support

#### Announcements
- Song changes: "Now playing [title] by [artist]"
- Status changes: "Playing", "Paused", "Loading"
- Errors: "Audio error: [message]"
- AI DJ status: "AI DJ [status]"

#### Labels
- All controls have descriptive labels
- Progress bar includes time information
- Volume includes percentage
- Status includes contextual information

## Responsive Behavior

### Breakpoints
- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: ≥ 1024px

### Adaptive Features
- Touch targets: Larger on mobile
- Layout: Stacked on mobile, horizontal on desktop
- Information density: Reduced on smaller screens
- Gesture support: Swipe actions on mobile

## Performance Considerations

### Optimization Strategies
- Lazy loading: Queue items beyond viewport
- Throttled updates: Progress bar (60fps max)
- Debounced interactions: Volume changes, seeking
- Efficient rendering: Virtualization for large queues

### Loading States
- Immediate feedback: Visual response within 100ms
- Progress indication: Loading spinners for async actions
- Graceful degradation: Basic functionality during loading

## Error Handling

### Error Types
- **Network**: Connection issues, timeouts
- **Audio**: Unsupported formats, playback errors
- **Permission**: Browser restrictions
- **Service**: API failures, server errors

### Recovery Strategies
- Auto-retry: Transient network errors
- Fallback: Alternative sources when available
- User guidance: Clear error messages with actions
- Graceful degradation: Basic functionality remains

## Animation Guidelines

### Micro-interactions
- Button press: 150ms ease-out
- Hover states: 200ms ease-in-out
- Loading spinners: 1s linear rotation
- Status changes: 300ms ease-in-out

### Transitions
- Layout changes: 200ms ease-in-out
- State changes: 150ms ease-out
- Enter/exit: 300ms ease-in-out

### Performance
- GPU acceleration: Transform and opacity
- Reduced motion: Respect user preferences
- Frame rate: 60fps target for animations

## Testing Requirements

### Functional Testing
- All controls work as expected
- Keyboard navigation complete
- Screen reader announcements accurate
- Touch gestures responsive
- Error states handled gracefully

### Usability Testing
- First-time user comprehension
- Efficiency of common tasks
- Error recovery success rate
- Accessibility compliance
- Cross-browser compatibility

### Performance Testing
- Load time under 2 seconds
- Smooth 60fps animations
- Memory usage within limits
- Network usage optimized