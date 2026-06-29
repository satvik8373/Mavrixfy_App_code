import AsyncStorage from "@react-native-async-storage/async-storage";

import { JioSaavnImage, Song } from "@/lib/musicData";
import { getYouTubeMusicApiUrl } from "@/lib/api-config";
import { PRODUCTION_YOUTUBE_MUSIC_API_URL } from "@/lib/youtube-music-config";
import { compactMap, mapFilter, sortedCopy } from "@/lib/arrayUtils";
import { logger } from "@/lib/logger";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface YouTubeMusicTrack {
  videoId: string;
  title: string;
  artists: Array<{ name: string; id?: string }>;
  album?: { name: string; id?: string };
  duration?: number | string; // seconds or mm:ss from the youtubei.js backend
  duration_seconds?: number;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  videoType?: string;
  counterpart?: {
    videoId?: string;
    title?: string;
    length?: string;
    thumbnails?: Array<{ url: string; width: number; height: number }>;
    videoType?: string;
  } | null;
  isExplicit?: boolean;
  year?: string;
}

export interface YouTubeMusicPlaylist {
  browseId: string;
  title: string;
  description?: string;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  trackCount?: number;
  tracks?: YouTubeMusicTrack[];
}

export interface YouTubeMusicArtist {
  browseId: string;
  name: string;
  description?: string;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  subscribers?: string;
  tracks?: YouTubeMusicTrack[];
  albums?: YouTubeMusicAlbum[];
}

export interface YouTubeMusicAlbum {
  browseId: string;
  title: string;
  artists?: Array<{ name: string; id?: string }>;
  year?: string;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  trackCount?: number;
  tracks?: YouTubeMusicTrack[];
}

export interface YouTubeMusicSearchResult {
  category: "song" | "video" | "album" | "artist" | "playlist";
  resultType: string;
  data: YouTubeMusicTrack | YouTubeMusicAlbum | YouTubeMusicArtist | YouTubeMusicPlaylist;
}

export interface YouTubeMusicWatchPlaylist {
  tracks: YouTubeMusicTrack[];
  playlistId?: string | null;
}

export interface YouTubeMusicAudioStream {
  videoId: string;
  url: string;
  expiresAt: number;
  headers: Record<string, string>;
  mimeType?: string;
  formatId?: string;
  audioCodec?: string;
  bitrateKbps?: number | null;
  duration?: number | null;
}

const YOUTUBE_MUSIC_CACHE_PREFIX = "@mavrixfy_youtube_music";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT_MS = 30000;
const PRIVATE_DEVELOPMENT_REQUEST_TIMEOUT_MS = 1800;
const OFFICIAL_VISUAL_SEARCH_CACHE_VERSION = "v1";
const YOUTUBE_VIDEO_SEARCH_CACHE_VERSION = "v2";
const AUDIO_STREAM_EXPIRY_MARGIN_MS = 60 * 1000;
const AUDIO_STREAM_CACHE_MAX_ITEMS = 50;
const audioStreamCache = new Map<string, YouTubeMusicAudioStream>();
const audioStreamRequests = new Map<string, Promise<YouTubeMusicAudioStream | null>>();

// â”€â”€â”€ Cache Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getCached<T>(key: string, ttl: number): Promise<T | null> {
  try {
    const [[, data], [, time]] = await AsyncStorage.multiGet([key, `${key}:time`]);
    if (!data || !time) return null;
    const timestamp = Number(time);
    if (!timestamp || Date.now() - timestamp > ttl) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    logger.warn('[YouTube Music Cache] Failed to get cached data:', error);
    return null;
  }
}

async function setCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [key, JSON.stringify(value)],
      [`${key}:time`, String(Date.now())],
    ]);
  } catch { }
}

// â”€â”€â”€ Normalization Functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function upscaleYouTubeThumbnail(url: string): string {
  if (!url) return "";

  // 1. Googleusercontent / ggpht / yt3 images
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com") || url.includes("yt3.ggpht.com") || url.includes("yt3.googleusercontent.com")) {
    // Replace width/height parameters with 500x500
    return url.replace(/=w\d+-h\d+(?:-[a-zA-Z0-9-]+)?$/, "=w500-h500-l90-rj");
  }

  // 2. Standard YouTube video thumbnails
  if (url.includes("i.ytimg.com/vi/") || url.includes("img.youtube.com/vi/")) {
    // Extract video ID from URL
    const match = url.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    if (match && match[1]) {
      const videoId = match[1];
      return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
  }
  return url;
}

function normalizeYouTubeThumbnails(thumbnails?: Array<{ url: string; width: number; height: number }>): JioSaavnImage[] {
  if (!thumbnails || thumbnails.length === 0) return [];

  return thumbnails.map((thumb) => ({
    quality: "500x500",
    url: upscaleYouTubeThumbnail(thumb.url),
  }));
}

export function getBestThumbnailUrl(thumbnails?: Array<{ url: string; width: number; height: number }>): string {
  if (!thumbnails || thumbnails.length === 0) return "";

  // Sort by resolution (largest first)
  const sorted = sortedCopy(thumbnails, (a, b) => {
    const aRes = a.width * a.height;
    const bRes = b.width * b.height;
    return bRes - aRes;
  });

  return upscaleYouTubeThumbnail(sorted[0]?.url || "");
}

export function getBestYouTubeThumbnailUrl(thumbnails?: Array<{ url: string; width: number; height: number }>): string {
  return getBestThumbnailUrl(thumbnails);
}

export function normalizeYouTubeArtworkUrl(url: string): string {
  return upscaleYouTubeThumbnail(url);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractVideoId(track: any): string {
  const candidates = [
    track?.videoId,
    track?.video_id,
    track?.youtubeId,
    track?.youtube_id,
    track?.id,
  ];

  for (const candidate of candidates) {
    const value = readString(candidate);
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
      return value;
    }
  }

  const watchUrl = readString(track?.url || track?.videoUrl || track?.watchUrl);
  const match = watchUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return match?.[1] || match?.[2] || "";
}

function normalizeArtists(raw: unknown): Array<{ name: string; id?: string }> {
  if (!Array.isArray(raw)) return [];

  return compactMap(raw, (artist: any) => {
    if (typeof artist === "string") {
      const name = artist.trim();
      return name ? { name } : null;
    }

    const name = readString(artist?.name || artist?.title);
    if (!name) return null;

    const id = readString(artist?.id || artist?.browseId || artist?.channelId);
    return id ? { name, id } : { name };
  });
}

function normalizeThumbnails(raw: unknown): Array<{ url: string; width: number; height: number }> {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.thumbnails)
      ? (raw as any).thumbnails
      : [];

  return compactMap(source, (thumb: any) => {
    const url = readString(thumb?.url || thumb?.link);
    if (!url) return null;

    return {
      url,
      width: Number(thumb?.width) || 0,
      height: Number(thumb?.height) || 0,
    };
  });
}

function normalizeCounterpart(raw: unknown): YouTubeMusicTrack["counterpart"] {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as any;
  const videoId = extractVideoId(source);
  if (!videoId) return null;

  return {
    videoId,
    title: readString(source?.title || source?.name) || undefined,
    length: readString(source?.length || source?.duration) || undefined,
    thumbnails: normalizeThumbnails(source?.thumbnails || source?.thumbnail || source?.image),
    videoType: readString(source?.videoType) || undefined,
  };
}

function normalizeTrackShape(track: any): YouTubeMusicTrack | null {
  const videoId = extractVideoId(track);
  const title = readString(track?.title || track?.name);
  if (!videoId || !title) return null;

  const album =
    typeof track?.album === "string"
      ? { name: track.album }
      : track?.album && typeof track.album === "object"
        ? {
          name: readString(track.album.name || track.album.title),
          id: readString(track.album.id || track.album.browseId) || undefined,
        }
        : undefined;

  return {
    ...track,
    videoId,
    title,
    artists: normalizeArtists(track?.artists || track?.artist),
    album: album?.name ? album : undefined,
    duration: track?.duration || track?.length,
    duration_seconds: Number(track?.duration_seconds || track?.durationSeconds || track?.lengthSeconds) || undefined,
    thumbnails: normalizeThumbnails(track?.thumbnails || track?.thumbnail || track?.image),
    videoType: readString(track?.videoType) || undefined,
    counterpart: normalizeCounterpart(track?.counterpart),
    isExplicit: Boolean(track?.isExplicit),
    year: readString(track?.year) || undefined,
  };
}

function parseDurationSeconds(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, raw);
  }

  if (typeof raw !== "string") return 0;
  const value = raw.trim();
  if (!value) return 0;

  if (value.includes(":")) {
    const parts = value.split(":").map(Number);
    if (parts.every((part) => Number.isFinite(part) && part >= 0)) {
      return parts.reduce((total, part) => total * 60 + part, 0);
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}



/**
 * Convert YouTube Music track to app's Song format
 * Handles the normalized response format from the Node youtubei.js backend.
 */
export function convertYouTubeMusicTrack(track: any): Song | null {
  const normalizedTrack = normalizeTrackShape(track);
  if (!normalizedTrack) return null;

  // Handle artists array from the backend.
  const artistsArray = normalizedTrack.artists || [];
  const artistNames = compactMap(artistsArray, (a: any) => a?.name || null);
  const artist = artistNames.join(", ") || "Unknown Artist";

  // Duration: use duration_seconds if available, otherwise parse duration string
  const duration =
    parseDurationSeconds(normalizedTrack.duration_seconds) ||
    parseDurationSeconds(normalizedTrack.duration);

  // Get thumbnail URL from thumbnails array (use largest available)
  const thumbnails = normalizedTrack.thumbnails || [];
  const coverUrl = getBestThumbnailUrl(thumbnails);

  // Album info
  const albumName = normalizedTrack.album?.name || normalizedTrack.title;
  const visualVideoId = normalizedTrack.counterpart?.videoId || normalizedTrack.videoId;

  return {
    id: `youtube_${normalizedTrack.videoId}`,
    title: normalizedTrack.title,
    artist,
    album: albumName,
    duration,
    coverUrl,
    genre: "YouTube Music",
    audioUrl: "", // YouTube songs play through the embedded iframe player.
    year: normalizedTrack.year?.toString(),
    source: "youtube",
    videoId: normalizedTrack.videoId,
    youtubeVideoId: normalizedTrack.videoId,
    youtubeVisualVideoId: visualVideoId,
    youtubeVideoType: normalizedTrack.videoType,
  };
}

// â”€â”€â”€ Timeout Wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createTimeoutSignal(ms: number = REQUEST_TIMEOUT_MS, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const abort = () => controller.abort();

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
    },
  };
}

function isAbortLikeError(error: unknown): boolean {
  const err = error as { name?: unknown; message?: unknown } | null | undefined;
  const name = typeof err?.name === "string" ? err.name : "";
  const message = typeof err?.message === "string" ? err.message : "";
  return name === "AbortError" || message === "Aborted" || message === "Request aborted";
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const timeout = createTimeoutSignal(
    isPrivateDevelopmentApiUrl(url) ? PRIVATE_DEVELOPMENT_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    signal
  );
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } finally {
    timeout.cleanup();
  }
}

async function fetchFirstJson<T>(urls: string[], signal?: AbortSignal): Promise<T | null> {
  if (signal?.aborted) {
    throw new Error("Request aborted");
  }

  let lastError: unknown = null;

  for (const url of urls) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- endpoint fallbacks must stay sequential to avoid duplicate backend work.
      const result = await fetchJson<T>(url, signal);
      if (result !== null) return result;
      lastError = null;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function fetchFirstJsonSequential<T>(urls: string[], signal?: AbortSignal): Promise<T | null> {
  return fetchFirstJson<T>(urls, signal);
}

function isPrivateDevelopmentApiUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "10.0.2.2" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

function getEndpointCandidates(
  path: string,
  _legacyNodePath?: string,
  query: string | string[] = ""
): string[] {
  const appBase = getYouTubeMusicApiUrl().replace(/\/+$/, "");
  const productionBase = PRODUCTION_YOUTUBE_MUSIC_API_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const primaryPathCandidates = isPrivateDevelopmentApiUrl(appBase)
    ? [`${appBase}${normalizedPath}`]
    : appBase.includes("/api/youtube-music")
      ? [`${appBase}${normalizedPath}`, `${appBase}/api${normalizedPath}`]
      : [
        `${appBase}${normalizedPath}`,
        `${appBase}/api/youtube-music${normalizedPath}`,
        `${appBase}/api${normalizedPath}`,
      ];
  const productionPathCandidates = productionBase.includes("/api/youtube-music")
    ? [`${productionBase}${normalizedPath}`, `${productionBase}/api${normalizedPath}`]
    : [
      `${productionBase}${normalizedPath}`,
      `${productionBase}/api/youtube-music${normalizedPath}`,
      `${productionBase}/api${normalizedPath}`,
    ];
  const pathCandidates = isPrivateDevelopmentApiUrl(appBase)
    ? [...primaryPathCandidates, ...productionPathCandidates]
    : primaryPathCandidates;
  const queryCandidates = Array.isArray(query) ? query : [query];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const queryCandidate of queryCandidates) {
    const suffix = queryCandidate ? `?${queryCandidate}` : "";
    for (const pathCandidate of pathCandidates) {
      const candidate = `${pathCandidate}${suffix}`;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      candidates.push(candidate);
    }
  }

  return candidates;
}

function getSearchQueryCandidates(query: string, filter: string, limit: number): string[] {
  const encodedQuery = encodeURIComponent(query);
  return [
    `query=${encodedQuery}&filter=${filter}&limit=${limit}`,
    `q=${encodedQuery}&filter=${filter}&limit=${limit}`,
  ];
}

function getSearchResultItems(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

function getSearchSuggestionItems(json: any): string[] {
  if (Array.isArray(json)) return compactMap(json, (item: unknown) => (typeof item === "string" ? item : null));
  if (Array.isArray(json?.suggestions)) return compactMap(json.suggestions, (item: unknown) => (typeof item === "string" ? item : null));
  if (Array.isArray(json?.data?.suggestions)) return compactMap(json.data.suggestions, (item: unknown) => (typeof item === "string" ? item : null));
  if (Array.isArray(json?.data)) return compactMap(json.data, (item: unknown) => (typeof item === "string" ? item : null));
  return [];
}

function normalizeAudioStreamPayload(json: any, videoId: string): YouTubeMusicAudioStream | null {
  const source = getResponsePayload(json, "stream", "audio");
  const url = readString(source?.url);
  if (!url.startsWith("https://")) return null;

  const rawExpiry = Number(source?.expiresAt);
  const expiresAt = Number.isFinite(rawExpiry) && rawExpiry > 0
    ? rawExpiry < 1_000_000_000_000
      ? rawExpiry * 1000
      : rawExpiry
    : Date.now() + 10 * 60 * 1000;
  const headers: Record<string, string> = {};
  if (source?.headers && typeof source.headers === "object") {
    for (const [key, value] of Object.entries(source.headers)) {
      if (!key || typeof value !== "string") continue;
      const normalizedValue = value.trim();
      if (normalizedValue) headers[key] = normalizedValue;
    }
  }

  return {
    videoId,
    url,
    expiresAt,
    headers,
    mimeType: readString(source?.mimeType) || undefined,
    formatId: readString(source?.formatId) || undefined,
    audioCodec: readString(source?.audioCodec) || undefined,
    bitrateKbps: Number.isFinite(Number(source?.bitrateKbps)) ? Number(source.bitrateKbps) : null,
    duration: Number.isFinite(Number(source?.duration)) ? Number(source.duration) : null,
  };
}

function getChartsPayload(json: any): any {
  if (json?.charts && typeof json.charts === "object") return json.charts;
  if (json?.data?.charts && typeof json.data.charts === "object") return json.data.charts;
  if (json?.data && typeof json.data === "object") return json.data;
  return json;
}

function getChartPlaylistItems(json: any): any[] {
  const charts = getChartsPayload(json);
  const playlists: any[] = [];
  const append = (value: any) => {
    if (Array.isArray(value)) {
      playlists.push(...value);
      return;
    }

    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.playlists)) playlists.push(...value.playlists);
    if (Array.isArray(value.items)) playlists.push(...value.items);
    if (value.playlistId || value.browseId) playlists.push(value);
  };

  append(charts?.daily);
  append(charts?.videos);
  append(charts?.weekly);
  append(charts?.trending);
  append(charts?.playlists);
  append(charts?.songs);

  return playlists;
}

function getResponsePayload(json: any, ...keys: string[]): any {
  if (!json || typeof json !== "object") return json;

  for (const key of keys) {
    if (json[key] && typeof json[key] === "object") {
      return json[key];
    }
  }

  if (json.data && typeof json.data === "object") {
    return json.data;
  }

  return json;
}

function normalizePlaylistPayload(playlist: any, fallbackId: string): YouTubeMusicPlaylist {
  return {
    ...playlist,
    browseId: readString(playlist?.browseId || playlist?.id || playlist?.playlistId) || fallbackId,
    tracks: Array.isArray(playlist?.tracks) ? playlist.tracks : [],
  };
}

function normalizeAlbumPayload(album: any, fallbackId: string): YouTubeMusicAlbum {
  return {
    ...album,
    browseId: readString(album?.browseId || album?.id || album?.playlistId) || fallbackId,
    tracks: Array.isArray(album?.tracks) ? album.tracks : [],
  };
}

function normalizeArtistPayload(artist: any, fallbackId: string): YouTubeMusicArtist {
  return {
    ...artist,
    browseId: readString(artist?.browseId || artist?.channelId || artist?.id) || fallbackId,
    tracks: Array.isArray(artist?.tracks)
      ? artist.tracks
      : Array.isArray(artist?.songs)
        ? artist.songs
        : [],
    albums: Array.isArray(artist?.albums) ? artist.albums : [],
  };
}

// â”€â”€â”€ API Functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Search YouTube Music for songs, albums, artists, or playlists
 */
export async function searchYouTubeMusic(
  query: string,
  type: "song" | "album" | "artist" | "playlist" = "song",
  limit: number = 20,
  signal?: AbortSignal
): Promise<Song[]> {
  const q = query.trim();
  if (!q) {
    logger.debug("[YouTube Music] Empty query, returning empty array");
    return [];
  }

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:${type}:${limit}:${q.toLowerCase()}`;

  const cached = await getCached<Song[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) {
    return cached;
  }

  try {
    const filterType = type === 'song' ? 'songs' : type === 'album' ? 'albums' : type === 'artist' ? 'artists' : type === 'playlist' ? 'playlists' : 'songs';
    const urls = getEndpointCandidates(
      "/search",
      "/search",
      getSearchQueryCandidates(q, filterType, limit)
    );

    const json = await fetchFirstJson<any>(urls, signal);
    if (!json) {
      logger.warn("[YouTube Music] Search returned no response");
      return [];
    }

    const results = getSearchResultItems(json);

    const songs = mapFilter(
      results,
      (item: any) => {
        if (type === "song") {
          return convertYouTubeMusicTrack(item);
        }
        return null;
      },
      (song): song is Song => song !== null
    );

    // Only cache if we have results
    if (songs.length > 0) {
      await setCache(cacheKey, songs);
    }

    return songs;
  } catch (error: any) {
    // Abort errors are expected when user types quickly - don't log them
    if (error?.message === "Request aborted" || signal?.aborted) {
      return [];
    }
    logger.warn("[YouTube Music] Search failed (continuing without YouTube results):", error?.message || error);
    return [];
  }
}

/**
 * Search YouTube Music for videos (with movement / actual motion)
 */
export async function searchYouTubeMusicVideos(
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<Song[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:video:${YOUTUBE_VIDEO_SEARCH_CACHE_VERSION}:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<Song[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        "/search",
        "/search",
        getSearchQueryCandidates(q, "videos", limit)
      ),
      signal
    );
    const results = getSearchResultItems(json);
    const songs: Song[] = mapFilter(
      results,
      (item: any) => {
        const song = convertYouTubeMusicTrack(item);
        if (song && !song.youtubeVideoType) {
          song.youtubeVideoType = "video";
        }
        return song;
      },
      (song): song is Song => song !== null
    );

    if (songs.length > 0) {
      await setCache(cacheKey, songs);
    }
    return songs;
  } catch (error: any) {
    // Abort errors are expected when user types quickly - don't log them
    if (error?.message === "Request aborted" || signal?.aborted) {
      return [];
    }
    logger.warn("[YouTube Music] Video search failed:", error);
    return [];
  }
}

/**
 * Search YouTube Music for playlists
 */
export async function searchYouTubeMusicPlaylists(
  query: string,
  limit = 10,
  signal?: AbortSignal
): Promise<YouTubeMusicPlaylistCard[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:playlist:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        "/search",
        "/search",
        getSearchQueryCandidates(q, "playlists", limit)
      ),
      signal
    );
    const results = getSearchResultItems(json);
    const playlists: YouTubeMusicPlaylistCard[] = mapFilter(
      results,
      (item: any): YouTubeMusicPlaylistCard | null => {
        const id = readString(item.playlistId || item.browseId || item.id);
        const name = readString(item.title || item.name);
        if (!id || !name) return null;

        const resultType = readString(item.resultType || item.category).toLowerCase();
        const looksLikePlaylistId =
          id.startsWith("PL") ||
          id.startsWith("VL") ||
          id.startsWith("RDCLAK") ||
          id.startsWith("RDTMAK") ||
          id.startsWith("OLAK");
        if (!looksLikePlaylistId && (resultType.includes("song") || resultType.includes("video") || readString(item.videoId))) {
          return null;
        }

        const thumbnails = normalizeThumbnails(item.thumbnails || item.thumbnail);
        const imageUrl = getBestThumbnailUrl(thumbnails);

        return {
          id,
          name,
          imageUrl,
          songCount: Number(item.trackCount || item.itemCount) || undefined,
          author: readString(item.author || item.owner?.name) || "YouTube Music",
          category: "Search",
          description: readString(item.description) || undefined,
          kind: "featured",
        };
      },
      (p: YouTubeMusicPlaylistCard | null): p is YouTubeMusicPlaylistCard => p !== null
    );

    if (playlists.length > 0) {
      await setCache(cacheKey, playlists);
    }
    return playlists;
  } catch (error) {
    if (isAbortLikeError(error)) return [];
    logger.warn("[YouTube Music] Playlist search failed:", error);
    return [];
  }
}

export async function getYouTubeMusicAudioStream(
  videoId: string,
  signal?: AbortSignal
): Promise<YouTubeMusicAudioStream | null> {
  const cleanVideoId = extractVideoId({ videoId: readString(videoId).replace(/^youtube_/, "") });
  if (!cleanVideoId) return null;

  const cached = audioStreamCache.get(cleanVideoId);
  if (cached && cached.expiresAt - AUDIO_STREAM_EXPIRY_MARGIN_MS > Date.now()) {
    return cached;
  }
  audioStreamCache.delete(cleanVideoId);

  const pending = audioStreamRequests.get(cleanVideoId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const encodedVideoId = encodeURIComponent(cleanVideoId);
      const json = await fetchFirstJson<any>(
        [
          ...getEndpointCandidates(`/audio/${encodedVideoId}`, `/audio/${encodedVideoId}`),
          ...getEndpointCandidates(`/stream-info/${encodedVideoId}`, `/stream-info/${encodedVideoId}`),
        ],
        signal
      );
      const stream = normalizeAudioStreamPayload(json, cleanVideoId);
      if (!stream) {
        logger.warn("[YouTube Music] Audio resolver returned no direct stream URL", { videoId: cleanVideoId });
        return null;
      }

      audioStreamCache.set(cleanVideoId, stream);
      if (audioStreamCache.size > AUDIO_STREAM_CACHE_MAX_ITEMS) {
        const oldestKey = audioStreamCache.keys().next().value;
        if (oldestKey) audioStreamCache.delete(oldestKey);
      }

      return stream;
    } catch (error: any) {
      if (error?.message === "Request aborted" || signal?.aborted) {
        return null;
      }
      logger.warn("[YouTube Music] Audio resolver failed:", error?.message || error);
      return null;
    } finally {
      audioStreamRequests.delete(cleanVideoId);
    }
  })();

  audioStreamRequests.set(cleanVideoId, request);
  return request;
}


/**
 * Get YouTube Music playlist details
 */
export async function getYouTubeMusicPlaylist(playlistId: string): Promise<YouTubeMusicPlaylist | null> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:playlist:${playlistId}`;
  const cached = await getCached<YouTubeMusicPlaylist>(cacheKey, CACHE_TTL_MS);
  // Skip cache if it has no tracks — avoids serving stale empty responses from before a backend fix
  if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/playlist/${encodeURIComponent(playlistId)}`,
        `/playlist/${encodeURIComponent(playlistId)}`
      )
    );
    if (!json) return null;
    const playlist = normalizePlaylistPayload(getResponsePayload(json, "playlist"), playlistId);

    // Only cache if we actually got tracks
    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      await setCache(cacheKey, playlist);
    }
    return playlist;
  } catch (error) {
    logger.error("YouTube Music playlist error:", error);
    return null;
  }
}

/**
 * Get YouTube Music artist details
 */
export async function getYouTubeMusicArtist(artistId: string): Promise<YouTubeMusicArtist | null> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:artist:${artistId}`;
  const cached = await getCached<YouTubeMusicArtist>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/artist/${encodeURIComponent(artistId)}`,
        `/artist/${encodeURIComponent(artistId)}`
      )
    );
    if (!json) return null;
    const artist = normalizeArtistPayload(getResponsePayload(json, "artist"), artistId);

    await setCache(cacheKey, artist);
    return artist;
  } catch (error) {
    logger.error("YouTube Music artist error:", error);
    return null;
  }
}

/**
 * Get YouTube Music album details
 */
export async function getYouTubeMusicAlbum(albumId: string): Promise<YouTubeMusicAlbum | null> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:album:${albumId}`;
  const cached = await getCached<YouTubeMusicAlbum>(cacheKey, CACHE_TTL_MS);
  // Skip cache if it has no tracks — avoids serving stale empty responses from before a backend fix
  if (cached && Array.isArray(cached.tracks) && cached.tracks.length > 0) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/album/${encodeURIComponent(albumId)}`,
        `/album/${encodeURIComponent(albumId)}`
      )
    );
    if (!json) return null;
    const album = normalizeAlbumPayload(getResponsePayload(json, "album"), albumId);

    // Only cache if we actually got tracks
    if (Array.isArray(album.tracks) && album.tracks.length > 0) {
      await setCache(cacheKey, album);
    }
    return album;
  } catch (error) {
    logger.error("YouTube Music album error:", error);
    return null;
  }
}

/**
 * Get YouTube Music watch queue details for one video.
 * A song track often has a counterpart videoId for the actual music video.
 */
async function getYouTubeMusicWatchPlaylist(
  videoId: string,
  options: { limit?: number; radio?: boolean } = {}
): Promise<YouTubeMusicWatchPlaylist | null> {
  const cleanVideoId = extractVideoId({ videoId: readString(videoId).replace(/^youtube_/, "") });
  if (!cleanVideoId) return null;

  const limit = Math.max(1, Math.min(options.limit ?? 5, 25));
  const radio = options.radio ?? false;
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:watch:${cleanVideoId}:${limit}:${radio ? "radio" : "queue"}`;
  const cached = await getCached<YouTubeMusicWatchPlaylist>(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/watch/${encodeURIComponent(cleanVideoId)}`,
        `/watch/${encodeURIComponent(cleanVideoId)}`,
        `limit=${limit}&radio=${radio ? "true" : "false"}`
      )
    );
    if (!json) return null;

    const source = json?.data || json;
    const tracks = mapFilter(
      Array.isArray(source?.tracks) ? source.tracks : [],
      (track: any) => normalizeTrackShape(track),
      (track): track is YouTubeMusicTrack => track !== null
    );

    const watchPlaylist: YouTubeMusicWatchPlaylist = {
      tracks,
      playlistId: readString(source?.playlistId) || null,
    };

    await setCache(cacheKey, watchPlaylist);
    return watchPlaylist;
  } catch (error) {
    logger.warn("YouTube Music watch playlist error:", error);
    return null;
  }
}

export async function getYouTubeMusicVisualVideoId(song: Song): Promise<string | null> {
  const source = song as Song & {
    youtubeVideoId?: string;
    youtubeVisualVideoId?: string;
    youtubeVideoType?: string;
    videoId?: string;
  };
  const audioVideoId = extractVideoId({
    videoId: source.youtubeVideoId || source.videoId || source.id,
    id: source.id,
  });
  const existingVisualId = extractVideoId({
    videoId: source.youtubeVisualVideoId,
    id: source.youtubeVisualVideoId,
  });

  if (existingVisualId) {
    return existingVisualId;
  }

  if (audioVideoId) {
    return audioVideoId;
  }

  const visualCacheKey = [
    YOUTUBE_MUSIC_CACHE_PREFIX,
    "official_visual_v4",
    audioVideoId || "none",
    readString(song.title).toLowerCase(),
    readString(song.artist).toLowerCase(),
  ].join(":");

  const cached = await getCached<{ videoId: string | null }>(visualCacheKey, CACHE_TTL_MS);
  if (cached && Object.prototype.hasOwnProperty.call(cached, "videoId")) {
    return cached.videoId;
  }

  const cacheAndReturn = async (videoId: string | null) => {
    await setCache(visualCacheKey, { videoId });
    return videoId;
  };

  if (song.title && song.artist) {
    try {
      const searchResults = await searchYouTubeMusicVideos(`${song.title} ${song.artist}`, 5);
      if (searchResults.length > 0) {
        const firstId = extractVideoId(searchResults[0]);
        if (firstId) {
          return cacheAndReturn(firstId);
        }
      }
    } catch (err) {
      logger.warn("[YouTube Music] Visual fallback search failed:", err);
    }
  }

  return cacheAndReturn(null);
}

export interface YouTubeMusicPlaylistCard {
  id: string;
  name: string;
  imageUrl: string;
  songCount?: number;
  author?: string;
  category?: string;
  description?: string;
  kind?: YouTubeMusicPlaylistKind;
}

export type YouTubeMusicPlaylistKind = "chart" | "editorial" | "featured" | "community";

export interface YouTubeMusicHomeCategoryData {
  id: string;
  title: string;
  results: YouTubeMusicPlaylistCard[];
}

// â”€â”€â”€ Real YouTube Music Home Feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Fetches shelves directly from the YouTube Music /home endpoint (getHomeFeed).
// This is exactly what appears on music.youtube.com â€” no searching, no scoring,
// no fake filtering. Just the real home feed shelves.

const HOME_FEED_CACHE_KEY = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_feed:v2`;
const HOME_FEED_SONG_SHELF_CACHE_KEY = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_songs:v2`;
const HOME_FEED_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface RawHomeShelves {
  title: string;
  contentType: "song" | "playlist";
  contents: any[];
}

function parseHomeSongItem(raw: any): Song | null {
  const videoId = readString(raw?.videoId || raw?.video_id);
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  const title = readString(raw?.title || raw?.name);
  if (!title) return null;

  const artistsArr: Array<{ name: string }> = Array.isArray(raw?.artists) ? raw.artists : [];
  const artist = artistsArr.map((a) => readString(a?.name)).filter(Boolean).join(", ") || "Unknown Artist";
  const thumbnails = normalizeThumbnails(raw?.thumbnails || raw?.thumbnail);
  const coverUrl = getBestThumbnailUrl(thumbnails);
  const duration =
    parseDurationSeconds(raw?.duration_seconds ?? raw?.durationSeconds) ||
    parseDurationSeconds(raw?.duration);

  return {
    id: `youtube_${videoId}`,
    title,
    artist,
    album: readString(raw?.album?.name) || title,
    duration,
    coverUrl,
    genre: "YouTube Music",
    audioUrl: "",
    source: "youtube",
    videoId,
    youtubeVideoId: videoId,
    youtubeVisualVideoId: readString(raw?.counterpart?.videoId) || videoId,
    youtubeVideoType: readString(raw?.videoType) || undefined,
  };
}

function parseHomePlaylistCard(raw: any): YouTubeMusicPlaylistCard | null {
  const id = readString(raw?.browseId || raw?.playlistId || raw?.id);
  const name = readString(raw?.title || raw?.name);
  if (!id || !name) return null;

  const isValidId =
    id.startsWith("PL") ||
    id.startsWith("VL") ||
    id.startsWith("RDCLAK") ||
    id.startsWith("RDTMAK") ||
    id.startsWith("OLAK");
  if (!isValidId) return null;

  const thumbnails = normalizeThumbnails(raw?.thumbnails || raw?.thumbnail);
  const imageUrl = getBestThumbnailUrl(thumbnails);
  const author = readString(raw?.author || raw?.owner?.name) || "YouTube Music";
  const category = readString(raw?.category) || "YouTube Home";

  let kind: YouTubeMusicPlaylistKind = "featured";
  const catLower = category.toLowerCase();
  const authorLower = author.toLowerCase();
  if (catLower.includes("chart") || name.toLowerCase().includes("top 50") || name.toLowerCase().includes("charts")) {
    kind = "chart";
  } else if (authorLower === "youtube music" || id.startsWith("RDCLAK")) {
    kind = "editorial";
  }

  return {
    id,
    name,
    imageUrl,
    songCount: Number(raw?.trackCount || raw?.itemCount) || undefined,
    author,
    category,
    description: readString(raw?.description) || undefined,
    kind,
  };
}

async function fetchRealHomeShelves(options?: { forceRefresh?: boolean }): Promise<RawHomeShelves[]> {
  if (!options?.forceRefresh) {
    const cached = await getCached<RawHomeShelves[]>(HOME_FEED_CACHE_KEY, HOME_FEED_CACHE_TTL_MS);
    if (cached && cached.length > 0) return cached;
  }

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/home", undefined, "limit=20")
    );
    if (!json) return [];

    // Handle both formats:
    // New backend: direct array [ { title, contentType, contents } ]
    // Old/production backend: { success: true, home: [ { title, contents } ] }
    let rawShelves: any[];
    if (Array.isArray(json)) {
      rawShelves = json;
    } else if (Array.isArray(json?.home)) {
      rawShelves = json.home;
    } else if (Array.isArray(json?.data)) {
      rawShelves = json.data;
    } else {
      return [];
    }

    // Normalize shelves — detect contentType from item data when missing
    const shelves: RawHomeShelves[] = compactMap(rawShelves, (shelf: any) => {
      const title = readString(shelf?.title);
      if (!title) return null;
      const contents: any[] = Array.isArray(shelf?.contents)
        ? shelf.contents
        : Array.isArray(shelf?.items)
          ? shelf.items
          : [];
      if (contents.length === 0) return null;

      // Determine content type: check for videoId to identify song shelves
      let contentType: "song" | "playlist" = shelf.contentType ?? "playlist";
      if (!shelf.contentType) {
        const firstItem = contents[0];
        const hasVideoId = readString(firstItem?.videoId || firstItem?.video_id).length === 11;
        const hasBrowseId = readString(firstItem?.browseId || firstItem?.playlistId).length > 0;
        if (hasVideoId && !hasBrowseId) contentType = "song";
      }

      return { title, contentType, contents };
    });

    if (shelves.length > 0) {
      void setCache(HOME_FEED_CACHE_KEY, shelves);
    }
    return shelves;
  } catch (error) {
    if (isAbortLikeError(error)) return [];
    logger.warn("[YouTube Music] Home feed fetch failed:", error);
    return [];
  }
}

/**
 * Get the real YouTube Music home feed as category rows.
 * Maps each shelf from music.youtube.com directly to a HomeCategoryData row.
 * Only playlist shelves are returned here (song shelves go to getYouTubeMusicLatestIndiaSongs).
 */
/**
 * Get YouTube Music categories.
 * Queries YouTube Music playlists using search terms tailored to Indian music for each category ID.
 * Falls back to real home feed shelves if searches return no results.
 */
export async function getHomeYouTubeMusicCategories(options?: {
  forceRefresh?: boolean;
  limitPerCategory?: number;
  categoryIds?: string[];
}): Promise<YouTubeMusicHomeCategoryData[]> {
  const limit = Math.min(options?.limitPerCategory ?? 10, 20);
  const ids = options?.categoryIds && options.categoryIds.length > 0
    ? options.categoryIds
    : [
        "featured-for-you",
        "latest-india",
        "new-releases",
        "most-played",
        "popular-now",
        "indias-biggest-hits",
        "romance-right-now",
        "bollywood-indian",
        "trending-community",
        "summer",
        "chill-vibes",
      ];

  const CATEGORY_SEARCH_QUERIES: Record<string, { query: string; title: string }> = {
    "featured-for-you": { query: "Bollywood Hitlist Hashtag Hits India playlist", title: "Featured playlists for you" },
    "latest-india": { query: "latest Indian songs Hindi Bollywood playlist", title: "Latest Indian hits" },
    "new-releases": { query: "new release Hindi Bollywood songs playlist India", title: "New releases" },
    "most-played": { query: "most played songs India Hindi Bollywood playlist", title: "Most played in India" },
    "popular-now": { query: "popular now India songs Hindi Bollywood playlist", title: "Popular right now" },
    "indias-biggest-hits": { query: "India biggest hits Gujarati Hitlist Bollywood Romance Hitlist playlist", title: "India's biggest hits" },
    "romance-right-now": { query: "Bollywood love aaj kal I-Pop romance playlist", title: "Romance Right Now" },
    "bollywood-indian": { query: "Bollywood Indian hits playlist latest", title: "Bollywood & Indian" },
    "trending-community": { query: "trending community playlists India music", title: "Trending community playlists" },
    summer: { query: "summer songs India Hindi Bollywood playlist", title: "Hello, Summer! ☀️🍉" },
    "chill-vibes": { query: "Hindi lofi chill playlist India", title: "Chill & Lo-fi" },
  };

  const realHomeCategories: YouTubeMusicHomeCategoryData[] = [];
  try {
    const shelves = await fetchRealHomeShelves({ forceRefresh: options?.forceRefresh });
    const seenShelfTitles = new Set<string>();

    for (const shelf of shelves) {
      if (shelf.contentType === "song") continue;
      const titleKey = shelf.title.toLowerCase().trim();
      if (seenShelfTitles.has(titleKey)) continue;
      seenShelfTitles.add(titleKey);

      const results = compactMap(
        shelf.contents.slice(0, limit),
        (item: any) => parseHomePlaylistCard(item)
      );
      if (results.length === 0) continue;

      const id = titleKey
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || `shelf-${realHomeCategories.length}`;

      realHomeCategories.push({ id, title: shelf.title, results });
    }
  } catch (error) {
    logger.warn("[YouTube Music] Home feed playlists fallback needed:", error);
  }

  const seenRealTitles = new Set(realHomeCategories.map((category) => category.title.toLowerCase().trim()));
  const missingIds = ids.filter((id) => {
    const title = CATEGORY_SEARCH_QUERIES[id]?.title.toLowerCase().trim();
    return title ? !seenRealTitles.has(title) : true;
  });

  const categoryPromises = ids.map(async (id) => {
    if (!missingIds.includes(id)) return null;
    const config = CATEGORY_SEARCH_QUERIES[id];
    if (!config) {
      return null;
    }

    try {
      const seen = new Set<string>();
      const results = (await searchYouTubeMusicPlaylists(config.query, limit * 2)).filter((playlist) => {
        if (seen.has(playlist.id)) return false;
        seen.add(playlist.id);
        return true;
      }).slice(0, limit);

      if (results.length > 0) {
        return {
          id,
          title: config.title,
          results,
        };
      }
    } catch (err) {
      logger.warn(`[YouTube Music] Failed to fetch search category ${id}:`, err);
    }
    return null;
  });

  const searchedCategories = (await Promise.all(categoryPromises)).filter(
    (c): c is YouTubeMusicHomeCategoryData => c !== null
  );

  const priorityTerms = [
    "featured",
    "latest",
    "new release",
    "most played",
    "popular",
    "biggest",
    "romance",
    "bollywood",
    "trending",
  ];
  const getPriorityScore = (category: YouTubeMusicHomeCategoryData): number => {
    const key = `${category.id} ${category.title}`.toLowerCase();
    const index = priorityTerms.findIndex((term) => key.includes(term));
    return index >= 0 ? index : priorityTerms.length;
  };

  const seenOutput = new Set<string>();
  return [...realHomeCategories, ...searchedCategories].filter((category) => {
    const key = category.title.toLowerCase().trim();
    if (!key || seenOutput.has(key)) return false;
    seenOutput.add(key);
    return true;
  }).sort((a, b) => getPriorityScore(a) - getPriorityScore(b));
}


/**
 * Get songs from the "Quick picks" or first song-type shelf on the YouTube Music home feed.
 * This is what appears at the top of music.youtube.com as individual tracks.
 */
export async function getYouTubeMusicLatestIndiaSongs(options?: {
  forceRefresh?: boolean;
  limit?: number;
}): Promise<Song[]> {
  const limit = Math.min(options?.limit ?? 24, 40);

  if (!options?.forceRefresh) {
    const cached = await getCached<Song[]>(HOME_FEED_SONG_SHELF_CACHE_KEY, HOME_FEED_CACHE_TTL_MS);
    if (cached && cached.length > 0) return cached.slice(0, limit);
  }

  try {
    const shelves = await fetchRealHomeShelves({ forceRefresh: options?.forceRefresh });

    const songs: Song[] = [];
    const seenIds = new Set<string>();

    for (const shelf of shelves) {
      if (shelf.contentType !== "song") continue;
      for (const item of shelf.contents) {
        const song = parseHomeSongItem(item);
        if (!song || seenIds.has(song.id)) continue;
        seenIds.add(song.id);
        songs.push(song);
        if (songs.length >= limit) break;
      }
      if (songs.length >= limit) break;
    }

    if (songs.length > 0) {
      void setCache(HOME_FEED_SONG_SHELF_CACHE_KEY, songs);
    }
    return songs;
  } catch (error) {
    logger.warn("[YouTube Music] Home feed songs fallback failed:", error);
  }

  try {
    const songs = await searchYouTubeMusic("trending hindi songs", "song", limit);
    if (songs.length > 0) {
      void setCache(HOME_FEED_SONG_SHELF_CACHE_KEY, songs);
      return songs;
    }
  } catch (err) {
    logger.warn("[YouTube Music] Failed to search latest Indian songs:", err);
  }

  return [];
}

/**
 * Get YouTube Music trending/chart playlists.
 * Queries the /charts endpoint to retrieve real Indian charts/playlists from YouTube Music.
 */
export async function getYouTubeMusicTrendingPlaylists(
  country: string = "IN",
  options?: { forceRefresh?: boolean }
): Promise<YouTubeMusicPlaylistCard[]> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:trending_playlists:v4:${country}`;
  if (!options?.forceRefresh) {
    const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, CACHE_TTL_MS);
    if (cached && cached.length > 0) return cached;
  }

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/charts", "/charts", `country=${encodeURIComponent(country)}`)
    );
    if (!json) return [];

    const rawPlaylists = getChartPlaylistItems(json);

    const playlists = mapFilter(
      rawPlaylists,
      (item: any) => {
        const id = readString(item.playlistId || item.browseId || item.id);
        const name = readString(item.title || item.name);
        if (!id || !name) return null;

        const thumbnails = normalizeThumbnails(item.thumbnails || item.thumbnail);
        const imageUrl = getBestThumbnailUrl(thumbnails);

        const result: YouTubeMusicPlaylistCard = {
          id,
          name,
          imageUrl,
          songCount: Number(item.trackCount || item.itemCount) || 50,
          author: readString(item.author || item.owner?.name) || "YouTube Music",
          category: readString(item.category) || "Charts",
          description: readString(item.description) || undefined,
          kind: "chart",
        };
        return result;
      },
      (p): p is YouTubeMusicPlaylistCard => p !== null
    );

    const seen = new Set<string>();
    const uniquePlaylists = playlists.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    if (uniquePlaylists.length > 0) {
      await setCache(cacheKey, uniquePlaylists);
    }
    return uniquePlaylists;
  } catch (error) {
    if (isAbortLikeError(error)) return [];
    logger.warn("YouTube Music trending playlists error:", error);
    return [];
  }
}

/**
 * Get search suggestions from YouTube Music
 */
export async function getYouTubeMusicSearchSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/search/suggestions", "/search/suggestions", [
        `q=${encodeURIComponent(q)}`,
        `query=${encodeURIComponent(q)}`,
      ]),
      signal
    );
    if (!json) return [];
    return getSearchSuggestionItems(json);
  } catch (error: any) {
    if (isAbortLikeError(error) || signal?.aborted) {
      return [];
    }
    logger.error("YouTube Music suggestions error:", error);
    return [];
  }
}

export async function clearYouTubeMusicCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ytMusicKeys = keys.filter((key) => key.startsWith(YOUTUBE_MUSIC_CACHE_PREFIX));
    await AsyncStorage.multiRemove(ytMusicKeys);
  } catch (error) {
    logger.error("Failed to clear YouTube Music cache:", error);
  }
}

