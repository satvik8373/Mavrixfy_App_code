import { useEffect } from "react";
import { usePathname } from "expo-router";
import { logScreenView } from "@/lib/analytics";

/**
 * Hook to automatically track screen views
 * Usage: Add `useScreenTracking("ScreenName")` to any screen component
 */
export function useScreenTracking(screenName?: string) {
  const pathname = usePathname();

  useEffect(() => {
    const name = screenName || pathname || "Unknown";
    logScreenView(name);
  }, [pathname, screenName]);
}
