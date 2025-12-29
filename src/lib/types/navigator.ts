/**
 * Navigator Network Information API types
 *
 * These types provide proper TypeScript definitions for the experimental
 * Network Information API (navigator.connection), which is not included
 * in standard TypeScript lib definitions.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
 */

/**
 * Network connection effective type
 * Represents the quality/speed of the current network connection
 */
export type NetworkEffectiveType = 'slow-2g' | '2g' | '3g' | '4g';

/**
 * Network connection type
 * Represents the type of network connection
 */
export type NetworkConnectionType =
  | 'bluetooth'
  | 'cellular'
  | 'ethernet'
  | 'none'
  | 'wifi'
  | 'wimax'
  | 'other'
  | 'unknown';

/**
 * NetworkInformation interface
 * Provides information about the system's connection
 */
export interface NetworkInformation extends EventTarget {
  /**
   * Returns the effective bandwidth estimate in megabits per second,
   * rounded to the nearest multiple of 25 kilobits per seconds.
   */
  readonly downlink: number;

  /**
   * Returns the maximum downlink speed, in megabits per second (Mbps),
   * for the underlying connection technology.
   */
  readonly downlinkMax?: number;

  /**
   * Returns the effective type of the connection meaning one of
   * 'slow-2g', '2g', '3g', or '4g'. This value is determined using
   * a combination of recently observed, round-trip time and downlink values.
   */
  readonly effectiveType: NetworkEffectiveType;

  /**
   * Returns the estimated effective round-trip time of the current
   * connection, rounded to the nearest multiple of 25 milliseconds.
   */
  readonly rtt: number;

  /**
   * Returns true if the user has set a reduced data usage option
   * on the user agent.
   */
  readonly saveData?: boolean;

  /**
   * Returns the type of connection a device is using to communicate
   * with the network.
   */
  readonly type?: NetworkConnectionType;

  /**
   * Event handler called when connection information changes
   */
  onchange?: ((this: NetworkInformation, ev: Event) => void) | null;
}

/**
 * Navigator interface extended with connection property
 * This augments the standard Navigator interface with the experimental
 * Network Information API
 */
export interface NavigatorWithConnection extends Navigator {
  /**
   * The connection property provides a NetworkInformation object
   * containing information about the system's connection.
   * Note: This is an experimental API and may not be available in all browsers.
   */
  readonly connection?: NetworkInformation;

  /**
   * Legacy property name (used in some older implementations)
   */
  readonly mozConnection?: NetworkInformation;

  /**
   * Legacy property name (used in some older implementations)
   */
  readonly webkitConnection?: NetworkInformation;
}

/**
 * Type guard to check if navigator has connection property
 */
export function hasNetworkInformation(
  nav: Navigator
): nav is NavigatorWithConnection {
  return 'connection' in nav && nav.connection !== undefined;
}

/**
 * Safe accessor for navigator.connection
 * Returns the NetworkInformation object if available, undefined otherwise
 */
export function getNetworkInformation(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const nav = navigator as NavigatorWithConnection;
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}
