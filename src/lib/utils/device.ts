/**
 * Device Identification Utilities
 *
 * Used for Spotify Connect-style cross-device sync.
 * Provides persistent device ID and detection utilities.
 */

const DEVICE_ID_KEY = 'aidj_device_id';
const DEVICE_NAME_KEY = 'aidj_device_name';

/**
 * Generate a random device ID (nanoid-style)
 */
function generateDeviceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 21; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get or create a persistent device ID
 * Stored in localStorage to persist across sessions
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    // Server-side: return a placeholder
    return 'server';
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Detect device type based on user agent and screen size
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent.toLowerCase();
  const screenWidth = window.innerWidth;

  // Check for mobile indicators
  const isMobileUA = /iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua);

  // Check for tablet indicators
  const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(ua);

  if (isMobileUA || (screenWidth <= 480 && 'ontouchstart' in window)) {
    return 'mobile';
  }

  if (isTabletUA || (screenWidth > 480 && screenWidth <= 1024 && 'ontouchstart' in window)) {
    return 'tablet';
  }

  return 'desktop';
}

/**
 * Get a human-readable device name
 * Uses stored custom name, or falls back to auto-generated name
 */
export function getDeviceName(): string {
  if (typeof window === 'undefined') {
    return 'Server';
  }

  // Check for custom name
  const customName = localStorage.getItem(DEVICE_NAME_KEY);
  if (customName) {
    return customName;
  }

  // Generate name based on device info
  const deviceType = getDeviceType();
  const ua = navigator.userAgent;

  // Try to extract browser name
  let browser = 'Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    browser = 'Safari';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('Edg')) {
    browser = 'Edge';
  }

  // Try to extract OS
  let os = '';
  if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
  } else if (ua.includes('Mac OS')) {
    os = 'macOS';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('Windows')) {
    os = 'Windows';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  // Combine into friendly name
  const typeLabel = deviceType === 'mobile' ? 'Phone' : deviceType === 'tablet' ? 'Tablet' : 'Desktop';

  if (os) {
    return `${os} ${typeLabel}`;
  }

  return `${browser} ${typeLabel}`;
}

/**
 * Set a custom device name
 */
export function setDeviceName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_NAME_KEY, name);
}

/**
 * Device info type for API calls
 */
export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  userAgent: string;
}

/**
 * Get device info object for API calls
 */
export function getDeviceInfo(): DeviceInfo {
  return {
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    deviceType: getDeviceType(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}
