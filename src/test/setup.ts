import { beforeAll, afterEach, vi, expect } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { setupWebAudioMocks } from './mocks/web-audio-api'

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Run tests using JSDOM
beforeAll(() => {
  vi.mock('react-dom')
  // Setup Web Audio API mocks for DJ testing
  setupWebAudioMocks()
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

expect.extend(matchers)