import { Song } from "@/lib/musicData";
import { getCatalogSongs } from "@/lib/catalogService";
import {
  getRecentlyPlayed,
  type AppSettings,
  type RecentlyPlayedItem,
} from "@/lib/storage";
import {
  normalizeSmartAutoplayMode,
  type SmartAutoplayMode,
} from "@/lib/smartAutoplayConfig";

export type { SmartAutoplayMode } from "@/lib/smartAutoplayConfig";

export type SmartAutoplayStatus = {
  enabled: boolean;
  mode: SmartAutoplayMode;
  isRefreshing: boolean;
  seedSongId: string | null;
  seedTitle: string | null;
  basisLabels: string[];
  generatedCount: number;
  generatedAt: number | null;
};

export type SmartAutoplayQueueResult = {
  songs: Song[];
  basisLabels: string[];
  generatedAt: number;
};

type SmartAutoplayOptions = {
  currentSong: Song;
  mode: SmartAutoplayMode;
  candidateSongs?: Song[];
  existingQueue?: Song[];
  likedSongs?: Song[];
  userId?: string | null;
  limit?: number;
};

type ScoredSong = {
  song: Song;
  score: number;
  index: number;
};

const SMART_AUTOPLAY_LIMIT = 20;
const SMART_AUTOPLAY_CACHE_TTL_MS = 5 * 60 * 1000;
const SMART_AUTOPLAY_CATALOG_TIMEOUT_MS = 220;
const RECENT_DIRECT_EXCLUDE_COUNT = 8;
const UNKNOWN_ARTIST = "unknown artist";

const SMART_AUTOPLAY_CACHE = new Map<string, {
  result: SmartAutoplayQueueResult;
  createdAt: number;
}>();

const MOOD_KEYWORDS: Array<[string, string[]]> = [
  ["Love", ["love", "romantic", "romance", "raabta", "tum", "dil", "heart", "ishq", "pyaar", "sanam", "saath", "mohabbat", "shayad", "iktara", "kabira", "hawayein"]],
  ["Soft", ["soft", "acoustic", "unplugged", "lofi", "slow", "soulful", "melody", "ghazal", "sufi"]],
  ["Sad", ["sad", "breakup", "judai", "dard", "tanha", "channa", "yaad", "bewafa", "alone"]],
  ["Party", ["party", "dance", "club", "remix", "dj", "beat", "bass", "bhangra"]],
  ["Chill", ["chill", "relax", "lofi", "coffee", "indie", "calm", "sleep"]],
  ["Workout", ["workout", "gym", "run", "energy", "power"]],
  ["Devotional", ["bhajan", "devotional", "aarti", "mantra", "krishna", "ram", "shiv"]],
];

const DEFAULT_SMART_AUTOPLAY_STATUS: SmartAutoplayStatus = {
  enabled: true,
  mode: "similar-trending",
  isRefreshing: false,
  seedSongId: null,
  seedTitle: null,
  basisLabels: [],
  generatedCount: 0,
  generatedAt: null,
};

function getSmartAutoplaySettings(settings: AppSettings): {
  enabled: boolean;
  mode: SmartAutoplayMode;
} {
  return {
    enabled: settings.smartAutoplayEnabled !== false,
    mode: normalizeSmartAutoplayMode(settings.smartAutoplayMode),
  };
}

function resolveWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

function textKey(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitWords(value: unknown): string[] {
  return textKey(value)
    .split(" ")
    .filter((word) => word.length > 1);
}

function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.flatMap(parseTagList)));
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  return Array.from(new Set(
    raw
      .split(/[,/|•]+|\s+\+\s+/)
      .flatMap((part) => {
        const val = textKey(part);
        return val ? [val] : [];
      })
  ));
}

function getGenreTags(song: Song): string[] {
  const explicit = parseTagList((song as Song & { genres?: unknown }).genres || song.genre);
  const text = textKey(`${song.title} ${song.album} ${song.artist} ${song.language} ${song.genre}`);
  const inferred = [
    text.includes("bollywood") || text.includes("hindi") ? "bollywood" : "",
    text.includes("punjabi") ? "punjabi" : "",
    text.includes("gujarati") || text.includes("garba") ? "gujarati" : "",
    text.includes("pop") ? "pop" : "",
    text.includes("rock") ? "rock" : "",
    text.includes("indie") ? "indie" : "",
    text.includes("dance") || text.includes("party") ? "dance" : "",
    text.includes("romantic") || text.includes("love") ? "romantic" : "",
  ].filter(Boolean);

  return Array.from(new Set([...explicit, ...inferred]));
}

function getMoodTags(song: Song): string[] {
  const explicit = parseTagList((song as Song & { mood?: unknown; moods?: unknown }).mood || (song as Song & { moods?: unknown }).moods);
  const sourceText = textKey(`${song.title} ${song.album} ${song.artist} ${song.genre}`);
  const inferred = MOOD_KEYWORDS.flatMap(([mood, words]) =>
    words.some((word) => sourceText.includes(word)) ? [textKey(mood)] : []
  );

  return Array.from(new Set([...explicit, ...inferred]));
}

function getArtistTags(song: Song): string[] {
  const normalized = textKey(song.artist);
  if (!normalized || normalized === UNKNOWN_ARTIST) return [];

  return Array.from(new Set(
    normalized
      .split(/\s*,\s*|\s+\b(?:feat|ft|featuring|and|x)\b\s+|\s*&\s+/i)
      .map((part) => part.trim())
      .filter((part) => part && part !== UNKNOWN_ARTIST)
  ));
}

function getYear(song: Song): number {
  const year = Number((song as Song & { releaseYear?: unknown }).year || (song as Song & { releaseYear?: unknown }).releaseYear || 0);
  return Number.isFinite(year) ? year : 0;
}

function getPopularity(song: Song): number {
  const raw = Number((song as Song & { popularity?: unknown }).popularity || song.playCount || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 100) return raw;
  return Math.min(Math.log10(raw) * 14, 100);
}

function overlapCount(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.reduce((count, item) => count + (rightSet.has(item) ? 1 : 0), 0);
}

function songIdentityKey(song: Song): string {
  return `${song.source || "song"}:${String(song.id || "").trim()}`;
}

function songTitleKey(song: Song): string {
  return textKey(song.title)
    .replace(
      /\b(from|original|motion|picture|soundtrack|ost|movie|film|album|official|full|song|video|audio|remix|remixed|rmx|lofi|lo|fi|slowed|reverb|cover|live|acoustic|instrumental|karaoke|8d|nightcore|mashup|version|title|track)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function titleArtistKey(song: Song): string {
  return `${songTitleKey(song)}:${getArtistTags(song).slice().sort().join("|")}`;
}

function dedupeSongs(songs: Array<Song | null | undefined>): Song[] {
  const seenIds = new Set<string>();
  const seenTitleArtists = new Set<string>();
  const out: Song[] = [];

  for (const song of songs) {
    if (!song?.id || !song.title) continue;
    const idKey = songIdentityKey(song);
    const titleKey = titleArtistKey(song);
    if (seenIds.has(idKey) || (titleKey !== ":" && seenTitleArtists.has(titleKey))) continue;
    seenIds.add(idKey);
    if (titleKey !== ":") seenTitleArtists.add(titleKey);
    out.push(song);
  }

  return out;
}

function getRecentSongItems(items: RecentlyPlayedItem[]): Song[] {
  return items
    .map((item) => (item.type === "song" && item.data?.id ? item.data as Song : null))
    .filter((song): song is Song => Boolean(song?.id && song?.title));
}

function buildUserPreferenceMaps(recentSongs: Song[], likedSongs: Song[]) {
  const artistWeights = new Map<string, number>();
  const genreWeights = new Map<string, number>();
  const moodWeights = new Map<string, number>();

  const addSong = (song: Song, weight: number) => {
    getArtistTags(song).forEach((artist) => artistWeights.set(artist, (artistWeights.get(artist) || 0) + weight));
    getGenreTags(song).forEach((genre) => genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight));
    getMoodTags(song).forEach((mood) => moodWeights.set(mood, (moodWeights.get(mood) || 0) + weight));
  };

  recentSongs.forEach((song, index) => addSong(song, Math.max(1, 8 - index * 0.35)));
  likedSongs.forEach((song) => addSong(song, 10));

  return { artistWeights, genreWeights, moodWeights };
}

function weightedTagScore(tags: string[], weights: Map<string, number>, multiplier: number, cap: number): number {
  const total = tags.reduce((sum, tag) => sum + (weights.get(tag) || 0), 0);
  return Math.min(total * multiplier, cap);
}

function calculateSimilarityScore({
  seed,
  candidate,
  mode,
  recentSongs,
  recentlyPlayedIds,
  preferenceMaps,
  index,
}: {
  seed: Song;
  candidate: Song;
  mode: SmartAutoplayMode;
  recentSongs: Song[];
  recentlyPlayedIds: Set<string>;
  preferenceMaps: ReturnType<typeof buildUserPreferenceMaps>;
  index: number;
}): number {
  const seedArtists = getArtistTags(seed);
  const candidateArtists = getArtistTags(candidate);
  const seedGenres = getGenreTags(seed);
  const candidateGenres = getGenreTags(candidate);
  const seedMoods = getMoodTags(seed);
  const candidateMoods = getMoodTags(candidate);
  const seedLanguage = textKey(seed.language);
  const candidateLanguage = textKey(candidate.language);
  const seedYear = getYear(seed);
  const candidateYear = getYear(candidate);
  const sameArtist = overlapCount(seedArtists, candidateArtists);
  const sameGenre = overlapCount(seedGenres, candidateGenres);
  const sameMood = overlapCount(seedMoods, candidateMoods);
  let score = 0;

  score += Math.min(sameGenre, 2) * 40;
  score += Math.min(sameMood, 2) * 30;
  score += Math.min(sameArtist, 2) * 20;
  if (seedLanguage && candidateLanguage && seedLanguage === candidateLanguage) score += 15;
  if (seedYear > 0 && candidateYear > 0) {
    const yearDistance = Math.abs(seedYear - candidateYear);
    if (yearDistance <= 2) score += 10;
    else if (yearDistance <= 5) score += 6;
  }

  if (mode === "artist-radio") {
    score += sameArtist > 0 ? 58 : -18;
  } else if (mode === "mood-radio") {
    score += sameMood > 0 ? 55 : -10;
  } else if (mode === "similar-only") {
    score += sameArtist > 0 || sameMood > 0 || sameGenre > 0 ? 10 : -28;
  }

  const popularity = getPopularity(candidate);
  if (popularity >= 70) score += 10;
  if (mode === "similar-trending") {
    score += popularity * 0.1;
  }

  score += weightedTagScore(candidateArtists, preferenceMaps.artistWeights, 1.3, 38);
  score += weightedTagScore(candidateGenres, preferenceMaps.genreWeights, 0.7, 20);
  score += weightedTagScore(candidateMoods, preferenceMaps.moodWeights, 0.9, 24);

  const recentIndex = recentSongs.findIndex((song) => song.id === candidate.id);
  if (recentIndex >= 0) {
    score += Math.max(0, 8 - recentIndex);
  }

  if (recentlyPlayedIds.has(candidate.id)) {
    score -= 120;
  }

  const seedTitle = songTitleKey(seed);
  const candidateTitle = songTitleKey(candidate);
  if (seedTitle && candidateTitle && seedTitle === candidateTitle) {
    score -= 200;
  }

  score += Math.random() * 2;
  score -= index * 0.002;
  return score;
}

function createBasisLabels(seed: Song, mode: SmartAutoplayMode): string[] {
  const labels: string[] = [];
  const primaryMood = getMoodTags(seed)[0];
  const language = String(seed.language || "").trim();
  const primaryArtist = String(seed.artist || "").split(",")[0]?.trim();
  const primaryGenre = getGenreTags(seed)[0];

  if (mode === "artist-radio" && primaryArtist) labels.push(primaryArtist);
  if (mode === "mood-radio" && primaryMood) labels.push(toDisplayLabel(primaryMood));
  if (primaryMood && !labels.includes(toDisplayLabel(primaryMood))) labels.push(toDisplayLabel(primaryMood));
  if (language) labels.push(toDisplayLabel(language));
  if (primaryArtist && !labels.includes(primaryArtist)) labels.push(primaryArtist);
  if (labels.length < 3 && primaryGenre) labels.push(toDisplayLabel(primaryGenre));

  return labels.slice(0, 4);
}

function toDisplayLabel(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCacheKey(options: SmartAutoplayOptions, recentSongs: Song[], likedSongs: Song[]): string {
  const seedKey = songIdentityKey(options.currentSong);
  const recentKey = recentSongs.slice(0, 8).map((song) => song.id).join(",");
  const likedKey = likedSongs.slice(0, 12).map((song) => song.id).join(",");
  return `${options.userId || "guest"}:${options.mode}:${seedKey}:${recentKey}:${likedKey}`;
}

export async function generateSmartAutoplayQueue(
  options: SmartAutoplayOptions
): Promise<SmartAutoplayQueueResult> {
  const limit = Math.max(1, Math.min(options.limit || SMART_AUTOPLAY_LIMIT, SMART_AUTOPLAY_LIMIT));
  const recentItems = await getRecentlyPlayed().catch(() => []);
  const recentSongs = getRecentSongItems(recentItems);
  const likedSongs = options.likedSongs || [];
  const cacheKey = getCacheKey(options, recentSongs, likedSongs);
  const cached = SMART_AUTOPLAY_CACHE.get(cacheKey);
  const excludedIds = new Set([
    options.currentSong.id,
    ...(options.existingQueue?.map((song) => song.id) || []),
  ]);
  const directRecentIds = new Set(recentSongs.slice(0, RECENT_DIRECT_EXCLUDE_COUNT).map((song) => song.id));

  if (cached && Date.now() - cached.createdAt < SMART_AUTOPLAY_CACHE_TTL_MS) {
    return {
      ...cached.result,
      songs: cached.result.songs
        .filter((song) => !excludedIds.has(song.id) && !directRecentIds.has(song.id))
        .slice(0, limit),
    };
  }

  const catalogSongs = await resolveWithin(getCatalogSongs(), SMART_AUTOPLAY_CATALOG_TIMEOUT_MS, [] as Song[]);
  const candidateSongs = dedupeSongs([
    ...(options.candidateSongs || []),
    ...likedSongs,
    ...recentSongs,
    ...catalogSongs,
  ]);

  const recentlyPlayedIds = new Set(recentSongs.slice(0, RECENT_DIRECT_EXCLUDE_COUNT).map((song) => song.id));
  const preferenceMaps = buildUserPreferenceMaps(recentSongs, likedSongs);
  const scored: ScoredSong[] = [];

  candidateSongs.forEach((candidate, index) => {
    if (!candidate.id || candidate.id === options.currentSong.id || excludedIds.has(candidate.id)) return;
    const score = calculateSimilarityScore({
      seed: options.currentSong,
      candidate,
      mode: options.mode,
      recentSongs,
      recentlyPlayedIds,
      preferenceMaps,
      index,
    });
    if (score <= 0) return;
    scored.push({ song: candidate, score, index });
  });

  const seenTitleKeys = new Set([songTitleKey(options.currentSong)]);
  const songs: Song[] = [];
  scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .forEach(({ song }) => {
      const titleKey = songTitleKey(song);
      if (titleKey && seenTitleKeys.has(titleKey)) return;
      if (titleKey) seenTitleKeys.add(titleKey);
      songs.push(song);
    });

  const result = {
    songs: songs.slice(0, limit),
    basisLabels: createBasisLabels(options.currentSong, options.mode),
    generatedAt: Date.now(),
  };

  SMART_AUTOPLAY_CACHE.set(cacheKey, { result, createdAt: Date.now() });
  return result;
}
