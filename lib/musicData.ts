export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  genre: string;
  audioUrl: string;
  year?: string;
  language?: string;
  hasLyrics?: boolean;
  source?: "jiosaavn" | "local";
}

export interface JioSaavnImage {
  quality: string;
  url: string;
}

export interface JioSaavnSong {
  id: string;
  name: string;
  type: string;
  year: string;
  duration: number;
  language: string;
  hasLyrics: boolean;
  album: { id: string; name: string; url: string };
  artists: {
    primary: Array<{ id: string; name: string; image: JioSaavnImage[]; url: string }>;
    featured: Array<{ id: string; name: string; image: JioSaavnImage[]; url: string }>;
    all: Array<{ id: string; name: string; role: string; image: JioSaavnImage[]; url: string }>;
  };
  image: JioSaavnImage[];
  downloadUrl: JioSaavnImage[];
}

export interface JioSaavnPlaylist {
  id: string;
  name: string;
  type: string;
  image: JioSaavnImage[];
  url: string;
  songCount: number;
  language: string;
  description?: string;
  songs?: JioSaavnSong[];
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  songs: string[];
  songData?: Song[];
  isUserCreated?: boolean;
  isJioSaavn?: boolean;
  jiosaavnId?: string;
  songCount?: number;
}

export interface Genre {
  id: string;
  name: string;
  color: string;
}

export function getBestImageUrl(images: JioSaavnImage[]): string {
  if (!images || images.length === 0) return "";
  const sorted = [...images].sort((a, b) => {
    const qualityOrder: Record<string, number> = { "500x500": 3, "150x150": 2, "50x50": 1 };
    return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
  });
  return sorted[0]?.url || "";
}

export function getBestAudioUrl(downloadUrls: JioSaavnImage[]): string {
  if (!downloadUrls || downloadUrls.length === 0) return "";
  const sorted = [...downloadUrls].sort((a, b) => {
    const qualityOrder: Record<string, number> = { "320kbps": 4, "160kbps": 3, "96kbps": 2, "48kbps": 1, "12kbps": 0 };
    return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
  });
  return sorted[0]?.url || "";
}

export function convertJioSaavnSong(song: JioSaavnSong): Song {
  const artistNames = song.artists?.primary?.map(a => a.name).join(", ") || "Unknown Artist";
  return {
    id: song.id,
    title: song.name || "Unknown",
    artist: artistNames,
    album: song.album?.name || "",
    duration: song.duration || 0,
    coverUrl: getBestImageUrl(song.image),
    genre: song.language || "",
    audioUrl: getBestAudioUrl(song.downloadUrl),
    year: song.year,
    language: song.language,
    hasLyrics: song.hasLyrics,
    source: "jiosaavn",
  };
}

export function convertJioSaavnPlaylist(playlist: JioSaavnPlaylist): Playlist {
  const convertedSongs = playlist.songs?.map(convertJioSaavnSong) || [];
  return {
    id: `jiosaavn_${playlist.id}`,
    name: playlist.name,
    description: playlist.description || `${playlist.songCount || 0} songs`,
    coverUrl: getBestImageUrl(playlist.image),
    songs: convertedSongs.map(s => s.id),
    songData: convertedSongs,
    isJioSaavn: true,
    jiosaavnId: playlist.id,
    songCount: playlist.songCount,
  };
}

export const genres: Genre[] = [
  { id: "bollywood", name: "Bollywood", color: "#E13300" },
  { id: "punjabi", name: "Punjabi", color: "#BA5D07" },
  { id: "romantic", name: "Romantic", color: "#DC148C" },
  { id: "party", name: "Party", color: "#7358FF" },
  { id: "devotional", name: "Devotional", color: "#ffa726" },
  { id: "retro", name: "Retro Hits", color: "#ab47bc" },
  { id: "pop", name: "Pop", color: "#8C67AC" },
  { id: "hip-hop", name: "Hip-Hop", color: "#E8115B" },
  { id: "tamil", name: "Tamil", color: "#26a69a" },
  { id: "telugu", name: "Telugu", color: "#1ABC9C" },
  { id: "english", name: "English", color: "#42a5f5" },
  { id: "lofi", name: "Lo-Fi", color: "#477D95" },
];

export function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
