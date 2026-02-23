/**
 * Mavrixfy - Entry Point
 * CRITICAL: TrackPlayer service MUST be registered before app starts
 */

import TrackPlayer, { Event } from 'react-native-track-player';

// Define playback service inline to avoid import issues
async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
}

// Register TrackPlayer service FIRST (before expo-router)
TrackPlayer.registerPlaybackService(() => PlaybackService);

// Then import Expo Router entry
import 'expo-router/entry';
