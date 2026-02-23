import { Platform, Linking, Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { getAuthApiUrl } from './api-config';
import { isNewerVersion, isBelowMinimum, type VersionInfo, type VersionCheckResult } from './version-utils';

const VERSION_CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours
const LAST_CHECK_KEY = 'last_version_check';
const DISMISSED_VERSION_KEY = 'dismissed_version';

export class UpdateService {
  private static instance: UpdateService;
  private lastCheckTime: number = 0;
  private dismissedVersion: string | null = null;

  private constructor() {}

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    // Try multiple sources for version
    if (Platform.OS === 'android') {
      return Application.nativeApplicationVersion || Constants.expoConfig?.version || '1.0.0';
    } else if (Platform.OS === 'ios') {
      return Application.nativeApplicationVersion || Constants.expoConfig?.version || '1.0.0';
    }
    return Constants.expoConfig?.version || '1.0.0';
  }

  /**
   * Check for app updates from server
   */
  async checkForUpdates(force: boolean = false): Promise<VersionCheckResult | null> {
    try {
      // Check if we should skip (unless forced)
      if (!force && !this.shouldCheck()) {
        console.log('Skipping version check - checked recently');
        return null;
      }

      const apiUrl = getAuthApiUrl();
      const currentVersion = this.getCurrentVersion();

      console.log(`Checking for updates... Current version: ${currentVersion}`);

      const response = await fetch(`${apiUrl}api/version/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentVersion }),
      });

      if (!response.ok) {
        throw new Error('Failed to check for updates');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to check for updates');
      }

      this.lastCheckTime = Date.now();
      
      const versionResult: VersionCheckResult = result.data;

      // Get platform-specific update URL
      const updateUrl = Platform.OS === 'android' 
        ? versionResult.updateUrl.android || versionResult.updateUrl
        : versionResult.updateUrl.ios || versionResult.updateUrl;

      return {
        ...versionResult,
        updateUrl: typeof updateUrl === 'string' ? updateUrl : updateUrl.android || updateUrl.ios
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return null;
    }
  }

  /**
   * Check if we should perform version check
   */
  private shouldCheck(): boolean {
    const now = Date.now();
    return now - this.lastCheckTime > VERSION_CHECK_INTERVAL;
  }

  /**
   * Show update dialog
   */
  showUpdateDialog(versionInfo: VersionCheckResult): void {
    const { forceUpdate, message, latestVersion, updateUrl, changelog } = versionInfo;

    // Check if user dismissed this version
    if (!forceUpdate && this.dismissedVersion === latestVersion) {
      console.log('User already dismissed this version');
      return;
    }

    const changelogText = changelog && changelog.length > 0
      ? '\n\nWhat\'s New:\n' + changelog.slice(0, 3).map(item => `• ${item}`).join('\n')
      : '';

    Alert.alert(
      forceUpdate ? '⚠️ Update Required' : '🎉 Update Available',
      `${message}${changelogText}`,
      [
        !forceUpdate && {
          text: 'Later',
          style: 'cancel',
          onPress: () => {
            this.dismissedVersion = latestVersion;
          }
        },
        {
          text: forceUpdate ? 'Update Now' : 'Update',
          onPress: () => this.openUpdateUrl(updateUrl),
          style: 'default'
        }
      ].filter(Boolean) as any,
      { 
        cancelable: !forceUpdate 
      }
    );
  }

  /**
   * Open update URL (Play Store / App Store)
   */
  async openUpdateUrl(url: string): Promise<void> {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open update link');
      }
    } catch (error) {
      console.error('Error opening update URL:', error);
      Alert.alert('Error', 'Failed to open update link');
    }
  }

  /**
   * Check and show update dialog if needed
   */
  async checkAndShowUpdate(force: boolean = false): Promise<void> {
    const versionInfo = await this.checkForUpdates(force);
    
    if (versionInfo && versionInfo.updateAvailable) {
      this.showUpdateDialog(versionInfo);
    } else if (force) {
      Alert.alert('✅ Up to Date', 'You are using the latest version of Mavrixfy');
    }
  }

  /**
   * Reset dismissed version (for testing)
   */
  resetDismissed(): void {
    this.dismissedVersion = null;
  }
}

// Export singleton instance
export const updateService = UpdateService.getInstance();
