import AsyncStorage from "@react-native-async-storage/async-storage";

import { JioSaavnImage, Song } from "@/lib/musicData";
import { getYouTubeMusicApiUrl, PRODUCTION_YOUTUBE_MUSIC_API_URL } from "@/lib/api-config";
import { compactMap, mapFilter, sortedCopy } from "@/lib/arrayUtils";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

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
const PRIVATE_DEVELOPMENT_REQUEST_TIMEOUT_MS = 15000;
const OPTIONAL_HOME_SECTION_TIMEOUT_MS = 4500;
const CURRENT_YEAR = new Date().getFullYear();
const OFFICIAL_VISUAL_SEARCH_CACHE_VERSION = "v1";
const YOUTUBE_VIDEO_SEARCH_CACHE_VERSION = "v2";
const AUDIO_STREAM_EXPIRY_MARGIN_MS = 60 * 1000;
const AUDIO_STREAM_CACHE_MAX_ITEMS = 50;
const audioStreamCache = new Map<string, YouTubeMusicAudioStream>();
const audioStreamRequests = new Map<string, Promise<YouTubeMusicAudioStream | null>>();

// ─── Cache Helpers ────────────────────────────────────────────────────────────

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
  } catch {}
}

// ─── Normalization Functions ──────────────────────────────────────────────────

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

function getBestThumbnailUrl(thumbnails?: Array<{ url: string; width: number; height: number }>): string {
  const best = getBestThumbnail(thumbnails);
  return best ? upscaleYouTubeThumbnail(best.url) : "";
}

function getBestThumbnail(thumbnails?: Array<{ url: string; width: number; height: number }>): { url: string; width: number; height: number } | null {
  if (!thumbnails || thumbnails.length === 0) return null;

  // Sort by resolution (largest first)
  const sorted = sortedCopy(thumbnails, (a, b) => {
    const aRes = a.width * a.height;
    const bRes = b.width * b.height;
    return bRes - aRes;
  });

  return sorted[0] || null;
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

const VISUAL_METADATA_WORDS = new Set([
  "4k",
  "album",
  "film",
  "full",
  "hd",
  "movie",
  "music",
  "official",
  "ost",
  "picture",
  "song",
  "soundtrack",
  "title",
  "track",
  "video",
]);

const VISUAL_BLOCKED_VERSION_TERMS = [
  "8d",
  "acoustic",
  "audio",
  "cover",
  "dj",
  "instrumental",
  "karaoke",
  "live",
  "lo fi",
  "lofi",
  "lyric",
  "lyrics",
  "lyrical",
  "mashup",
  "mix",
  "nightcore",
  "reaction",
  "recreate",
  "recreated",
  "recreation",
  "remake",
  "remix",
  "remixed",
  "reverb",
  "rmx",
  "slowed",
  "sped up",
  "status",
  "teaser",
  "trailer",
  "unplugged",
  "version",
  "visualizer",
];

const VISUAL_STOP_WORDS = new Set([
  "and",
  "feat",
  "featuring",
  "from",
  "ft",
  "the",
  "with",
  ...VISUAL_METADATA_WORDS,
]);

function normalizeComparableText(value: unknown): string {
  return readString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/gi, " and ")
    .replace(/&quot;|&#039;|&apos;|&nbsp;/gi, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesWholeTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeComparableText(term);
  if (!normalizedTerm) return false;
  const pattern = escapeRegExp(normalizedTerm).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${pattern}\\b`, "i").test(text);
}

function stripVisualMetadata(value: unknown): string {
  return normalizeComparableText(value)
    .split(" ")
    .filter((word) => word && !VISUAL_METADATA_WORDS.has(word))
    .join(" ")
    .trim();
}

function visualTokenSet(value: unknown): Set<string> {
  return new Set(
    stripVisualMetadata(value)
      .split(" ")
      .filter((word) => word.length > 1 && !VISUAL_STOP_WORDS.has(word))
  );
}

function countSharedVisualTokens(a: Set<string>, b: Set<string>): number {
  let count = 0;
  a.forEach((word) => {
    if (b.has(word)) count += 1;
  });
  return count;
}

function hasBlockedVisualVersion(title: unknown, seedTitle: unknown): boolean {
  const text = normalizeComparableText(title);
  const seedText = normalizeComparableText(seedTitle);
  return VISUAL_BLOCKED_VERSION_TERMS.some((term) => includesWholeTerm(text, term) && !includesWholeTerm(seedText, term));
}

function isOfficialMusicVideoType(value: unknown): boolean {
  const type = normalizeComparableText(value).replace(/\s+/g, "_");
  return type === "music_video_type_omv" || type.includes("official_music_video") || type.endsWith("_omv");
}

function getVisualTitleScore(seedTitle: unknown, candidateTitle: unknown): { score: number; strong: boolean } {
  const seed = stripVisualMetadata(seedTitle);
  const candidate = stripVisualMetadata(candidateTitle);
  if (!seed || !candidate) return { score: 0, strong: false };

  if (seed === candidate) return { score: 160, strong: true };
  if (candidate.includes(seed) || seed.includes(candidate)) return { score: 110, strong: true };

  const seedTokens = visualTokenSet(seed);
  const candidateTokens = visualTokenSet(candidate);
  const shared = countSharedVisualTokens(seedTokens, candidateTokens);
  const ratio = seedTokens.size > 0 ? shared / seedTokens.size : 0;

  if (ratio >= 0.75) {
    return { score: 80 + shared * 12, strong: true };
  }

  if (seedTokens.size === 1 && shared === 1) {
    return { score: 70, strong: true };
  }

  return { score: shared * 10, strong: false };
}

function getVisualArtistScore(seedArtist: unknown, candidateArtist: unknown): number {
  const seed = normalizeComparableText(seedArtist);
  const candidate = normalizeComparableText(candidateArtist);
  if (!seed || !candidate) return 0;
  if (seed === candidate) return 90;
  if (candidate.includes(seed) || seed.includes(candidate)) return 70;

  const seedTokens = visualTokenSet(seed);
  const candidateTokens = visualTokenSet(candidate);
  return countSharedVisualTokens(seedTokens, candidateTokens) * 28;
}

function scoreOfficialVisualCandidate(seed: Song, candidate: Song, index: number): number | null {
  const videoId = extractVideoId(candidate);
  if (!videoId) return null;
  if (!isOfficialMusicVideoType(candidate.youtubeVideoType)) return null;
  if (hasBlockedVisualVersion(candidate.title, seed.title)) return null;

  const titleScore = getVisualTitleScore(seed.title, candidate.title);
  if (!titleScore.strong) return null;

  let score = 140 + titleScore.score + getVisualArtistScore(seed.artist, candidate.artist);
  if (normalizeComparableText(candidate.title).includes("official")) score += 18;
  if (normalizeComparableText(candidate.title).includes("full video")) score += 12;

  const seedDuration = parseDurationSeconds(seed.duration);
  const candidateDuration = parseDurationSeconds(candidate.duration);
  if (seedDuration && candidateDuration) {
    const diff = Math.abs(seedDuration - candidateDuration);
    if (diff <= 35) score += 24;
    else if (diff <= 90) score += 8;
    else if (diff > 240) score -= 45;
  }

  score -= index * 4;
  return score >= 230 ? score : null;
}

function selectOfficialVisualVideoId(seed: Song, candidates: Song[]): string | null {
  let best: { id: string; score: number } | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const score = scoreOfficialVisualCandidate(seed, candidate, index);
    if (score === null) continue;
    const id = extractVideoId(candidate);
    if (!id) continue;
    if (!best || score > best.score) {
      best = { id, score };
    }
  }

  return best ? best.id : null;
}

function compactSongCandidates(candidates: Array<Song | null | undefined>): Song[] {
  return candidates.filter((candidate): candidate is Song => Boolean(candidate));
}

function artistNamesToString(artists: YouTubeMusicTrack["artists"] | undefined): string {
  return Array.isArray(artists) ? compactMap(artists, (artist) => readString(artist?.name) || null).join(", ") : "";
}

function trackToVisualCandidate(track: YouTubeMusicTrack | null | undefined, fallback: Song): Song | null {
  if (!track) return null;
  const videoId = extractVideoId(track);
  if (!videoId) return null;
  return {
    ...fallback,
    id: `youtube_${videoId}`,
    title: track.title || fallback.title,
    artist: artistNamesToString(track.artists) || fallback.artist,
    duration: parseDurationSeconds(track.duration_seconds) || parseDurationSeconds(track.duration) || fallback.duration,
    coverUrl: getBestThumbnailUrl(track.thumbnails) || fallback.coverUrl,
    source: "youtube",
    videoId,
    youtubeVideoId: videoId,
    youtubeVisualVideoId: videoId,
    youtubeVideoType: track.videoType,
  };
}

function counterpartToVisualCandidate(
  track: YouTubeMusicTrack | null | undefined,
  fallback: Song
): Song | null {
  const counterpart = track?.counterpart;
  if (!counterpart?.videoId) return null;
  const videoId = extractVideoId(counterpart);
  if (!videoId) return null;
  return {
    ...fallback,
    id: `youtube_${videoId}`,
    title: counterpart.title || track?.title || fallback.title,
    artist: artistNamesToString(track?.artists) || fallback.artist,
    duration: parseDurationSeconds(counterpart.length) || fallback.duration,
    coverUrl: getBestThumbnailUrl(counterpart.thumbnails) || fallback.coverUrl,
    source: "youtube",
    videoId,
    youtubeVideoId: videoId,
    youtubeVisualVideoId: videoId,
    youtubeVideoType: counterpart.videoType,
  };
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

// ─── Timeout Wrapper ──────────────────────────────────────────────────────────

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

function resolveWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
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
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Build primary path candidates based on the configured URL
  let primaryPathCandidates: string[];
  if (isPrivateDevelopmentApiUrl(appBase)) {
    // Respect the user's rule: "dont fetch production url use local"
    primaryPathCandidates = [`${appBase}${normalizedPath}`];
  } else {
    const productionBase = PRODUCTION_YOUTUBE_MUSIC_API_URL.replace(/\/+$/, "");
    if (appBase === productionBase) {
      // Using production URL directly — no need to duplicate
      primaryPathCandidates = appBase.includes("/api/youtube-music")
        ? [`${appBase}${normalizedPath}`]
        : [
            `${appBase}${normalizedPath}`,
            `${appBase}/api/youtube-music${normalizedPath}`,
            `${appBase}/api${normalizedPath}`,
          ];
    } else {
      primaryPathCandidates = appBase.includes("/api/youtube-music")
        ? [`${appBase}${normalizedPath}`, `${appBase}/api${normalizedPath}`]
        : [
            `${appBase}${normalizedPath}`,
            `${appBase}/api/youtube-music${normalizedPath}`,
            `${appBase}/api${normalizedPath}`,
          ];
    }
  }

  const queryCandidates = Array.isArray(query) ? query : [query];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const queryCandidate of queryCandidates) {
    const suffix = queryCandidate ? `?${queryCandidate}` : "";
    for (const pathCandidate of primaryPathCandidates) {
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

// ─── API Functions ────────────────────────────────────────────────────────────

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
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/playlist/${encodeURIComponent(playlistId)}`,
        `/playlist/${encodeURIComponent(playlistId)}`
      )
    );
    if (!json) return null;
    const playlist = normalizePlaylistPayload(getResponsePayload(json, "playlist"), playlistId);

      await setCache(cacheKey, playlist);
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
  if (cached) return cached;

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates(
        `/album/${encodeURIComponent(albumId)}`,
        `/album/${encodeURIComponent(albumId)}`
      )
    );
    if (!json) return null;
    const album = normalizeAlbumPayload(getResponsePayload(json, "album"), albumId);

      await setCache(cacheKey, album);
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

  if (!audioVideoId) {
    return selectOfficialVisualVideoId(song, compactSongCandidates([
      existingVisualId
        ? {
            ...song,
            id: `youtube_${existingVisualId}`,
            videoId: existingVisualId,
            youtubeVideoId: existingVisualId,
            youtubeVisualVideoId: existingVisualId,
            youtubeVideoType: source.youtubeVideoType,
          }
        : null,
    ]));
  }

  const visualCacheKey = [
    YOUTUBE_MUSIC_CACHE_PREFIX,
    "official_visual",
    OFFICIAL_VISUAL_SEARCH_CACHE_VERSION,
    audioVideoId,
    normalizeComparableText(song.title),
    normalizeComparableText(song.artist),
  ].join(":");
  const cached = await getCached<{ videoId: string | null }>(visualCacheKey, CACHE_TTL_MS);
  if (cached && Object.prototype.hasOwnProperty.call(cached, "videoId")) {
    return cached.videoId;
  }

  const cacheAndReturn = async (videoId: string | null) => {
    await setCache(visualCacheKey, { videoId });
    return videoId;
  };

  const watch = await getYouTubeMusicWatchPlaylist(audioVideoId, { limit: 5, radio: false });
  const currentTrack =
    watch?.tracks.find((track) => track.videoId === audioVideoId) ||
    watch?.tracks[0] ||
    null;
  const watchCandidateId = selectOfficialVisualVideoId(song, compactSongCandidates([
    trackToVisualCandidate(currentTrack, song),
    counterpartToVisualCandidate(currentTrack, song),
  ]));

  if (watchCandidateId) {
    return cacheAndReturn(watchCandidateId);
  }

  const existingCandidateId = selectOfficialVisualVideoId(song, compactSongCandidates([
    existingVisualId
      ? {
          ...song,
          id: `youtube_${existingVisualId}`,
          videoId: existingVisualId,
          youtubeVideoId: existingVisualId,
          youtubeVisualVideoId: existingVisualId,
          youtubeVideoType: source.youtubeVideoType,
        }
      : null,
  ]));

  if (existingCandidateId) {
    return cacheAndReturn(existingCandidateId);
  }

  if (song.title && song.artist) {
    try {
      const searchResults = await searchYouTubeMusicVideos(`${song.title} ${song.artist} official music video`, 10);
      const searchCandidateId = selectOfficialVisualVideoId(song, searchResults);
      if (searchCandidateId) {
        return cacheAndReturn(searchCandidateId);
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
  imageWidth?: number;
  imageHeight?: number;
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

const HOME_YOUTUBE_MUSIC_CATEGORY_VERSION = "v10";

function dedupeYouTubePlaylistCards(playlists: YouTubeMusicPlaylistCard[]): YouTubeMusicPlaylistCard[] {
  const seen = new Set<string>();
  const unique: YouTubeMusicPlaylistCard[] = [];

  for (const playlist of playlists) {
    const id = readString(playlist.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...playlist, id });
  }

  return unique;
}

function normalizeYouTubePlaylistKind(raw: any, fallbackKind?: YouTubeMusicPlaylistKind): YouTubeMusicPlaylistKind {
  if (fallbackKind) return fallbackKind;

  const category = readString(raw?.category).toLowerCase();
  const author = readString(raw?.author || raw?.owner || raw?.channel?.name).toLowerCase();
  const id = readString(raw?.browseId || raw?.playlistId || raw?.id);

  if (category.includes("chart")) return "chart";
  if (author === "youtube music" || id.startsWith("VLRDCLAK5uy_")) return "editorial";
  if (category.includes("featured")) return "featured";
  return "community";
}

function normalizeYouTubePlaylistCard(raw: any, fallbackKind?: YouTubeMusicPlaylistKind): YouTubeMusicPlaylistCard | null {
  const id = readString(raw?.browseId || raw?.playlistId || raw?.id);
  const name = readString(raw?.title || raw?.name);
  if (!id || !name) return null;

  const thumbnails = normalizeThumbnails(raw?.thumbnails || raw?.thumbnail || raw?.image);
  const bestThumbnail = getBestThumbnail(thumbnails);
  const imageUrl = bestThumbnail ? upscaleYouTubeThumbnail(bestThumbnail.url) : "";

  return {
    id,
    name,
    imageUrl,
    imageWidth: bestThumbnail?.width || undefined,
    imageHeight: bestThumbnail?.height || undefined,
    songCount: Number(raw?.trackCount || raw?.itemCount || raw?.count) || undefined,
    author: readString(raw?.author || raw?.owner || raw?.channel?.name) || undefined,
    category: readString(raw?.category) || undefined,
    description: readString(raw?.description) || undefined,
    kind: normalizeYouTubePlaylistKind(raw, fallbackKind),
  };
}

function toYouTubeHomeSection(
  id: string,
  title: string,
  playlists: YouTubeMusicPlaylistCard[],
  limit: number
): YouTubeMusicHomeCategoryData | null {
  const results = dedupeYouTubePlaylistCards(playlists)
    .filter((playlist) => playlist.id && playlist.name)
    .slice(0, limit)
    .map((playlist) => ({
      ...playlist,
      author: playlist.author || "YouTube Music",
      category: playlist.category || title,
    }));

  return results.length > 0 ? { id, title, results } : null;
}

function dedupeYouTubeHomeSections(sections: YouTubeMusicHomeCategoryData[]): YouTubeMusicHomeCategoryData[] {
  const seenSectionIds = new Set<string>();
  const seenPlaylistIds = new Set<string>();
  const unique: YouTubeMusicHomeCategoryData[] = [];

  for (const section of sections) {
    if (seenSectionIds.has(section.id)) continue;
    seenSectionIds.add(section.id);

    const results = section.results.filter((playlist) => {
      const id = readString(playlist.id);
      if (!id || seenPlaylistIds.has(id)) return false;
      seenPlaylistIds.add(id);
      return true;
    });

    if (results.length > 0) {
      unique.push({ ...section, results });
    }
  }

  return unique;
}

async function searchYouTubeMusicPlaylistCards(
  query: string,
  limit: number
): Promise<YouTubeMusicPlaylistCard[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:search:playlist_cards:${limit}:${q.toLowerCase()}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, SEARCH_CACHE_TTL_MS);
  if (cached) return cached;

  const json = await fetchFirstJson<any>(
    getEndpointCandidates(
      "/search",
      "/search",
      getSearchQueryCandidates(q, "playlists", limit)
    )
  );
  const results = getSearchResultItems(json);

  const cards = mapFilter(
    results,
    (item: any) => {
      const id = readString(item?.browseId || item?.playlistId);
      const resultType = readString(item?.resultType || item?.type || item?.category).toLowerCase();
      const isPlaylist =
        resultType.includes("playlist") ||
        Boolean(item?.playlistId) ||
        id.startsWith("VL");
      if (!isPlaylist) return null;
      return normalizeYouTubePlaylistCard(item);
    },
    (playlist): playlist is YouTubeMusicPlaylistCard => Boolean(playlist)
  );

  if (cards.length > 0) {
    await setCache(cacheKey, cards);
  }

  return cards;
}

function getHomeShelfItems(json: any): any[] {
  const payload = getResponsePayload(json, "home", "shelves", "results");
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(json?.home)) return json.home;
  if (Array.isArray(json?.data?.home?.sections)) return json.data.home.sections;
  if (Array.isArray(json?.data?.home)) return json.data.home;
  if (Array.isArray(json?.data?.results)) return json.data.results;
  return [];
}

function normalizeHomeShelfPlaylistCard(item: any): YouTubeMusicPlaylistCard | null {
  const id = readString(item?.playlistId || item?.browseId || item?.audioPlaylistId || item?.id);
  const name = readString(item?.title || item?.name);
  const isPlaylist =
    Boolean(item?.playlistId) ||
    id.startsWith("PL") ||
    id.startsWith("VL") ||
    id.startsWith("RDCLAK") ||
    id.startsWith("RDTMAK") ||
    id.startsWith("OLAK");

  if (!id || !name || !isPlaylist) return null;

  const thumbnails = normalizeThumbnails(item?.thumbnails || item?.thumbnail || item?.image);
  const bestThumbnail = getBestThumbnail(thumbnails);
  const description = readString(item?.description);
  const author = readString(item?.author || item?.owner || item?.channel?.name) || description.split("•")[0]?.trim();

  return {
    id,
    name,
    imageUrl: bestThumbnail ? upscaleYouTubeThumbnail(bestThumbnail.url) : "",
    imageWidth: bestThumbnail?.width || undefined,
    imageHeight: bestThumbnail?.height || undefined,
    songCount: Number(item?.trackCount || item?.itemCount || item?.count) || undefined,
    author: author || "YouTube Music",
    category: "YouTube Home",
    description: description || undefined,
    kind: normalizeYouTubePlaylistKind(item, "featured"),
  };
}

function getHomeShelfContents(shelf: any): any[] {
  if (Array.isArray(shelf?.contents)) return shelf.contents;
  if (Array.isArray(shelf?.items)) return shelf.items;
  return [];
}

function homeShelfTitleToId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "yt-playlists";
}

function getMoodCategoryItems(json: any): Array<{ title: string; params: string }> {
  const source = json?.data || json?.moods || json?.categories || json;
  const rawItems = Array.isArray(source)
    ? source
    : source && typeof source === "object"
      ? Object.values(source).flatMap((value) => (Array.isArray(value) ? value : []))
      : [];

  return mapFilter(
    rawItems,
    (item: any) => ({
      title: readString(item?.title || item?.name),
      params: readString(item?.params || item?.browseParams || item?.id),
    }),
    (item): item is { title: string; params: string } => Boolean(item.title && item.params)
  );
}

async function getYouTubeMusicMoodCategorySections(
  limitPerCategory: number,
  maxCategories: number = 4
): Promise<YouTubeMusicHomeCategoryData[]> {
  const safeItemLimit = Math.max(1, Math.min(limitPerCategory, 12));
  const safeCategoryLimit = Math.max(1, Math.min(maxCategories, 8));
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:mood_category_sections:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${safeItemLimit}:${safeCategoryLimit}`;
  if (!__DEV__) {
    const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;
  }

  try {
    const moodsJson = await fetchFirstJson<any>(getEndpointCandidates("/moods", "/moods"));
    const moodItems = getMoodCategoryItems(moodsJson).slice(0, safeCategoryLimit);
    const sections = await Promise.all(
      moodItems.map(async (mood) => {
        try {
          const json = await fetchFirstJson<any>(
            getEndpointCandidates(
              "/mood-playlists",
              "/mood-playlists",
              `params=${encodeURIComponent(mood.params)}`
            )
          );
          const playlists = dedupeYouTubePlaylistCards(
            mapFilter(
              getSearchResultItems(json),
              (item: any) => normalizeHomeShelfPlaylistCard(item) ?? normalizeYouTubePlaylistCard(item, "featured"),
              (playlist): playlist is YouTubeMusicPlaylistCard => Boolean(playlist)
            )
          );
          return toYouTubeHomeSection(`yt-mood-${homeShelfTitleToId(mood.title)}`, mood.title, playlists, safeItemLimit);
        } catch (err) {
          logger.debug("[YouTube Music] Mood playlist fetch skipped:", mood.title, err);
          return null;
        }
      })
    );

    const finalSections = mapFilter(
      sections,
      (section) => section,
      (section): section is YouTubeMusicHomeCategoryData => Boolean(section)
    );
    if (!__DEV__ && finalSections.length > 0) {
      await setCache(cacheKey, finalSections);
    }
    return finalSections;
  } catch (error) {
    if (isAbortLikeError(error)) {
      logger.debug("[YouTube Music] Mood sections fetch aborted");
      return [];
    }
    logger.warn("[YouTube Music] Mood sections fetch failed:", error);
    return [];
  }
}

async function getYouTubeMusicHomeCategorySections(
  limitPerCategory: number,
  maxShelves: number = 10
): Promise<YouTubeMusicHomeCategoryData[]> {
  const safeShelfLimit = Math.max(1, Math.min(maxShelves, 12));
  const safeItemLimit = Math.max(1, Math.min(limitPerCategory, 12));
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_shelf_sections:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${safeItemLimit}:${safeShelfLimit}`;
  if (!__DEV__) {
    const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;
  }

  try {
    const json = await fetchFirstJson<any>(
      getEndpointCandidates("/home", "/home", [`limit=${safeShelfLimit}`])
    );
    if (!json) return [];

    const shelves = getHomeShelfItems(json);
    const usedIds = new Set<string>();
    const sections: YouTubeMusicHomeCategoryData[] = [];

    for (const shelf of shelves) {
      const title = readString(shelf?.title || shelf?.name) || "YouTube Music";

      const playlists = dedupeYouTubePlaylistCards(
        mapFilter(
          getHomeShelfContents(shelf),
          (item: any) => normalizeHomeShelfPlaylistCard(item) ?? normalizeYouTubePlaylistCard(item, "featured"),
          (playlist): playlist is YouTubeMusicPlaylistCard => Boolean(playlist)
        )
      ).slice(0, safeItemLimit);

      if (playlists.length === 0) continue;

      let id = `yt-${homeShelfTitleToId(title)}`;
      if (usedIds.has(id)) {
        let suffix = 2;
        while (usedIds.has(`${id}-${suffix}`)) suffix += 1;
        id = `${id}-${suffix}`;
      }
      usedIds.add(id);

      sections.push({
        id,
        title,
        results: playlists.map((playlist) => ({
          ...playlist,
          category: title,
        })),
      });
    }

    if (!__DEV__ && sections.length > 0) {
      await setCache(cacheKey, sections);
    }
    return sections;
  } catch (error) {
    if (isAbortLikeError(error)) {
      logger.debug("[YouTube Music] Home shelf sections fetch aborted");
      return [];
    }
    logger.warn("[YouTube Music] Home shelf sections fetch failed:", error);
    return [];
  }
}


export async function getHomeYouTubeMusicCategories(options?: {
  limitPerCategory?: number;
}): Promise<YouTubeMusicHomeCategoryData[]> {
  const limit = Math.min(options?.limitPerCategory ?? 8, 12);
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:home_categories:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${limit}:raw`;
  if (!__DEV__) {
    const cached = await getCached<YouTubeMusicHomeCategoryData[]>(cacheKey, 60 * 60 * 1000);
    if (cached) return cached;
  }

  const [shelfSections, trendingPlaylists, moodSections] = await Promise.all([
    getYouTubeMusicHomeCategorySections(limit, 10),
    getYouTubeMusicTrendingPlaylists("IN").catch(() => [] as YouTubeMusicPlaylistCard[]),
    resolveWithTimeout(
      getYouTubeMusicMoodCategorySections(limit, 2),
      OPTIONAL_HOME_SECTION_TIMEOUT_MS,
      [] as YouTubeMusicHomeCategoryData[]
    ),
  ]);

  const chartSection = toYouTubeHomeSection("yt-charts", "YouTube Music Charts", trendingPlaylists, limit);
  const fallbackSection = shelfSections.length === 0 && trendingPlaylists.length === 0 && moodSections.length === 0
    ? toYouTubeHomeSection(
        "yt-search-suggestions",
        "YouTube Music Suggestions",
        await searchYouTubeMusicPlaylistCards("music", limit).catch(() => [] as YouTubeMusicPlaylistCard[]),
        limit
      )
    : null;

  const finalResults = dedupeYouTubeHomeSections(mapFilter(
    [...shelfSections, chartSection, ...moodSections, fallbackSection],
    (section) => section,
    (section): section is YouTubeMusicHomeCategoryData => Boolean(section)
  ));
  if (!__DEV__ && finalResults.length > 0) void setCache(cacheKey, finalResults);
  return finalResults;
}

export async function getYouTubeMusicTrendingPlaylists(country: string = "IN"): Promise<YouTubeMusicPlaylistCard[]> {
  const cacheKey = `${YOUTUBE_MUSIC_CACHE_PREFIX}:trending_playlists:${HOME_YOUTUBE_MUSIC_CATEGORY_VERSION}:${country}`;
  const cached = await getCached<YouTubeMusicPlaylistCard[]>(cacheKey, CACHE_TTL_MS);
  if (cached) {
    return dedupeYouTubePlaylistCards(cached.map((playlist) => ({
      ...playlist,
      author: playlist.author || "YouTube Music",
      category: playlist.category || "Charts",
      kind: playlist.kind || "chart",
    })));
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
        const id = item.playlistId || item.browseId;
        const name = item.title || item.name;
        if (!id || !name) return null;

        // Get best quality thumbnail
        const thumbnails = normalizeThumbnails(item.thumbnails || item.thumbnail || item.image);
        const bestThumbnail = getBestThumbnail(thumbnails);

        const result: YouTubeMusicPlaylistCard = {
          id,
          name,
          imageUrl: bestThumbnail ? upscaleYouTubeThumbnail(bestThumbnail.url) : "",
          imageWidth: bestThumbnail?.width || undefined,
          imageHeight: bestThumbnail?.height || undefined,
          songCount: Number(item.trackCount || item.itemCount) || 50,
          author: item.author || "YouTube Music",
          category: item.category || "Charts",
          description: item.description || undefined,
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

    const finalPlaylists = dedupeYouTubePlaylistCards(uniquePlaylists);

    await setCache(cacheKey, finalPlaylists);
    return finalPlaylists;
  } catch (error) {
    if (isAbortLikeError(error)) {
      logger.debug("[YouTube Music] Trending playlists fetch aborted");
      return [];
    }
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
    // Abort errors are expected when user types quickly - don't log them as errors
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
