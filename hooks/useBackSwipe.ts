import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Hook to handle back navigation
 * Provides consistent back behavior across platforms
 */
export const useBackSwipe = () => {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (router.canGoBack()) {
            router.back();
            return true; // Prevent default behavior
          }
          return false; // Allow default behavior (exit app)
        }
      );

      return () => backHandler.remove();
    }
  }, [router]);

  return {
    goBack: () => {
      if (router.canGoBack()) {
        router.back();
      }
    },
  };
};
