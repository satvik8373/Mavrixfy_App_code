import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
} from 'react-native-track-player';

/**
 * Setup Track Player - Call this once when app starts
 * This is the main setup function used by PlayerContext
 */
export async function setupPlayer() {
  let isSetup = false;
  
  try {
    const state = await TrackPlayer.getPlaybackState();
    isSetup = true;
  } catch {
    // Not setup yet
  }

  if (!isSetup) {
    try {
      await TrackPlayer.setupPlayer({
        maxCacheSize: 1024 * 50, // 50 MB cache
        waitForBuffer: true,
        autoUpdateMetadata: true,
        autoHandleInterruptions: true,
      });

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          alwaysPauseOnInterruption: true,
        },
        
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
        ],
        
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
        ],
        
        progressUpdateEventInterval: 1,
        
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
      });
    } catch (error) {
      console.error('Failed to setup TrackPlayer:', error);
      throw error;
    }
  }
}
