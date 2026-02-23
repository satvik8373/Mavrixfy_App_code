import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { InteractionManager } from 'react-native';

/**
 * Hook to prevent rapid navigation taps
 * Debounces navigation calls to ensure smooth transitions
 */
export const useDebounceNavigation = (delay = 300) => {
  const router = useRouter();
  const lastNavigationTime = useRef(0);
  const isNavigating = useRef(false);

  const navigate = useCallback(
    (path: string | { pathname: string; params?: any }) => {
      const now = Date.now();

      // Prevent navigation if already navigating or too soon
      if (isNavigating.current || now - lastNavigationTime.current < delay) {
        return;
      }

      isNavigating.current = true;
      lastNavigationTime.current = now;

      // Use InteractionManager for smooth navigation
      InteractionManager.runAfterInteractions(() => {
        // Navigate
        if (typeof path === 'string') {
          router.push(path as any);
        } else {
          router.push(path as any);
        }

        // Reset navigating flag after delay
        setTimeout(() => {
          isNavigating.current = false;
        }, delay);
      });
    },
    [router, delay]
  );

  return { navigate };
};
