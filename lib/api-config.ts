/**
 * API Configuration
 * Separates auth backend from music API backend
 */

/**
 * Gets the base URL for authentication and general API
 */
export function getAuthApiUrl(): string {
  // For auth, we need a backend with the /auth routes
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  
  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set. Please configure it in your .env file.");
  }

  // If the host already includes protocol, use it as-is
  if (host.startsWith('http://') || host.startsWith('https://')) {
    return host.endsWith('/') ? host : `${host}/`;
  }

  // Otherwise, determine protocol based on host
  const isLocal = host.includes('localhost') || 
                  host.includes('127.0.0.1') || 
                  host.match(/^192\.168\.\d+\.\d+/) || 
                  host.match(/^10\.\d+\.\d+\.\d+/);
  
  const protocol = isLocal ? 'http' : 'https';
  const url = new URL(`${protocol}://${host}`);
  
  return url.href;
}

/**
 * Gets the base URL for music API (JioSaavn)
 */
export function getMusicApiUrl(): string {
  // Use the same backend for music API
  return getAuthApiUrl();
}
