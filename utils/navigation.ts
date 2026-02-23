import { router } from 'expo-router';

/**
 * Safely navigate back, only if there's a screen to go back to
 */
export const safeGoBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    // If can't go back, go to home
    router.replace('/(tabs)');
  }
};
