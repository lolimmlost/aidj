import { beforeAll, afterEach, vi, expect } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { setupWebAudioMocks } from './mocks/web-audio-api'

// Node 25+ ships its own Web Storage globals. Without --localstorage-file they are inert
// (bare `localStorage` reads undefined) and they shadow jsdom's, so any module touching
// `localStorage` at import time throws. Here `window` is globalThis, so take the working storage
// from the JSDOM instance vitest exposes as `globalThis.jsdom`.
// (Production is unaffected: that code only runs when `window` exists, i.e. in the browser.)
const jsdomWindow = (globalThis as { jsdom?: { window?: Window } }).jsdom?.window
if (jsdomWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    const store = (globalThis as Record<string, unknown>)[key] as Storage | undefined
    if (typeof store?.getItem !== 'function') {
      Object.defineProperty(globalThis, key, { value: jsdomWindow[key], configurable: true, writable: true })
    }
  }
}

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

// Mock react-dom (hoisted; must be top-level in vitest 4+)
vi.mock('react-dom')

// Run tests using JSDOM
beforeAll(() => {
  // Setup Web Audio API mocks for DJ testing
  setupWebAudioMocks()
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

expect.extend(matchers)