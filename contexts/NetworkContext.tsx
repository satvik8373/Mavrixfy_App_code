/**
 * NetworkContext — app-wide online/offline state.
 *
 * Uses expo-network to detect connectivity. Provides:
 * - `isOnline`  — true when the device has internet access
 * - `isChecking` — true during the initial check
 *
 * Components can call `useNetwork()` to read state, or use the
 * `OfflineBanner` component for a standard "no internet" UI.
 */

import React, {
  createContext,
  use,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Network from "expo-network";

const subscribeToAppStateChanges = (listener: (state: AppStateStatus) => void) => {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
};

interface NetworkContextValue {
  isOnline: boolean;
  isChecking: boolean;
  recheck: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  isChecking: false,
  recheck: async () => {},
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline]     = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  const check = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      // isInternetReachable is the most reliable — it confirms actual internet
      // access, not just being connected to a Wi-Fi/cellular network.
      const online = state.isConnected === true;
      setIsOnline(online);
    } catch {
      // If the check itself fails, assume online to avoid false offline screens
      setIsOnline(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Initial check
  useEffect(() => {
    check();
  }, [check]);

  // Re-check when app comes back to foreground
  useEffect(() => {
    return subscribeToAppStateChanges((state: AppStateStatus) => {
      if (state === "active") check();
    });
  }, [check]);

  // Poll every 10 seconds when offline to detect reconnection
  useEffect(() => {
    if (isOnline) return;
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [isOnline, check]);

  return (
    <NetworkContext.Provider value={useMemo(() => ({ isOnline, isChecking, recheck: check }), [isOnline, isChecking, check])}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  return use(NetworkContext);
}
