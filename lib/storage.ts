import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song, Playlist } from "./musicData";

const KEYS = {
  LIKED_SONGS: "@mavrixfy_liked_songs",
  LIKED_SONGS_DATA: "@mavrixfy_liked_songs_data",
  USER_PLAYLISTS: "@mavrixfy_user_playlists",
  RECENTLY_PLAYED: "@mavrixfy_recently_played",
  SETTINGS: "@mavrixfy_settings",
} as const;

export interface RecentlyPlayedItem {
  id: string;
  name: string;
  imageUrl: string;
  type: "playlist" | "jiosaavn-playlist" | "song";
  lastPlayed: number;
  data?: any;
}

export interface UserPlaylist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  songs: Song[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  streamingQuality: "low" | "medium" | "high";
  downloadQuality: "low" | "medium" | "high";
  equalizer: Record<string, number>;
  equalizerEnabled: boolean;
  crossfade: number;
  gapless: boolean;
  normalizeVolume: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  streamingQuality: "high",
  downloadQuality: "high",
  equalizer: {
    "60Hz": 0,
    "150Hz": 0,
    "400Hz": 0,
    "1KHz": 0,
    "2.4KHz": 0,
    "15KHz": 0,
  },
  equalizerEnabled: false,
  crossfade: 0,
  gapless: true,
  normalizeVolume: false,
};

export const EQUALIZER_PRESETS: Record<string, Record<string, number>> = {
  Flat: { "60Hz": 0, "150Hz": 0, "400Hz": 0, "1KHz": 0, "2.4KHz": 0, "15KHz": 0 },
  Bass: { "60Hz": 6, "150Hz": 5, "400Hz": 2, "1KHz": 0, "2.4KHz": -1, "15KHz": -2 },
  Treble: { "60Hz": -2, "150Hz": -1, "400Hz": 0, "1KHz": 2, "2.4KHz": 5, "15KHz": 6 },
  Rock: { "60Hz": 5, "150Hz": 3, "400Hz": -1, "1KHz": 2, "2.4KHz": 4, "15KHz": 5 },
  Pop: { "60Hz": -1, "150Hz": 2, "400Hz": 4, "1KHz": 4, "2.4KHz": 2, "15KHz": -1 },
  Jazz: { "60Hz": 3, "150Hz": 1, "400Hz": -1, "1KHz": 1, "2.4KHz": 3, "15KHz": 4 },
  Classical: { "60Hz": 4, "150Hz": 3, "400Hz": 0, "1KHz": 0, "2.4KHz": 2, "15KHz": 4 },
  "Hip-Hop": { "60Hz": 6, "150Hz": 5, "400Hz": 1, "1KHz": -1, "2.4KHz": 2, "15KHz": 0 },
  Electronic: { "60Hz": 5, "150Hz": 4, "400Hz": 0, "1KHz": -1, "2.4KHz": 3, "15KHz": 5 },
  Vocal: { "60Hz": -2, "150Hz": 0, "400Hz": 3, "1KHz": 5, "2.4KHz": 3, "15KHz": 0 },
  "Late Night": { "60Hz": 3, "150Hz": 2, "400Hz": 1, "1KHz": -1, "2.4KHz": -2, "15KHz": -3 },
  Bollywood: { "60Hz": 4, "150Hz": 3, "400Hz": 1, "1KHz": 2, "2.4KHz": 4, "15KHz": 3 },
};

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function getLikedSongIds(): Promise<string[]> {
  return getJSON<string[]>(KEYS.LIKED_SONGS, []);
}

export async function getLikedSongsData(): Promise<Song[]> {
  return getJSON<Song[]>(KEYS.LIKED_SONGS_DATA, []);
}

export async function addLikedSong(song: Song): Promise<void> {
  const ids = await getLikedSongIds();
  const data = await getLikedSongsData();
  if (!ids.includes(song.id)) {
    ids.unshift(song.id);
    data.unshift(song);
    await Promise.all([
      setJSON(KEYS.LIKED_SONGS, ids),
      setJSON(KEYS.LIKED_SONGS_DATA, data),
    ]);
  }
}

export async function removeLikedSong(songId: string): Promise<void> {
  const ids = await getLikedSongIds();
  const data = await getLikedSongsData();
  await Promise.all([
    setJSON(KEYS.LIKED_SONGS, ids.filter(id => id !== songId)),
    setJSON(KEYS.LIKED_SONGS_DATA, data.filter(s => s.id !== songId)),
  ]);
}

export async function isLikedSong(songId: string): Promise<boolean> {
  const ids = await getLikedSongIds();
  return ids.includes(songId);
}

export async function getUserPlaylists(): Promise<UserPlaylist[]> {
  return getJSON<UserPlaylist[]>(KEYS.USER_PLAYLISTS, []);
}

export async function saveUserPlaylists(playlists: UserPlaylist[]): Promise<void> {
  await setJSON(KEYS.USER_PLAYLISTS, playlists);
}

export async function createUserPlaylist(name: string, description?: string): Promise<UserPlaylist> {
  const playlists = await getUserPlaylists();
  const newPlaylist: UserPlaylist = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    description: description || "",
    coverUrl: "",
    songs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  playlists.unshift(newPlaylist);
  await saveUserPlaylists(playlists);
  return newPlaylist;
}

export async function deleteUserPlaylist(playlistId: string): Promise<void> {
  const playlists = await getUserPlaylists();
  await saveUserPlaylists(playlists.filter(p => p.id !== playlistId));
}

export async function addSongToPlaylist(playlistId: string, song: Song): Promise<void> {
  const playlists = await getUserPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return;
  if (playlists[idx].songs.some(s => s.id === song.id)) return;
  playlists[idx].songs.push(song);
  playlists[idx].updatedAt = Date.now();
  if (!playlists[idx].coverUrl && song.coverUrl) {
    playlists[idx].coverUrl = song.coverUrl;
  }
  await saveUserPlaylists(playlists);
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  const playlists = await getUserPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return;
  playlists[idx].songs = playlists[idx].songs.filter(s => s.id !== songId);
  playlists[idx].updatedAt = Date.now();
  await saveUserPlaylists(playlists);
}

export async function getRecentlyPlayed(): Promise<RecentlyPlayedItem[]> {
  return getJSON<RecentlyPlayedItem[]>(KEYS.RECENTLY_PLAYED, []);
}

export async function addRecentlyPlayed(item: Omit<RecentlyPlayedItem, "lastPlayed">): Promise<void> {
  const items = await getRecentlyPlayed();
  const filtered = items.filter(i => i.id !== item.id);
  filtered.unshift({ ...item, lastPlayed: Date.now() });
  await setJSON(KEYS.RECENTLY_PLAYED, filtered.slice(0, 30));
}

export async function getSettings(): Promise<AppSettings> {
  return getJSON<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await setJSON(KEYS.SETTINGS, { ...current, ...settings });
}
