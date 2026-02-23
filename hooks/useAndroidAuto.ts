import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import AndroidAutoModule from '../modules/AndroidAutoModule';

// Conditionally import TrackPlayer only on native
let TrackPlayer: any = null;
if (Platform.OS !== 'web') {
  try {
    TrackPlayer = require('react-native-track-player').default;
  } catch { }
}

// songToTrack mirrors the one in PlayerContext
function songToTrack(song: any): any {
  return {
    id: song.id,
    url: song.audioUrl?.trim() || song.url?.trim() || '',
    title: song.title,
    artist: song.artist,
    artwork: song.coverUrl || song.artwork || song.artworkUrl || '',
    duration: song.duration || 0,
  };
}

// Module-level cache so the playFromMediaId handler can find any song
const songCacheRef: { current: any[] } = { current: [] };

export const useAndroidAuto = () => {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Start the Android Auto media browser service
    AndroidAutoModule.startService();

    const playbackCommandListener = AndroidAutoModule.onPlaybackCommand(async (command: string) => {
      if (!TrackPlayer) return;
      switch (command) {
        case 'play':
          await TrackPlayer.play();
          break;
        case 'pause':
          await TrackPlayer.pause();
          break;
        case 'next':
          await TrackPlayer.skipToNext();
          break;
        case 'previous':
          await TrackPlayer.skipToPrevious();
          break;
        case 'stop':
          await TrackPlayer.stop();
          break;
      }
    });

    const playFromMediaIdListener = AndroidAutoModule.onPlayFromMediaId(async (mediaId: string) => {
      if (!TrackPlayer) return;

      // Find the song in the full cache by ID
      const songs = songCacheRef.current;
      const idx = songs.findIndex(s => s.id === mediaId);
      if (idx === -1) {
        console.warn('[AndroidAuto] Song not found for mediaId:', mediaId);
        return;
      }

      try {
        // Build and load the full queue so skip controls work correctly
        const validSongs = songs.filter(
          s => (s.audioUrl || s.url) && (s.audioUrl || s.url).trim() !== ''
        );
        const targetIdx = validSongs.findIndex(s => s.id === mediaId);
        await TrackPlayer.reset();
        await TrackPlayer.add(validSongs.map(songToTrack));
        await TrackPlayer.skip(targetIdx >= 0 ? targetIdx : 0);
        await TrackPlayer.play();
      } catch (e) {
        console.error('[AndroidAuto] playFromMediaId error:', e);
      }
    });

    const seekToListener = AndroidAutoModule.onSeekTo(async (position: number) => {
      if (!TrackPlayer) return;
      await TrackPlayer.seekTo(position);
    });

    return () => {
      playbackCommandListener.remove();
      playFromMediaIdListener.remove();
      seekToListener.remove();
    };
  }, []);

  /**
   * Push real music data to the Android Auto media browser.
   *
   * Songs must have:
   *   id, title, artist, album, audioUrl (or url), coverUrl (or artwork), duration
   *
   * Playlists must have:
   *   id, title (or name), subtitle (or description)
   *
   * Albums must have:
   *   id, title (or name), artist (or artistName)
   */
  const syncMusicData = useCallback(async (data: {
    trending?: any[];
    playlists?: any[];
    albums?: any[];
  }) => {
    if (Platform.OS !== 'android') return;

    if (data.trending && data.trending.length > 0) {
      // Cache all songs so playFromMediaId can resolve them
      songCacheRef.current = data.trending;

      const songs = data.trending.map(item => ({
        id: item.id || item._id || '',
        title: item.title || item.name || '',
        artist: item.artist || item.artistName || '',
        album: item.album || item.albumName || '',
        url: item.audioUrl || item.url || item.uri || '',
        artwork: item.coverUrl || item.artwork || item.artworkUrl || '',
        duration: item.duration || 0,
      }));
      AndroidAutoModule.updateTrendingSongs(songs);
    }

    if (data.playlists && data.playlists.length > 0) {
      const playlists = data.playlists.map(item => ({
        id: item.id || item._id || '',
        title: item.title || item.name || '',
        subtitle: item.subtitle || item.description || `${item.songCount || 0} songs`,
      }));
      AndroidAutoModule.updatePlaylists(playlists);
    }

    if (data.albums && data.albums.length > 0) {
      const albums = data.albums.map(item => ({
        id: item.id || item._id || '',
        title: item.title || item.name || '',
        artist: item.artist || item.artistName || '',
      }));
      AndroidAutoModule.updateAlbums(albums);
    }
  }, []);

  /**
   * Register songs for a specific playlist so Android Auto can list and play them.
   * Call this when a playlist's songs are loaded in the app.
   */
  const syncPlaylistSongs = useCallback((playlistId: string, songs: any[]) => {
    if (Platform.OS !== 'android') return;

    // Add to the module-level cache for playFromMediaId lookup
    const existingIds = new Set(songCacheRef.current.map(s => s.id));
    const newSongs = songs.filter(s => !existingIds.has(s.id));
    songCacheRef.current = [...songCacheRef.current, ...newSongs];

    const mapped = songs.map(item => ({
      id: item.id || item._id || '',
      title: item.title || item.name || '',
      artist: item.artist || item.artistName || '',
      album: item.album || item.albumName || '',
      url: item.audioUrl || item.url || item.uri || '',
      artwork: item.coverUrl || item.artwork || item.artworkUrl || '',
      duration: item.duration || 0,
    }));
    AndroidAutoModule.updatePlaylistSongs(playlistId, mapped);
  }, []);

  return { syncMusicData, syncPlaylistSongs };
};
