# DJ Features Testing Guide

This guide provides comprehensive instructions on how to test all the DJ features that have been implemented in your music application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Running Tests](#running-tests)
3. [Manual Testing Guide](#manual-testing-guide)
4. [Component Testing](#component-testing)
5. [Service Testing](#service-testing)
6. [Integration Testing](#integration-testing)
7. [Performance Testing](#performance-testing)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

Before testing the DJ features, ensure you have:

1. **Node.js and npm** installed (version 16 or higher)
2. **A running music library** with songs that have metadata
3. **Audio files** in your library for testing audio analysis
4. **Modern browser** with Web Audio API support (Chrome, Firefox, Safari, Edge)

### Setup Commands

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Running Tests

### Automated Tests

The DJ features include comprehensive test suites that can be run automatically:

```bash
# Run all DJ-related tests
npm test -- --grep "DJ|dj|audio|mix|transition|harmonic|energy|queue"

# Run specific test files
npm test src/lib/services/__tests__/audio-analysis.test.ts
npm test src/lib/services/__tests__/dj-queue-manager.test.ts

# Run tests with coverage
npm run test:coverage -- src/lib/services/__tests__/
```

### Test Coverage Areas

- **Audio Analysis**: BPM detection, key detection, energy analysis
- **DJ Mixer**: Compatibility calculations, transition planning
- **Queue Manager**: Auto-mixing, priority management, statistics
- **Transition Effects**: Effect processing, crossfading algorithms
- **Harmonic Mixing**: Key compatibility, Circle of Fifths calculations
- **Web Audio Processing**: Buffer analysis, real-time processing

## Manual Testing Guide

### 1. Testing Audio Analysis

#### How to Test:

1. Navigate to your music library
2. Select a song with complete metadata
3. Open browser developer tools
4. Run the following code in the console:

```javascript
// Test audio analysis
import { AudioAnalysisService } from './src/lib/services/audio-analysis.js';

const audioService = new AudioAnalysisService();

// Test with a sample song
const testSong = {
  id: 'test-song-1',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  duration: 240, // 4 minutes
  genre: 'Electronic',
  year: 2023
};

// Analyze the song
audioService.analyzeSong(testSong).then(result => {
  console.log('Audio Analysis Result:', result);
  console.log('BPM:', result.bpm);
  console.log('Key:', result.key);
  console.log('Energy:', result.energy);
  console.log('Danceability:', result.danceability);
});
```

#### Expected Results:

- BPM should be between 60-200 for most music
- Key should be a valid musical key (e.g., "C Major", "A Minor")
- Energy should be between 0-1
- Danceability should be between 0-1

### 2. Testing DJ Mixer Compatibility

#### How to Test:

```javascript
import { DJMixerService } from './src/lib/services/dj-mixer.js';

const djMixer = new DJMixerService();

// Test song compatibility
const song1 = {
  id: 'song-1',
  title: 'Song 1',
  artist: 'Artist 1',
  bpm: 128,
  key: 'C Major',
  energy: 0.8,
  genre: 'Electronic'
};

const song2 = {
  id: 'song-2',
  title: 'Song 2',
  artist: 'Artist 2',
  bpm: 124,
  key: 'G Major',
  energy: 0.7,
  genre: 'Electronic'
};

// Check compatibility
const compatibility = djMixer.calculateCompatibility(song1, song2);
console.log('Compatibility Score:', compatibility.score);
console.log('BPM Compatibility:', compatibility.bpmCompatibility);
console.log('Key Compatibility:', compatibility.keyCompatibility);
console.log('Recommended Transition:', compatibility.recommendedTransition);
```

#### Expected Results:

- Compatibility score should be between 0-1
- Higher scores indicate better mixing potential
- Recommended transition should match the song characteristics

### 3. Testing Queue Management

#### How to Test:

```javascript
import { DJQueueManager } from './src/lib/services/dj-queue-manager.js';

const queueManager = new DJQueueManager();

// Initialize with test songs
const testSongs = [
  { id: '1', title: 'Song 1', artist: 'Artist 1', bpm: 128, key: 'C Major', energy: 0.8 },
  { id: '2', title: 'Song 2', artist: 'Artist 2', bpm: 124, key: 'G Major', energy: 0.7 },
  { id: '3', title: 'Song 3', artist: 'Artist 3', bpm: 130, key: 'A Minor', energy: 0.9 }
];

// Initialize queue
queueManager.initializeQueue(testSongs);

// Test auto-mixing
const autoMixResult = queueManager.autoMix('harmonic');
console.log('Auto-mix Result:', autoMixResult);

// Get queue statistics
const stats = queueManager.getQueueStatistics();
console.log('Queue Statistics:', stats);
```

#### Expected Results:

- Queue should be properly initialized with songs
- Auto-mixing should reorder songs based on the selected strategy
- Statistics should show BPM range, key distribution, energy levels

### 4. Testing Transition Effects

#### How to Test:

```javascript
import { TransitionEffectsService } from './src/lib/services/transition-effects.js';

const transitionService = new TransitionEffectsService();

// Test transition compatibility
const transition = transitionService.calculateTransitionParameters(
  song1, // from song
  song2, // to song
  'crossfade' // transition type
);

console.log('Transition Parameters:', transition);

// Test audio buffer processing (requires actual audio buffer)
// This would need real audio data in a production environment
```

#### Expected Results:

- Transition parameters should include duration, curve type, and effect settings
- Different transition types should have different parameters
- Parameters should be appropriate for the song characteristics

## Component Testing

### DJ Mixer Interface

1. **Navigate to the DJ Mixer page** (if implemented in your routing)
2. **Test the following features:**

#### Deck Controls:
- Play/pause functionality
- Crossfader movement
- EQ controls (high, mid, low)
- Pitch/tempo adjustment
- Volume controls

#### Visualization:
- Waveform display should update with audio
- Spectrum analyzer should show frequency data
- Phase correlation meter should work

#### Auto-mixing:
- Enable auto-mixing
- Select different strategies
- Verify transitions between songs

### DJ Queue Interface

1. **Navigate to the DJ Queue page**
2. **Test the following features:**

#### Queue Management:
- Add songs to queue
- Remove songs from queue
- Reorder songs (drag and drop)
- Clear queue

#### Auto-mixing Settings:
- Select different auto-mixing strategies
- Adjust auto-refill settings
- Test priority management

#### Statistics:
- View queue statistics
- Check energy distribution
- Verify key compatibility display

## Service Testing

### Audio Analysis Service

```bash
# Run specific audio analysis tests
npm test -- --testNamePattern="AudioAnalysisService"
```

### DJ Queue Manager

```bash
# Run queue manager tests
npm test -- --testNamePattern="DJQueueManager"
```

### Transition Effects

```bash
# Run transition effects tests
npm test -- --testNamePattern="TransitionEffectsService"
```

## Integration Testing

### End-to-End DJ Workflow

1. **Setup a test playlist** with diverse songs
2. **Initialize the DJ queue** with these songs
3. **Enable auto-mixing** with a specific strategy
4. **Monitor the transitions** between songs
5. **Verify the audio analysis** is working correctly
6. **Check the visualization** updates properly

### API Integration Testing

```javascript
// Test the DJ API endpoints
fetch('/api/dj/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    currentSong: { id: '1', bpm: 128, key: 'C Major' },
    strategy: 'harmonic'
  })
})
.then(response => response.json())
.then(data => console.log('API Response:', data));
```

## Performance Testing

### Audio Analysis Performance

```javascript
// Test analysis performance with multiple songs
const startTime = performance.now();
const songs = Array.from({ length: 100 }, (_, i) => ({
  id: `song-${i}`,
  title: `Song ${i}`,
  artist: `Artist ${i}`,
  duration: 180 + Math.random() * 120
}));

Promise.all(songs.map(song => audioService.analyzeSong(song)))
  .then(() => {
    const endTime = performance.now();
    console.log(`Analyzed 100 songs in ${endTime - startTime}ms`);
  });
```

### Real-time Processing Performance

```javascript
// Test Web Audio API performance
const audioProcessor = new WebAudioProcessor();

// Monitor processing time
audioProcessor.on('process', (processingTime) => {
  console.log(`Processing time: ${processingTime}ms`);
  if (processingTime > 10) {
    console.warn('High processing time detected!');
  }
});
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Audio Analysis Not Working

**Problem**: Songs return null or undefined analysis results.

**Solutions**:
- Check if songs have complete metadata
- Verify the audio analysis service is properly initialized
- Check browser console for error messages

```javascript
// Debug audio analysis
const result = await audioService.analyzeSong(testSong);
if (!result) {
  console.error('Analysis failed for song:', testSong);
  console.log('Service status:', audioService.getStatus());
}
```

#### 2. Web Audio API Issues

**Problem**: Audio processing not working in browser.

**Solutions**:
- Ensure browser supports Web Audio API
- Check if user has granted audio permissions
- Verify audio context is properly initialized

```javascript
// Check Web Audio API support
if (!window.AudioContext && !window.webkitAudioContext) {
  console.error('Web Audio API not supported');
}

// Check audio context state
const audioContext = new AudioContext();
console.log('Audio context state:', audioContext.state);
```

#### 3. Auto-mixing Not Working

**Problem**: Queue not auto-mixing properly.

**Solutions**:
- Check if songs have compatible BPM and keys
- Verify auto-mixing strategy is appropriate
- Check queue manager initialization

```javascript
// Debug auto-mixing
const queueManager = new DJQueueManager();
queueManager.initializeQueue(testSongs);

const result = queueManager.autoMix('harmonic');
console.log('Auto-mix result:', result);
if (!result.success) {
  console.error('Auto-mixing failed:', result.error);
}
```

#### 4. Visualization Not Updating

**Problem**: Waveform or spectrum not displaying.

**Solutions**:
- Check if audio is playing
- Verify visualization components are connected
- Check Web Audio API nodes are properly connected

```javascript
// Debug visualization
const visualizer = audioProcessor.getVisualizer();
visualizer.on('data', (data) => {
  console.log('Visualization data:', data);
});
```

### Browser Compatibility

The DJ features require modern browser support for:

- **Web Audio API**: Chrome 32+, Firefox 25+, Safari 14+, Edge 12+
- **Audio Worklet**: Chrome 66+, Firefox 76+, Safari 14.1+, Edge 79+
- **Promises**: All modern browsers
- **ES6 Modules**: All modern browsers

### Performance Considerations

- **Audio Analysis**: Can be CPU-intensive for large libraries
- **Real-time Processing**: Requires efficient algorithms
- **Visualization**: Can impact performance on lower-end devices
- **Memory Usage**: Audio buffers consume significant memory

## Testing Checklist

- [ ] Audio analysis returns valid BPM, key, and energy values
- [ ] DJ mixer compatibility scoring works correctly
- [ ] Queue manager initializes and auto-mixes properly
- [ ] Transition effects calculate appropriate parameters
- [ ] Harmonic mixing follows Circle of Fifths rules
- [ ] Web Audio API processes audio without errors
- [ ] Visualization updates in real-time
- [ ] UI components respond to user interactions
- [ ] API endpoints return correct data
- [ ] Performance is acceptable for real-time use
- [ ] Error handling works gracefully
- [ ] Browser compatibility is maintained

## Conclusion

This comprehensive testing guide covers all aspects of the DJ features implementation. By following these testing procedures, you can ensure that all DJ features work correctly and provide a professional mixing experience.

For additional testing scenarios or specific issues, refer to the individual service documentation and test files included in the implementation.