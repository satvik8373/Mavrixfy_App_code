/**
 * Custom OTA Update Service
 * Downloads and applies JavaScript bundle updates in the background
 * No user interaction required - silent updates
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getAuthApiUrl } from './api-config';

const BUNDLE_VERSION_KEY = '@ota_bundle_version';
const BUNDLE_PATH_KEY = '@ota_bundle_path';
const LAST_CHECK_KEY = '@ota_last_check';
const CHECK_INTERVAL = 1000 * 60 * 30; // Check every 30 minutes

export interface BundleInfo {
  version: string;
  bundleUrl: string;
  bundleHash: string;
  minAppVersion: string;
  releaseNotes?: string;
  timestamp: number;
  platform: 'android' | 'ios' | 'all';
}

export interface OTAUpdateStatus {
  checking: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  updateAvailable: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
}

class OTAUpdateService {
  private static instance: OTAUpdateService;
  private status: OTAUpdateStatus = {
    checking: false,
    downloading: false,
    progress: 0,
    error: null,
    updateAvailable: false,
    currentVersion: null,
    latestVersion: null,
  };
  private listeners: Array<(status: OTAUpdateStatus) => void> = [];
  private checkTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.initialize();
  }

  static getInstance(): OTAUpdateService {
    if (!OTAUpdateService.instance) {
      OTAUpdateService.instance = new OTAUpdateService();
    }
    return OTAUpdateService.instance;
  }

  /**
   * Initialize the OTA service
   */
  private async initialize() {
    try {
      // Load current bundle version
      let currentVersion = await AsyncStorage.getItem(BUNDLE_VERSION_KEY);
      
      // If no OTA version is stored, initialize with app version
      if (!currentVersion) {
        const appVersion = Constants.expoConfig?.version || '1.2.0';
        currentVersion = appVersion;
        await AsyncStorage.setItem(BUNDLE_VERSION_KEY, appVersion);
        console.log(`[OTA] Initialized OTA version to app version: ${appVersion}`);
      }
      
      this.status.currentVersion = currentVersion;

      // Start automatic update checks
      this.startAutoCheck();
    } catch (error) {
      console.error('[OTA] Initialization error:', error);
    }
  }

  /**
   * Start automatic update checks
   */
  startAutoCheck() {
    // Check immediately
    this.checkForUpdates();

    // Then check periodically
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, CHECK_INTERVAL);
  }

  /**
   * Stop automatic update checks
   */
  stopAutoCheck() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check if update check is needed
   */
  private async shouldCheckForUpdates(): Promise<boolean> {
    try {
      const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
      if (!lastCheck) return true;

      const timeSinceLastCheck = Date.now() - parseInt(lastCheck, 10);
      return timeSinceLastCheck > CHECK_INTERVAL;
    } catch {
      return true;
    }
  }

  /**
   * Check for available updates from server
   */
  async checkForUpdates(): Promise<boolean> {
    // Skip if already checking or downloading
    if (this.status.checking || this.status.downloading) {
      return false;
    }

    // Check if we should skip based on time
    const shouldCheck = await this.shouldCheckForUpdates();
    if (!shouldCheck) {
      console.log('[OTA] Skipping check - checked recently');
      return false;
    }

    this.updateStatus({ checking: true, error: null });

    try {
      const apiUrl = getAuthApiUrl();
      const appVersion = Constants.expoConfig?.version || '1.2.0';
      const currentVersion = this.status.currentVersion || appVersion;
      const platform = Platform.OS as 'android' | 'ios';

      console.log(`[OTA] ========================================`);
      console.log(`[OTA] Checking for updates...`);
      console.log(`[OTA] API URL: ${apiUrl}`);
      console.log(`[OTA] Current Version: ${currentVersion}`);
      console.log(`[OTA] Platform: ${platform}`);
      console.log(`[OTA] App Version: ${appVersion}`);
      console.log(`[OTA] ========================================`);

      const response = await fetch(`${apiUrl}api/ota/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentVersion,
          platform,
          appVersion,
        }),
      });

      console.log(`[OTA] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OTA] Response error: ${errorText}`);
        throw new Error('Failed to check for updates');
      }

      const result = await response.json();
      console.log(`[OTA] Response:`, JSON.stringify(result, null, 2));

      // Update last check time
      await AsyncStorage.setItem(LAST_CHECK_KEY, Date.now().toString());

      if (result.updateAvailable && result.bundleInfo) {
        const bundleInfo: BundleInfo = result.bundleInfo;
        
        console.log(`[OTA] ✅ Update available: ${bundleInfo.version}`);
        
        this.updateStatus({
          checking: false,
          updateAvailable: true,
          latestVersion: bundleInfo.version,
        });

        // Automatically download in background
        this.downloadAndApplyUpdate(bundleInfo);
        return true;
      } else {
        console.log('[OTA] ℹ️ No updates available');
        this.updateStatus({ checking: false, updateAvailable: false });
        return false;
      }
    } catch (error) {
      console.error('[OTA] ❌ Check error:', error);
      this.updateStatus({
        checking: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Download and apply update silently in background
   */
  private async downloadAndApplyUpdate(bundleInfo: BundleInfo) {
    this.updateStatus({ downloading: true, progress: 0, error: null });

    try {
      const bundleDir = `${FileSystem.documentDirectory}ota_bundles/`;
      const bundlePath = `${bundleDir}bundle_${bundleInfo.version}.js`;

      // Create directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(bundleDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(bundleDir, { intermediates: true });
      }

      console.log(`[OTA] Downloading bundle to: ${bundlePath}`);

      // Download bundle with progress tracking
      const downloadResumable = FileSystem.createDownloadResumable(
        bundleInfo.bundleUrl,
        bundlePath,
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          this.updateStatus({ progress: progress * 100 });
          console.log(`[OTA] Download progress: ${(progress * 100).toFixed(1)}%`);
        }
      );

      const downloadResult = await downloadResumable.downloadAsync();

      if (!downloadResult) {
        throw new Error('Download failed');
      }

      console.log('[OTA] Download complete, verifying...');

      // Verify bundle hash
      const isValid = await this.verifyBundle(downloadResult.uri, bundleInfo.bundleHash);
      if (!isValid) {
        await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
        throw new Error('Bundle verification failed');
      }

      console.log('[OTA] Bundle verified successfully');

      // Save bundle info
      await AsyncStorage.setItem(BUNDLE_VERSION_KEY, bundleInfo.version);
      await AsyncStorage.setItem(BUNDLE_PATH_KEY, downloadResult.uri);
      await AsyncStorage.setItem('@ota_bundle_info', JSON.stringify(bundleInfo));

      // Clean up old bundles
      await this.cleanupOldBundles(bundleDir, bundleInfo.version);

      this.updateStatus({
        downloading: false,
        progress: 100,
        currentVersion: bundleInfo.version,
        updateAvailable: false,
      });

      console.log('[OTA] Update applied successfully. Will take effect on next app restart.');

      // Notify listeners that update is ready
      this.notifyUpdateReady(bundleInfo);
    } catch (error) {
      console.error('[OTA] Download/Apply error:', error);
      this.updateStatus({
        downloading: false,
        error: error instanceof Error ? error.message : 'Download failed',
      });
    }
  }

  /**
   * Verify downloaded bundle integrity
   */
  private async verifyBundle(bundlePath: string, expectedHash: string): Promise<boolean> {
    try {
      // Read bundle file
      const bundleContent = await FileSystem.readAsStringAsync(bundlePath);
      
      // Calculate hash (simple implementation - you can use crypto for better hashing)
      const calculatedHash = this.simpleHash(bundleContent);
      
      return calculatedHash === expectedHash;
    } catch (error) {
      console.error('[OTA] Verification error:', error);
      return false;
    }
  }

  /**
   * Simple hash function (replace with proper crypto hash in production)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Clean up old bundle files
   */
  private async cleanupOldBundles(bundleDir: string, currentVersion: string) {
    try {
      const files = await FileSystem.readDirectoryAsync(bundleDir);
      
      for (const file of files) {
        if (file.startsWith('bundle_') && !file.includes(currentVersion)) {
          const filePath = `${bundleDir}${file}`;
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          console.log(`[OTA] Cleaned up old bundle: ${file}`);
        }
      }
    } catch (error) {
      console.error('[OTA] Cleanup error:', error);
    }
  }

  /**
   * Get the path to the latest downloaded bundle
   */
  async getLatestBundlePath(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(BUNDLE_PATH_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Get current bundle version
   */
  async getCurrentVersion(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(BUNDLE_VERSION_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Force check for updates (manual trigger)
   */
  async forceCheckForUpdates(): Promise<boolean> {
    // Reset last check time to force check
    await AsyncStorage.removeItem(LAST_CHECK_KEY);
    return this.checkForUpdates();
  }

  /**
   * Get current status
   */
  getStatus(): OTAUpdateStatus {
    return { ...this.status };
  }

  /**
   * Subscribe to status updates
   */
  subscribe(listener: (status: OTAUpdateStatus) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(updates: Partial<OTAUpdateStatus>) {
    this.status = { ...this.status, ...updates };
    this.listeners.forEach((listener) => listener(this.status));
  }

  /**
   * Notify that update is ready (can be used to show subtle notification)
   */
  private notifyUpdateReady(bundleInfo: BundleInfo) {
    // You can implement a subtle notification here
    // For example, show a small badge or toast
    console.log(`[OTA] Update ${bundleInfo.version} is ready and will be applied on next restart`);
  }

  /**
   * Clear all OTA data (for testing/debugging)
   */
  async clearOTAData() {
    try {
      await AsyncStorage.multiRemove([
        BUNDLE_VERSION_KEY,
        BUNDLE_PATH_KEY,
        LAST_CHECK_KEY,
        '@ota_bundle_info',
      ]);

      const bundleDir = `${FileSystem.documentDirectory}ota_bundles/`;
      const dirInfo = await FileSystem.getInfoAsync(bundleDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(bundleDir, { idempotent: true });
      }

      this.status.currentVersion = null;
      console.log('[OTA] All OTA data cleared');
    } catch (error) {
      console.error('[OTA] Clear data error:', error);
    }
  }
}

// Export singleton instance
export const otaUpdateService = OTAUpdateService.getInstance();
