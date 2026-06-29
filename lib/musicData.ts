import { mapFilter, sortedCopy } from "@/lib/arrayUtils";
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  genre: string;
  mood?: string | string[];
  audioUrl: string;
  year?: string;
  language?: string;
  popularity?: number;
  source?: "jiosaavn" | "local" | "youtube";
  playCount?: number; // JioSaavn real play count
  videoId?: string;
  youtubeVideoId?: string;
  youtubeVisualVideoId?: string;
  youtubeVideoType?: string;
  youtubeNativeAudio?: boolean;
  youtubeAudioExpiresAt?: number;
  playbackHeaders?: Record<string, string>;
  downloadUrl?: unknown;
  bitrateKbps?: number;
  audioCodec?: string;
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
  album: { id: string; name: string; url: string };
  artists: {
    primary: Array<{ id: string; name: string; image: JioSaavnImage[]; url: string }>;
    featured: Array<{ id: string; name: string; image: JioSaavnImage[]; url: string }>;
    all: Array<{ id: string; name: string; role: string; image: JioSaavnImage[]; url: string }>;
  };
  image: JioSaavnImage[];
  downloadUrl?: unknown;
  audioUrl?: unknown;
  url?: string;
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

function normalizeJioSaavnImageUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";

  // Prefer higher-res covers to avoid badge-like thumbnail variants.
  return trimmed
    .replace(/50x50/gi, "500x500")
    .replace(/150x150/gi, "500x500")
    .replace(/_50x50\./gi, "_500x500.")
    .replace(/_150x150\./gi, "_500x500.")
    .replace(/-50x50\./gi, "-500x500.")
    .replace(/-150x150\./gi, "-500x500.");
}

function qualityScore(quality: string | undefined, url: string | undefined): number {
  const qualityKey = String(quality || "").trim().toLowerCase();
  const direct: Record<string, number> = {
    "500x500": 3,
    "150x150": 2,
    "50x50": 1,
  };
  if (qualityKey in direct) return direct[qualityKey];

  const match = String(url || "").match(/(\d{2,4})x(\d{2,4})/i);
  if (!match) return 0;
  const width = Number(match[1]) || 0;
  const height = Number(match[2]) || 0;
  return Math.max(width, height);
}

export function getBestImageUrl(images: JioSaavnImage[]): string {
  if (!images || images.length === 0) return "";
  const sorted = sortedCopy(images, (a, b) => {
    return qualityScore(b.quality, b.url) - qualityScore(a.quality, a.url);
  });
  return normalizeJioSaavnImageUrl(sorted[0]?.url || "");
}

type AudioCandidate = {
  quality: string;
  url: string;
};

function normalizeAudioCandidates(downloadUrls: unknown): AudioCandidate[] {
  if (!downloadUrls) return [];

  if (typeof downloadUrls === "string") {
    const url = downloadUrls.trim();
    return url ? [{ quality: "320kbps", url }] : [];
  }

  if (Array.isArray(downloadUrls)) {
    return mapFilter(downloadUrls, (item) => {
        if (typeof item === "string") {
          const url = item.trim();
          return url ? { quality: "", url } : null;
        }

        if (!item || typeof item !== "object") return null;
        const obj = item as { quality?: unknown; url?: unknown; link?: unknown };
        const urlValue = typeof obj.url === "string" ? obj.url : typeof obj.link === "string" ? obj.link : "";
        const qualityValue = typeof obj.quality === "string" ? obj.quality : "";
        const url = urlValue.trim();
        if (!url) return null;
        return { quality: qualityValue, url };
      }, (item): item is AudioCandidate => Boolean(item));
  }

  if (typeof downloadUrls === "object") {
    const obj = downloadUrls as { url?: unknown; link?: unknown };
    const urlValue = typeof obj.url === "string" ? obj.url : typeof obj.link === "string" ? obj.link : "";
    const url = urlValue.trim();
    if (url) return [{ quality: "", url }];
  }

  return [];
}

function getBestAudioUrl(downloadUrls: unknown): string {
  const candidates = normalizeAudioCandidates(downloadUrls);
  if (candidates.length === 0) return "";

  // Official method: Always prioritize highest quality audio (320kbps) for best sound
  const sorted = sortedCopy(candidates, (a, b) => {
    const qualityOrder: Record<string, number> = { "320kbps": 4, "160kbps": 3, "96kbps": 2, "48kbps": 1, "12kbps": 0 };
    return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
  });
  return sorted[0]?.url || "";
}

export function getBestAudioUrlWithQuality(downloadUrls: unknown, quality: "low" | "medium" | "high"): string {
  const candidates = normalizeAudioCandidates(downloadUrls);
  if (candidates.length === 0) return "";

  // Official JioSaavn quality levels: 320kbps (high), 160kbps (medium), 96kbps (low)
  const targetQualityOrder: Record<string, string[]> = {
    low: ["96kbps", "48kbps", "12kbps", "160kbps", "320kbps"],
    medium: ["160kbps", "96kbps", "320kbps", "48kbps", "12kbps"],
    high: ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"], // Always prefer 320kbps for best quality
  };

  const preference = targetQualityOrder[quality] || targetQualityOrder.high;
  const candidatesByQuality = new Map(candidates.map((candidate) => [candidate.quality, candidate]));

  for (const pref of preference) {
    const found = candidatesByQuality.get(pref);
    if (found) return found.url;
  }

  return getBestAudioUrl(downloadUrls);
}

export function convertJioSaavnSong(song: JioSaavnSong): Song {
  const artistNames = song.artists?.primary?.map(a => a.name).join(", ") || "Unknown Artist";
  const audioUrl = getBestAudioUrl(song.downloadUrl || song.audioUrl || song.url);
  let bitrateKbps = 320;
  if (audioUrl.includes("_96.")) bitrateKbps = 96;
  else if (audioUrl.includes("_160.")) bitrateKbps = 160;
  else if (audioUrl.includes("_48.")) bitrateKbps = 48;
  else if (audioUrl.includes("_12.")) bitrateKbps = 12;

  return {
    id: song.id,
    title: song.name || "Unknown",
    artist: artistNames,
    album: song.album?.name || "",
    duration: song.duration || 0,
    coverUrl: getBestImageUrl(song.image),
    genre: song.language || "",
    audioUrl,
    downloadUrl: song.downloadUrl || song.audioUrl || song.url,
    year: song.year,
    language: song.language,
    source: "jiosaavn",
    bitrateKbps,
    audioCodec: "aac",
  };
}

function convertJioSaavnPlaylist(playlist: JioSaavnPlaylist): Playlist {
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

const genres: Genre[] = [
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

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
