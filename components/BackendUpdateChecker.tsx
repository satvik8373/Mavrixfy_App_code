/**
 * Backend Update Checker
 * Checks your backend API for update messages
 * Works across different EAS accounts
 */

import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import Constants from 'expo-constants';

interface AppMessage {
  showUpdateMessage: boolean;
  version: string;
  title: string;
  message: string;
  downloadUrl: string;
  mandatory: boolean;
}

// Backend API URL - update this to your actual backend
const BACKEND_API_URL = 'https://spotify-api-drab.vercel.app/api/app/message';

export function useBackendUpdateChecker() {
  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const response = await fetch(BACKEND_API_URL, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          return; // Silently fail
        }

        const data: AppMessage = await response.json();

        if (!data.showUpdateMessage) {
          return;
        }

        const currentVersion = Constants.expoConfig?.version || '1.0.0';

        // Compare versions
        if (compareVersions(currentVersion, data.version) < 0) {
          showUpdateAlert(data);
        }
      } catch (error) {
        // Silently fail - don't show error to user
      }
    };

    // Check after 3 seconds to not interfere with app startup
    const timer = setTimeout(checkForUpdate, 3000);
    return () => clearTimeout(timer);
  }, []);
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }

  return 0;
}

function showUpdateAlert(data: AppMessage) {
  const buttons = data.mandatory
    ? [
        {
          text: 'Download Now',
          onPress: () => Linking.openURL(data.downloadUrl),
        },
      ]
    : [
        {
          text: 'Later',
          style: 'cancel' as const,
        },
        {
          text: 'Download',
          onPress: () => Linking.openURL(data.downloadUrl),
        },
      ];

  Alert.alert(data.title, data.message, buttons, {
    cancelable: !data.mandatory,
  });
}
