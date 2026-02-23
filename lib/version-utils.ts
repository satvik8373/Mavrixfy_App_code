/**
 * Version comparison utilities
 */

export interface VersionInfo {
  latestVersion: string;
  minimumSupportedVersion: string;
  forceUpdate: boolean;
  updateUrl: {
    android: string;
    ios: string;
  };
  message: string;
  changelog: string[];
  features?: Array<{
    title: string;
    description: string;
  }>;
  releaseDate?: string;
}

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  minimumSupportedVersion: string;
  updateAvailable: boolean;
  forceUpdate: boolean;
  updateUrl: string;
  message: string;
  changelog: string[];
  features?: Array<{
    title: string;
    description: string;
  }>;
}

/**
 * Compare two semantic versions
 * Returns true if target version is newer than current version
 */
export function isNewerVersion(current: string, target: string): boolean {
  const c = current.split('.').map(Number);
  const t = target.split('.').map(Number);
  
  for (let i = 0; i < Math.max(c.length, t.length); i++) {
    const currentPart = c[i] || 0;
    const targetPart = t[i] || 0;
    
    if (targetPart > currentPart) return true;
    if (targetPart < currentPart) return false;
  }
  
  return false;
}

/**
 * Check if current version is below minimum supported version
 */
export function isBelowMinimum(current: string, minimum: string): boolean {
  return isNewerVersion(current, minimum);
}

/**
 * Format version for display
 */
export function formatVersion(version: string): string {
  return `v${version}`;
}

/**
 * Get update urgency level
 */
export function getUpdateUrgency(
  currentVersion: string,
  latestVersion: string,
  minimumVersion: string
): 'critical' | 'recommended' | 'optional' | 'none' {
  if (isBelowMinimum(currentVersion, minimumVersion)) {
    return 'critical';
  }
  
  if (!isNewerVersion(currentVersion, latestVersion)) {
    return 'none';
  }
  
  const current = currentVersion.split('.').map(Number);
  const latest = latestVersion.split('.').map(Number);
  
  // Major version difference = recommended
  if (latest[0] > current[0]) {
    return 'recommended';
  }
  
  // Minor version difference = optional
  return 'optional';
}
