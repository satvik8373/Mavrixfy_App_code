import TrackPlayer, { Event } from 'react-native-track-player';

/**
 * Track Player Playback Service
 * 
 * This service runs in the background and handles remote control events
 * from notification, lock screen, Bluetooth devices, etc.
 * 
 * IMPORTANT: Keep this service lightweight to prevent crashes
 * Official docs: https://rntp.dev/docs/basics/playback-service
 */

export async function PlaybackService() {
  // Remote control event handlers
  // These handle media controls from notification, lock screen, headphones, etc.
  
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    await TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    await TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.stop();
  });

  // Optional: Handle playback queue ended
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async (event) => {
    // You can handle what happens when the queue ends
    // For example, restart from beginning if repeat mode is on
    if (event.track != null) {
      await TrackPlayer.skip(event.track);
    }
  });
}

export default PlaybackService;
