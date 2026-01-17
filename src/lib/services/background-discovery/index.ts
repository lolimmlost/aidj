/**
 * Background Discovery Module
 *
 * Exports the discovery generator and manager for background music discovery.
 */

export {
  generateSuggestions,
  storeSuggestions,
  selectSeeds,
  DEFAULT_DISCOVERY_CONFIG,
  type DiscoveryConfig,
} from './discovery-generator';

export {
  getBackgroundDiscoveryManager,
  initializeBackgroundDiscovery,
  DEFAULT_BACKGROUND_DISCOVERY_CONFIG,
  type BackgroundDiscoveryConfig,
  type BackgroundDiscoveryStatus,
  type DiscoveryEvent,
  type DiscoveryEventType,
  type DiscoveryEventListener,
} from './discovery-manager';
