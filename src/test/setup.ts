import { beforeAll, afterEach, vi, expect } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { setupWebAudioMocks } from './mocks/web-audio-api'

// Mock @t3-oss/env-core to prevent env validation failures in test environment
vi.mock('@t3-oss/env-core', () => ({
  createEnv: (opts: Record<string, unknown>) => {
    // Return a proxy that returns empty strings for any accessed property
    const runtimeEnv = (opts.runtimeEnv || {}) as Record<string, string | undefined>;
    return new Proxy(runtimeEnv, {
      get: (_target, prop) => {
        if (typeof prop === 'string') {
          return runtimeEnv[prop] ?? '';
        }
        return undefined;
      },
    });
  },
}))

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