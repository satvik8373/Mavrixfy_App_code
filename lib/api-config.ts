import Constants from 'expo-constants';

/**
 * API Configuration
 * Separates auth backend from music API backend
 */

/**
 * Gets the base URL for authentication and general API
 */
export function getAuthApiUrl(): string {
  // For auth, we need a backend with the /auth routes
  // In production builds, use Constants.expoConfig.extra, fallback to process.env for dev
  const host = Constants.expoConfig?.extra?.domain || process.env.EXPO_PUBLIC_DOMAIN;
  
  // Debug logging
  console.log('🔍 API Config Debug:');
  console.log('Constants.expoConfig?.extra?.domain:', Constants.expoConfig?.extra?.domain);
  console.log('process.env.EXPO_PUBLIC_DOMAIN:', process.env.EXPO_PUBLIC_DOMAIN);
  console.log('Final host:', host);
  
  if (!host) {
    console.error('❌ EXPO_PUBLIC_DOMAIN is not set!');
    console.error('Constants.expoConfig:', JSON.stringify(Constants.expoConfig, null, 2));
    // Fallback to production URL instead of crashing
    const fallbackHost = 'spotify-api-drab.vercel.app';
    console.warn(`⚠️ Using fallback domain: ${fallbackHost}`);
    return `https://${fallbackHost}/`;
  }

  // If the host already includes protocol, use it as-is
  if (host.startsWith('http://') || host.startsWith('https://')) {
    const finalUrl = host.endsWith('/') ? host : `${host}/`;
    console.log('✅ API URL (with protocol):', finalUrl);
    return finalUrl;
  }

  // Otherwise, determine protocol based on host
  const isLocal = host.includes('localhost') || 
                  host.includes('127.0.0.1') || 
                  host.match(/^192\.168\.\d+\.\d+/) || 
                  host.match(/^10\.\d+\.\d+\.\d+/);
  
  const protocol = isLocal ? 'http' : 'https';
  const url = new URL(`${protocol}://${host}`);
  
  console.log('✅ API URL (constructed):', url.href);
  return url.href;
}

/**
 * Gets the base URL for music API (JioSaavn)
 */
export function getMusicApiUrl(): string {
  // Use the same backend for music API
  return getAuthApiUrl();
}
