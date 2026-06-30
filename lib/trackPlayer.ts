/**
 * TrackPlayer setup — official react-native-track-player v4 API.
 *
 * References:
 * - https://rntp.dev/docs/api/functions/lifecycle
 * - https://rntp.dev/docs/api/constants/capability
 * - https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter
 * - https://developer.android.com/media/implement/surfaces/mobile
 */

import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
} from "react-native-track-player";
import { Platform } from "react-native";
import { logger } from "@/lib/logger";

let setupPromise: Promise<void> | null = null;
let hasSetupPlayer = false;

const PLAYER_SETUP_TIMEOUT_MS   = 12_000;
const PLAYER_OPTIONS_TIMEOUT_MS =  6_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`TrackPlayer ${label} timed out`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function configurePlayerOptions(): Promise<void> {
  try {
    await withTimeout(
      TrackPlayer.updateOptions({
        // ── Android notification ──────────────────────────────────────────
        android: {
          // Stop playback and dismiss the notification when the app is swiped
          // away from the recents screen. Use ContinuePlayback only if you
          // specifically need Android Auto background behaviour.
          appKilledPlaybackBehavior:
            AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          // Pause on phone calls, navigation audio, etc.
          alwaysPauseOnInterruption: true,
          // Give 5 s grace before the foreground service stops after pause.
          stopForegroundGracePeriod: 5,
        },

        // ── Lock screen / notification capabilities ───────────────────────
        // These map to:
        //   iOS  → MPRemoteCommandCenter buttons
        //   Android → MediaSession actions + notification buttons
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.PlayFromId,
          Capability.PlayFromSearch,
        ],

        // ── Android compact notification (3 buttons max) ──────────────────
        compactCapabilities: [
          Capability.SkipToPrevious,
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
        ],

        // ── Android full notification (all buttons) ───────────────────────
        // notificationCapabilities defaults to `capabilities` when omitted,
        // but we set it explicitly for clarity.
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
        ],

        // ── Progress update interval ──────────────────────────────────────
        // 1 second is the Apple-recommended interval for MPNowPlayingInfoCenter.
        // Shorter values drain battery; longer values make the seek bar jerky.
        progressUpdateEventInterval: 1,
      }),
      PLAYER_OPTIONS_TIMEOUT_MS,
      "updateOptions"
    );
  } catch (error) {
    logger.warn("[TrackPlayer] updateOptions failed", error);
  }
}

/**
 * Idempotent player setup — safe to call multiple times.
 * Subsequent calls return immediately once setup has completed.
 */
export async function setupPlayer(): Promise<void> {
  if (hasSetupPlayer) return;

  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await withTimeout(
          TrackPlayer.setupPlayer({
            // 50 MB audio cache — avoids re-buffering recently played tracks.
            maxCacheSize: 1024 * 50,
            // iOS must use a playback audio session for reliable lock-screen
            // and background playback across longer sessions.
            ...(Platform.OS === "ios"
              ? {
                  iosCategory: IOSCategory.Playback,
                  iosCategoryMode: IOSCategoryMode.Default,
                  iosCategoryOptions: [
                    IOSCategoryOptions.AllowAirPlay,
                    IOSCategoryOptions.AllowBluetooth,
                    IOSCategoryOptions.AllowBluetoothA2DP,
                  ],
                }
              : {}),
            // Automatically update MPNowPlayingInfoCenter / MediaSession metadata.
            autoUpdateMetadata: true,
            // Let RNTP handle audio interruptions (calls, alarms, etc.).
            autoHandleInterruptions: true,
            // allowBackgroundSetup is Android-only (patched native module for
            // Android Auto headless startup). Do NOT pass on iOS.
            ...(Platform.OS === "android" ? { allowBackgroundSetup: true } : {}),
          } as Parameters<typeof TrackPlayer.setupPlayer>[0]),
          PLAYER_SETUP_TIMEOUT_MS,
          "setupPlayer"
        );
      } catch (error: any) {
        // player_already_initialized is not an error — just means setup ran twice.
        if (error?.code !== "player_already_initialized") throw error;
      }

      await configurePlayerOptions();
      hasSetupPlayer = true;
    })();
  }

  try {
    await setupPromise;
  } finally {
    if (!hasSetupPlayer) setupPromise = null;
  }
}
