import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { logger } from "@/lib/logger";

export const PRODUCTION_YOUTUBE_MUSIC_API_URL = 'https://mavrixfy-ytmusic-api.vercel.app';

/**
 * YouTube Music API Configuration
 * 
 * Configured via .env file or app.json extra config:
 * - Development: EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
 *   or a device-reachable LAN URL like http://192.168.x.x:8000
 * - Production: EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL=https://mavrixfy-api-drab.vercel.app/api/youtube-music
 * - Standalone builds: app.json extra.youtubeMusicApiUrl
 *
 * The backend at this URL is the Node youtubei.js service in youtube-music-api/.
 * 
 * Priority: Environment variable > app.json extra > hardcoded fallback
 */

/**
 * YouTube Music API URL - reads from environment variable or app.json extra config
 */
function isPrivateDevelopmentUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '10.0.2.2' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

function isHostOnlyDevelopmentUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '10.0.2.2'
    );
  } catch {
    return false;
  }
}

export function getYouTubeMusicApiUrlForPlatform(): string {
  const configUrl = Constants.expoConfig?.extra?.youtubeMusicApiUrl;
  const fallbackUrl = configUrl || PRODUCTION_YOUTUBE_MUSIC_API_URL;

  // Try environment variable first (works in development and if embedded in build)
  const envUrl = process.env.EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL;
  
  if (__DEV__ && envUrl && Platform.OS !== 'web' && Device.isDevice && isHostOnlyDevelopmentUrl(envUrl)) {
    logger.warn(
      '[YouTube Music Config] Ignoring host-only development URL on a physical device. Use a LAN IP or the production proxy.'
    );
    return fallbackUrl;
  }

  if (envUrl) {
    return envUrl;
  }
  
  // Fallback to app.json extra config for standalone builds
  if (configUrl) return configUrl;
  
  // Final fallback to production URL
  logger.warn('[YouTube Music Config] Using fallback Node youtubei.js production URL. Consider setting EXPO_PUBLIC_YOUTUBE_MUSIC_API_URL in .env');
  return PRODUCTION_YOUTUBE_MUSIC_API_URL;
}
