import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { MusicBridge } = NativeModules;

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  url: string;
  artwork?: string;
  duration?: number;
}

interface Playlist {
  id: string;
  title: string;
  subtitle: string;
}

interface Album {
  id: string;
  title: string;
  artist: string;
}

class AndroidAutoModule {
  private eventEmitter: NativeEventEmitter | null = null;

  constructor() {
    if (Platform.OS === 'android' && MusicBridge) {
      this.eventEmitter = new NativeEventEmitter(MusicBridge);
    }
  }

  startService() {
    if (Platform.OS === 'android' && MusicBridge) {
      MusicBridge.startService();
    }
  }

  updateTrendingSongs(songs: Song[]) {
    if (Platform.OS === 'android' && MusicBridge) {
      MusicBridge.updateTrendingSongs(songs);
    }
  }

  updatePlaylists(playlists: Playlist[]) {
    if (Platform.OS === 'android' && MusicBridge) {
      MusicBridge.updatePlaylists(playlists);
    }
  }

  updateAlbums(albums: Album[]) {
    if (Platform.OS === 'android' && MusicBridge) {
      MusicBridge.updateAlbums(albums);
    }
  }

  updatePlaylistSongs(playlistId: string, songs: Song[]) {
    if (Platform.OS === 'android' && MusicBridge) {
      MusicBridge.updatePlaylistSongs(playlistId, songs);
    }
  }

  updateAlbumSongs(albumId: string, songs: Song[]) {
    if (Platform.OS === 'android' && MusicBridge) {
      MusicBridge.updateAlbumSongs(albumId, songs);
    }
  }

  onPlaybackCommand(callback: (command: string) => void) {
    if (this.eventEmitter) {
      return this.eventEmitter.addListener('AndroidAutoPlaybackCommand', callback);
    }
    return { remove: () => {} };
  }

  onPlayFromMediaId(callback: (mediaId: string) => void) {
    if (this.eventEmitter) {
      return this.eventEmitter.addListener('AndroidAutoPlayFromMediaId', callback);
    }
    return { remove: () => {} };
  }

  onSeekTo(callback: (position: number) => void) {
    if (this.eventEmitter) {
      return this.eventEmitter.addListener('AndroidAutoSeekTo', callback);
    }
    return { remove: () => {} };
  }
}

export default new AndroidAutoModule();
