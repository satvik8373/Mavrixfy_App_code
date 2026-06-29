import { getApiUrl } from "@/lib/api-config";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { normalizeText } from "@/lib/searchUtils";

type MatchResult = {
  song: Song;
  score: number;
};

const MIN_CONFIDENT_SCORE = 0.74;
const MIN_TITLE_SCORE = 0.72;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return decodeHtmlEntities(value.trim());
    }
  }
  return "";
}

function getBestUrl(items: unknown, preferredQualities: string[]): string {
  if (typeof items === "string") return items.trim();
  if (!Array.isArray(items)) {
    if (items && typeof items === "object") {
      return firstString((items as any).url, (items as any).link);
    }
    return "";
  }

  const byQuality = new Map<string, unknown>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const quality = String((item as any).quality || "").toLowerCase();
    if (quality && !byQuality.has(quality)) {
      byQuality.set(quality, item);
    }
  }

  for (const quality of preferredQualities) {
    const found = byQuality.get(quality.toLowerCase());
    const url = firstString((found as any)?.url, (found as any)?.link);
    if (url) return url;
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const url = typeof item === "string" ? item.trim() : firstString((item as any)?.url, (item as any)?.link);
    if (url) return url;
  }

  return "";
}

function artistFromRaw(raw: any): string {
  if (typeof raw.primaryArtists === "string" && raw.primaryArtists.trim()) {
    return raw.primaryArtists.trim();
  }
  const primary = raw.artists?.primary;
  if (Array.isArray(primary) && primary.length > 0) {
    const names: string[] = [];
    for (const artist of primary) {
      if (artist?.name) names.push(artist.name);
    }
    const joined = names.join(", ");
    if (joined) return joined;
  }
  return firstString(raw.artist, raw.subtitle, raw.singers) || "Unknown Artist";
}

function getAudioUrlFromRaw(raw: any): string {
  const sources = [raw.downloadUrl, raw.audioUrl, raw.url];
  for (const source of sources) {
    // Always prioritize highest quality (320kbps) for best audio - official JioSaavn method
    const url = getBestUrl(source, ["320kbps", "160kbps", "96kbps", "48kbps"]);
    if (url) return url;
  }
  return "";
}

function normalizeJioSaavnCandidate(raw: any): Song | null {
  if (!raw?.id) return null;

  const audioUrl = getAudioUrlFromRaw(raw);
  if (!audioUrl) return null;

  const title = firstString(raw.name, raw.title);
  if (!title) return null;

  return {
    id: String(raw.id),
    title,
    artist: artistFromRaw(raw),
    album: typeof raw.album === "string" ? raw.album : firstString(raw.album?.name),
    duration: Number(raw.duration) || 0,
    coverUrl: getBestUrl(raw.image, ["500x500", "150x150", "50x50"]),
    genre: firstString(raw.language),
    audioUrl,
    downloadUrl: raw.downloadUrl || raw.audioUrl || raw.url,
    year: raw.year ? String(raw.year) : "",
    language: raw.language ? String(raw.language) : "",
    source: "jiosaavn",
    playCount: Number(raw.playCount) || 0,
  };
}

function stripVersionNoise(value: string): string {
  return normalizeText(decodeHtmlEntities(value))
    .replace(/\b(official|video|audio|lyrics?|lyrical|full|song|music|visualizer|hd|4k)\b/g, " ")
    .replace(/\b(quot|apos|amp)\b/g, " ")
    .replace(/\b(from|movie|film|album)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return stripVersionNoise(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let matches = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) matches += 1;
  });

  return matches / Math.max(leftTokens.size, rightTokens.size);
}

function titleScore(sourceTitle: string, candidateTitle: string): number {
  const source = stripVersionNoise(sourceTitle);
  const candidate = stripVersionNoise(candidateTitle);
  if (!source || !candidate) return 0;
  if (source === candidate) return 1;
  if (source.includes(candidate) || candidate.includes(source)) return 0.9;
  return tokenOverlap(source, candidate);
}

function durationScore(sourceDuration: number, candidateDuration: number): number {
  if (!sourceDuration || !candidateDuration) return 0.65;
  const diff = Math.abs(sourceDuration - candidateDuration);
  if (diff <= 4) return 1;
  if (diff <= 10) return 0.86;
  if (diff <= 20) return 0.55;
  return 0;
}

function scoreMatch(source: Song, candidate: Song): number {
  const title = titleScore(source.title, candidate.title);
  const artist = tokenOverlap(source.artist || "", candidate.artist || "");
  const duration = durationScore(source.duration || 0, candidate.duration || 0);

  if (title < MIN_TITLE_SCORE) return 0;
  const strongTitleFallback = title >= 0.95 && duration >= 0.6;
  if (artist < 0.25 && duration < 0.85 && !strongTitleFallback) return 0;

  return title * 0.58 + artist * 0.27 + duration * 0.15;
}

export async function resolveYouTubeSongToJioSaavn(song: Song): Promise<MatchResult | null> {
  const query = `${song.title} ${song.artist || ""}`.trim();
  if (!query) return null;

  try {
    const baseUrl = getApiUrl().replace(/\/+$/, "");
    const url = `${baseUrl}/api/search/songs?query=${encodeURIComponent(query)}&limit=12`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const rawResults = data?.data?.results || data?.results || [];
    if (!Array.isArray(rawResults) || rawResults.length === 0) return null;

    const matches: MatchResult[] = [];
    for (const raw of rawResults) {
      const candidate = normalizeJioSaavnCandidate(raw);
      if (!candidate) continue;
      const score = scoreMatch(song, candidate);
      const strongTitleFallback = score >= 0.66 && titleScore(song.title, candidate.title) >= 0.95;
      if (score >= MIN_CONFIDENT_SCORE || strongTitleFallback) {
        matches.push({ song: candidate, score });
      }
    }
    matches.sort((a, b) => b.score - a.score);

    const best = matches[0] || null;
    if (!best) {
      logger.warn("[YouTubeToJioSaavnDownload] No confident download match", {
        songId: song.id,
        title: song.title,
        artist: song.artist,
      });
    }
    return best;
  } catch (error) {
    logger.warn("[YouTubeToJioSaavnDownload] Failed to resolve download match:", error);
    return null;
  }
}
