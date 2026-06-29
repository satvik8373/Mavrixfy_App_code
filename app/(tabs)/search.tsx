import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Keyboard,
  InteractionManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import Colors from "@/constants/colors";
import { getBestImageUrl, Song } from "@/lib/musicData";
import { getApiUrl } from "@/lib/query-client";
import SongRow from "@/components/SongRow";
import { getCatalogSongs, searchCatalog } from "@/lib/catalogService";
import {
  normalizeText,
  rankSongs,
  parseStructuredQuery
} from "@/lib/searchUtils";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import AppTopHeader, {
  APP_TOP_HEADER_HEIGHT,
  AppTopHeaderDownloadButton,
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import SearchHeaderField from "@/components/SearchHeaderField";
import SearchResultFilterChip from "@/components/SearchResultFilterChip";
import { useNetwork } from "@/contexts/NetworkContext";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { filterMap, sortedCopy } from "@/lib/arrayUtils";
import { searchJioSaavnAlbums, type JioSaavnAlbumResult } from "@/lib/jioSaavnService";
import type { ArtistCard } from "@/lib/artistService";
import {
  addSongSearchHistoryItem,
  addSearchHistoryItem,
  getSearchHistory,
  removeSearchHistoryItem,
  type SearchHistoryItem,
} from "@/lib/storage";
import AdMobNativeVideo from "@/components/AdMobNativeVideo";
import {
  getYouTubeMusicSearchSuggestions,
  searchYouTubeMusic,
  searchYouTubeMusicVideos,
  normalizeYouTubeArtworkUrl,
} from "@/lib/youtubeMusicService";
import { logger } from "@/lib/logger";

interface PlaylistResult {
  id: string;
  name: string;
  image: { quality: string; url: string }[];
  songCount: number;
  url?: string;
  description?: string;
  language?: string;
}

type AlbumResult = JioSaavnAlbumResult;
type ArtistResult = ArtistCard & {
  subtitle?: string;
  url?: string;
};

interface RecentSearchItem {
  id: string;
  label: string;
  subtitle?: string;
  imageUrl?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: "song" | "playlist" | "artist" | "query";
  song?: Song;
}

type SearchCacheEntry = {
  songs: Song[];
  youtubeSongs: Song[];
  albums: AlbumResult[];
  artists: ArtistResult[];
  playlists: PlaylistResult[];
  timestamp: number;
};

interface BrowseCategory {
  id: string;
  title: string;
  color: string;
  imageUrl: string;
  isHero?: boolean;
}

type ResultFilter = "all" | "songs" | "albums" | "artists" | "playlists";

const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "artists", label: "Artists" },
  { key: "playlists", label: "Playlists" },
];

const CARD_ROTATION_PATTERN = [-11, 8, -7, 10, -5, 6] as const;
const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");
const MAX_SEARCH_SUGGESTIONS = 8;
const MAX_JIOSAAVN_ENRICHMENT_QUERIES = 4;

function getRouteSearchQuery(params: { q?: string | string[]; name?: string | string[] }) {
  const incomingQuery = Array.isArray(params.q)
    ? params.q[0]
    : params.q || (Array.isArray(params.name) ? params.name[0] : params.name);
  return String(incomingQuery || "").trim();
}

function normalizeRecentSearchLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getMeaningfulSearchTokens(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const out: string[] = [];
  for (const token of normalized.split(" ")) {
    if (token.length > 1) out.push(token);
  }
  return out;
}

function getTokenOverlapScore(source: string, candidate: string): number {
  const sourceTokens = getMeaningfulSearchTokens(source);
  if (sourceTokens.length === 0) return 0;

  const candidateText = normalizeText(candidate);
  let hits = 0;
  for (const token of sourceTokens) {
    if (candidateText.includes(token)) hits += 1;
  }
  return hits / sourceTokens.length;
}

function normalizeSearchSuggestionList(query: string, items: string[]): string[] {
  const normalizedQuery = normalizeText(query);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const label = normalizeRecentSearchLabel(String(item || ""));
    const key = normalizeText(label);
    if (!key || key.length < 2 || key === normalizedQuery || seen.has(key)) continue;

    seen.add(key);
    out.push(label);
    if (out.length >= MAX_SEARCH_SUGGESTIONS) break;
  }

  return out;
}

function buildJioSaavnEnrichmentQueries(
  searchTerm: string,
  youtubeSuggestions: string[],
  youtubeSongs: Song[]
): string[] {
  const originalKey = normalizeText(searchTerm);
  const seen = new Set<string>([originalKey]);
  const out: string[] = [];
  const add = (value: string) => {
    const label = normalizeRecentSearchLabel(value);
    const key = normalizeText(label);
    if (!key || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };

  for (const suggestion of youtubeSuggestions) {
    const key = normalizeText(suggestion);
    if (!key) continue;
    const overlapsOriginal = getTokenOverlapScore(searchTerm, suggestion) >= 0.5;
    if (overlapsOriginal) add(suggestion);
    if (out.length >= 2) break;
  }

  for (const song of youtubeSongs.slice(0, 3)) {
    const title = normalizeRecentSearchLabel(song.title || "");
    const artist = normalizeRecentSearchLabel(song.artist || "");
    if (title && artist && artist !== "Unknown Artist") add(`${title} ${artist}`);
    if (title) add(title);
    if (out.length >= MAX_JIOSAAVN_ENRICHMENT_QUERIES) break;
  }

  return out.slice(0, MAX_JIOSAAVN_ENRICHMENT_QUERIES);
}

function toRecentSearchItem(item: SearchHistoryItem): RecentSearchItem {
  if (item.type === "song" && item.song) {
    return {
      id: item.id,
      label: item.label,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl || item.song.coverUrl,
      type: "song",
      song: item.song,
    };
  }

  return {
    id: item.id,
    label: item.label,
    type: "query",
    icon: "search",
  };
}

function toRecentSearchItems(items: SearchHistoryItem[]): RecentSearchItem[] {
  return items.map(toRecentSearchItem);
}

function BrowseCategoryCard({
  category,
  index,
  onPress,
}: {
  category: BrowseCategory;
  index: number;
  onPress: (title: string) => void;
}) {
  const handlePress = useCallback(() => onPress(category.title), [category.title, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.browseCard,
        { backgroundColor: category.color },
        pressed && styles.browseCardPressed,
      ]}
      onPress={handlePress}
    >
      <Text style={styles.browseCardTitle}>{category.title}</Text>
      <Image
        source={{ uri: category.imageUrl }}
        style={[
          styles.browseCardImage,
          { transform: [{ rotate: `${CARD_ROTATION_PATTERN[index % CARD_ROTATION_PATTERN.length]}deg` }] },
        ]}
        contentFit="cover"
        transition={100}
      />
    </Pressable>
  );
}

const STITCH_BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: "bollywood",
    title: "Bollywood",
    color: "#5203D5",
    isHero: true,
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDF65iTajyxJ3pY_3UEgaEW904AIU2tgjMxR5nFVYA-a4pMW61Kv8YDwfMgptSw3ucmCvM1KahK-8SJ1uh3RB_pXxlJbGvdq6-zw277CJj1UUhPTeUNpmTYkdwKvLKpFcricdxCBw8Z6UTISEL6keZa5GWMv4vjHlGOpMuTw8_GZF-pmQvE3_kEQSk5RIrhD6dB5uDLIPrxgpgh8fBQk2z9ORzDfj1FqWnlXAl9DqmYpuygexks2zhfYCb2Pm8NIgCA8ga2fOz9Tok",
  },
  {
    id: "pop",
    title: "Pop",
    color: "#006450",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCZIhRFtHlrYaSCGix2eKc62r5E2OGJmi4Mr-bozt_oxoy55OJw0TkuTaeteOmFnfFONc7_XzQVPGli7S-7IJKcgBk4TpnK6EWRMHlbrc0trTsyl7hKAHWH4UgU3B7bw1ZrGHjxWQYVi6k_e-fjUyVunPndYiCeaOkaNv0W2J8A4VQpg1ApyKZChtYlKbZozPO6BZ_Hq85UkZYIDUMzlJI_wyklKcbdkvGMTcyFrk8LWKZxphmy3ae1Pqiv92T7icXwqznnLT588ZI",
  },
  {
    id: "hip-hop",
    title: "Hip-Hop",
    color: "#BA5D07",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD2KE4nLxpvF1LiA-NnK3zqUt5OwAyWqDLbv_rY9LGLUo1d3v7KDYVFHZFcdedYGc5vYOG3YsIyk3P_z8S6seI84xHk5lc8gsq6ciHOH319bfM-rLiKhULw3q2ZnAPo0OPNWkqqCqe7n-M6WepbtMG8L15wNXx875FRsHQGf2iZ2kiHID4B38IjGR1YprFRntfDQbkORI0ntzMg2ZtTk6HojgBnBrO_5J4gJSbZrmlqp-H4D6rGADt9vp1Fz_CDmu-OqTYEXqMvAwo",
  },
  {
    id: "rock",
    title: "Rock",
    color: "#E8115B",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBRgyg4EDVFPBmagvQ0AY014mXu54WLUXwlGXxC8n_HEvNhBFgo5hOuMr6J6vRIoWFhrdYTMNA38g4lsukc6ZjN2ajd8D-eXvyhUuAfSjRz-XXRpWVFaIJh3sTVWpxr5XJbg4EEpWZg9R8gAoEntObreXkfAgPald-vwI8sxI4kvO1R3ncM_t-eyK-BKsSaLOUh0nOjBzwMuJq8ycLTpYIabDLhWMjmilC20GzVrQq_JL6IJieFb_AKGwj-6kaKK0CUqtnPVhsC9-A",
  },
  {
    id: "indie",
    title: "Indie",
    color: "#608108",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBMB3olxHY8oMxn-jGk7VtkK2hD6B8iQI4KFypQfJqwp7y2A8bdDsOtVvg5TVl5hy4b3AAw6yEtky0N9OyCyXEfmQl923IQF0J_WjH1-0FmSowMuo6j0FvfuI1t1aAZ6wFi7nHmStnAJEtO5mWqPaQwZQQM4QFy-QnFBu11xQYWsAMnhJBYY6duROuq7te-xhHLZn5Vx15fjXEKwTkFXH1jxLjgc-KiX0_oTl6G84EImZC6gMMKeu6JxDHbuPCnVHtrZD3kO06p7Ko",
  },
  {
    id: "jazz",
    title: "Jazz",
    color: "#1E3264",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBG-LmEIH-auFtgbVhJU73l9PSsvQ3lQsH7CDcsIQ_5IUE2i3bR82PnkMIUoR37XyDn1nlx_EAeVZ1LtMFzQwIa9Zvfv94kl3j-KfXFa8Lis18YO6bFs6Nj8lvcGQSzNcFug2Vn6uY3rBrkTYX-mYWswADQRQfn5h-QKIconMYiS4y8GZQVdpXaQiJ6RLbNGh_naYEqLE6Ym9VXn6iLfKp9cOcgJMHEoevEp6uScdjC9gWlJjwqylTvtmYi78K3Lwmj9UZP40Ns_VE",
  },
  {
    id: "dance",
    title: "Dance",
    color: "#503750",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDvY_BiFuyPneuEyFqRGoTUMqqC4YJ_LdJ8hXSG5x_d9U27bOx0K98LPve9M-VEVp8OfAqsquOXR96D0cyusyydD97seGMAzgIfbKmd5tMDiXVfCQug6nxvSOrIXFOPcBue5EyOpszvTPrGtid7h0FjMMJP7KfM9pZ9wnYoWDgMKY3ifDxe0vMg12bFc4nVXi-zKW_6q-qzl40lFlox5ysVRvFmtkS1ocZgBcrvn0wLALW0EJJUjcshReBPOzfJ_4o_Oviadl7b5_8",
  },
  {
    id: "mood",
    title: "Mood",
    color: "#D84000",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBNixTEXxcJsE5uNrpVwKtCRVff9IaLYnG3lz_dkBXw6WcCF0iEDgM8K2vFT_ZwiHG2c_A3xfFY3NhCUKSqOAXKb6441vtXI4D0_WqtQS5R2lIco6Ux_7vbny49Z0SWpriw4ZbuaIVjuvnU1Hn8dJV_7-vzvutrYooqNODyg3rX9DnnfMC6YUojNCTlHRuMK36Ed7MoPoxkoOf_hGB-vprCpZvpLrvEo1KVUYru2yvmr0XoeUU8XihIsQYeMW-LB04keedcDLfS6aA",
  },
  {
    id: "focus",
    title: "Focus",
    color: "#477D95",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCNW5owpFqXCvk3pVLdFElyHHs_laywpufifloYeOWae-AhwI6a8tR8-CQ_wVF5Az7kxbGon2CHFqkT-McNucibd3okQaSW07f9w5UBLJcyHUDF0VL-uVoGXRFU2W7kBHs0_Az7prwPQHPnSRanUD08wNUkGhPnanwz6SLwuWBSiUSFEO2pQyPARCgZUtNWpL9tKPVm_OLuRof4bsUnTEnvaMfpbgKz2tkmI72un4_uWHd9Hn1l8t5jnNzlU7fCQ21ZC0B5Vx45v_E",
  },
  {
    id: "classical",
    title: "Classical",
    color: "#7D4B32",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCqB9ybv3HO8eHYX6bQVSEyicyS_SlOfwKehM-c1kpTsDSV_5n4MoNQKRuiLVqFKvl2ZG5cLdNV-cCJFBXinik9HqbxpeRZrt7lXngNX-5TGleoJYrumblrEw0tacOx7eLVQ8p9g9BcyWFRUPZIl9VR0NDUf1HF3cwjfVayM8TF6WSKSdOvu-ENf_z8FpFsOAlwNIvBB4LOGds41GdDZRAfm6LGWNCRFuxpnSc6WBHo9QuzulYUqG2oqzMOwvxggwk12uT0FOft_Wk",
  },
];

function countCsvValues(value: string): number {
  let count = 0;
  for (const part of value.split(",")) {
    if (part.trim()) count += 1;
  }
  return count;
}

function normalizePlaylistResults(raw: unknown): PlaylistResult[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const normalized: PlaylistResult[] = [];

  for (const item of raw as any[]) {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || item?.title || "").trim();
    if (!id || !name || seen.has(id)) continue;

    const songCount = Number(item?.songCount || item?.song_count || 0)
      || (typeof item?.songIds === "string"
        ? countCsvValues(item.songIds)
        : 0);

    seen.add(id);
    normalized.push({
      id,
      name,
      image: Array.isArray(item?.image) ? item.image : [],
      songCount,
      url: String(item?.url || item?.link || "").trim() || undefined,
      description: String(item?.description || "").trim() || undefined,
      language: String(item?.language || "").trim() || undefined,
    });
  }

  return normalized;
}

function normalizeAlbumResults(raw: unknown): AlbumResult[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const normalized: AlbumResult[] = [];

  for (const item of raw as any[]) {
    const id = String(item?.id || item?.albumId || item?.albumid || "").trim();
    const name = String(item?.name || item?.title || "").trim();
    if (!id || !name || seen.has(id)) continue;

    const songCount = Number(item?.songCount || item?.song_count || 0)
      || (typeof item?.songIds === "string"
        ? countCsvValues(item.songIds)
        : 0);

    seen.add(id);
    normalized.push({
      id,
      name,
      image: Array.isArray(item?.image) ? item.image : [],
      songCount,
      year: String(item?.year || "").trim() || undefined,
      language: String(item?.language || item?.lang || "").trim() || undefined,
      url: String(item?.url || item?.link || "").trim() || undefined,
      artist: String(item?.artist || item?.primaryArtists || item?.primary_artists || "").trim() || undefined,
      description: String(item?.description || "").trim() || undefined,
    });
  }

  return normalized;
}

function normalizeArtistResults(raw: unknown): ArtistResult[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const normalized: ArtistResult[] = [];

  for (const item of raw as any[]) {
    const id = String(item?.id || "").trim();
    const name = String(item?.name || item?.title || "").trim();
    if (!id || !name || seen.has(id)) continue;

    seen.add(id);
    normalized.push({
      id,
      name,
      image: Array.isArray(item?.image) ? item.image : [],
      subtitle: String(item?.description || item?.role || item?.dominantLanguage || "").trim() || undefined,
      url: String(item?.url || "").trim() || undefined,
      followerCount: Number(item?.followerCount || item?.follower_count || 0) || null,
      dominantLanguage: String(item?.dominantLanguage || item?.dominant_language || "").trim() || null,
    });
  }

  return normalized;
}

function mergeUniqueById<T extends { id: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const SONG_METADATA_TITLE_WORDS = new Set([
  "from",
  "original",
  "motion",
  "picture",
  "soundtrack",
  "ost",
  "movie",
  "film",
  "album",
  "official",
  "full",
  "song",
  "video",
  "audio",
]);

const SONG_VERSION_TITLE_WORDS = new Set([
  "remix",
  "remixed",
  "rmx",
  "lofi",
  "lo",
  "fi",
  "slowed",
  "reverb",
  "cover",
  "live",
  "acoustic",
  "instrumental",
  "karaoke",
  "8d",
  "nightcore",
  "mashup",
  "version",
]);

const SONG_METADATA_PATTERN =
  "from|original|motion\\s+picture|soundtrack|ost|movie|film|album|official|full\\s+song|video|audio";
const SONG_VERSION_PATTERN =
  "remix|remixed|rmx|lofi|lo-fi|lo\\s+fi|slowed|reverb|cover|live|acoustic|instrumental|karaoke|8d|nightcore|mashup|version";

function hasSongVersionIntent(query: string): boolean {
  return new RegExp(`\\b(${SONG_VERSION_PATTERN})\\b`, "i").test(query);
}

function decodeSongText(value: string): string {
  return value
    .replace(/&amp;/gi, " and ")
    .replace(/&quot;/gi, " ")
    .replace(/&#039;|&apos;/gi, " ")
    .replace(/&nbsp;/gi, " ");
}

function normalizeSongDuplicateTitle(title: string, keepVersionWords = false): string {
  let raw = decodeSongText(String(title || ""));
  const bracketNoise = keepVersionWords
    ? SONG_METADATA_PATTERN
    : `${SONG_METADATA_PATTERN}|${SONG_VERSION_PATTERN}`;

  raw = raw
    .replace(new RegExp(`\\([^)]*\\b(${bracketNoise})\\b[^)]*\\)`, "gi"), " ")
    .replace(new RegExp(`\\[[^\\]]*\\b(${bracketNoise})\\b[^\\]]*\\]`, "gi"), " ")
    .replace(new RegExp(`\\{[^}]*\\b(${bracketNoise})\\b[^}]*\\}`, "gi"), " ")
    .replace(new RegExp(`\\s[-–—:|]\\s*(${SONG_METADATA_PATTERN}).*$`, "i"), " ");

  if (!keepVersionWords) {
    raw = raw.replace(new RegExp(`\\s[-–—:|]\\s*(${SONG_VERSION_PATTERN}).*$`, "i"), " ");
  }

  if (!/^\s*from\b/i.test(raw)) {
    raw = raw.replace(/\s+\bfrom\b.*$/i, " ");
  }

  const normalized = normalizeText(raw);
  const words = normalized.split(/\s+/).filter(Boolean);
  return words
    .filter((word) =>
      !SONG_METADATA_TITLE_WORDS.has(word)
      && (keepVersionWords || !SONG_VERSION_TITLE_WORDS.has(word))
    )
    .join(" ");
}

function normalizeSongPeopleKey(artist: string): string {
  const normalized = normalizeText(artist);
  if (!normalized || normalized === "unknown artist") return "unknown";

  const parts = normalized
    .split(/\s*,\s*|\s+\b(?:feat|ft|featuring|and|x)\b\s+|\s*&\s+/i)
    .map((part) => part.trim())
    .filter((part) => part && part !== "unknown artist");

  const uniqueParts = Array.from(new Set(parts.length > 0 ? parts : [normalized]));
  return uniqueParts.sort().slice(0, 3).join("|") || "unknown";
}

function normalizeSongAlbumKey(album: string): string {
  return normalizeSongDuplicateTitle(album, true);
}

function getStableSongIdKey(song: Song): string {
  const id = normalizeText(String(song.id || ""));
  return id ? `${song.source || "song"}:${id}` : "";
}

function areDuplicateSearchSongs(next: Song, existing: Song, keepVersionWords: boolean): boolean {
  const nextId = getStableSongIdKey(next);
  const existingId = getStableSongIdKey(existing);
  if (nextId && nextId === existingId) return true;

  const nextTitle = normalizeSongDuplicateTitle(next.title, keepVersionWords);
  const existingTitle = normalizeSongDuplicateTitle(existing.title, keepVersionWords);
  if (!nextTitle || nextTitle !== existingTitle) return false;

  const nextArtist = normalizeSongPeopleKey(next.artist);
  const existingArtist = normalizeSongPeopleKey(existing.artist);
  if (nextArtist !== "unknown" && existingArtist !== "unknown" && nextArtist === existingArtist) {
    return true;
  }

  const nextAlbum = normalizeSongAlbumKey(next.album);
  const existingAlbum = normalizeSongAlbumKey(existing.album);
  if (nextAlbum && existingAlbum && nextAlbum === existingAlbum) {
    return true;
  }

  const nextDuration = Number(next.duration) || 0;
  const existingDuration = Number(existing.duration) || 0;
  return nextTitle.length >= 4
    && nextDuration > 30
    && existingDuration > 30
    && Math.abs(nextDuration - existingDuration) <= 5;
}

function uniqueSongResultIds(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.map((song, index) => {
    const fallbackId = `${normalizeSongDuplicateTitle(song.title, true)}-${normalizeSongPeopleKey(song.artist)}-${index}`;
    const baseId = String(song.id || fallbackId).trim() || fallbackId;
    let nextId = baseId;
    let suffix = 1;
    while (seen.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seen.add(nextId);
    return nextId === song.id ? song : { ...song, id: nextId };
  });
}

function interleaveSearchSongResults(primarySongs: Song[], discoverySongs: Song[], keepVersionWords: boolean): Song[] {
  const merged: Song[] = [];
  const append = (song: Song | undefined) => {
    if (!song) return;
    const duplicate = merged.some((existing) => areDuplicateSearchSongs(song, existing, keepVersionWords));
    if (!duplicate) merged.push(song);
  };

  const longest = Math.max(primarySongs.length, discoverySongs.length);
  for (let index = 0; index < longest; index += 1) {
    append(primarySongs[index]);
    append(discoverySongs[index]);
  }

  return uniqueSongResultIds(merged);
}

function isYouTubeCollectionResult(id: string, url?: string, description?: string): boolean {
  const value = String(id || "").trim();
  const lowerUrl = String(url || "").toLowerCase();
  const lowerDescription = String(description || "").toLowerCase();

  return (
    value.startsWith("MPRE") ||
    value.startsWith("OLAK") ||
    value.startsWith("PL") ||
    value.startsWith("VL") ||
    value.startsWith("RDCLAK") ||
    value.startsWith("RDTMAK") ||
    lowerUrl.includes("youtube") ||
    lowerUrl.includes("music.youtube.com") ||
    lowerDescription.includes("youtube")
  );
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function SearchScreen() {
  return useSearchScreenView();
}

function useSearchScreenView() {
  const insets = useSafeAreaInsets();
  const { push: routerPush } = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[]; name?: string | string[] }>();
  const { isOnline } = useNetwork();
  const { playSong } = usePlayerActions();
  const routeSearchQuery = getRouteSearchQuery(params);
  const [query, setQuery] = useState(routeSearchQuery);
  const [songResults, setSongResults] = useState<Song[]>([]);
  const [youtubeMusicResults, setYoutubeMusicResults] = useState<Song[]>([]);
  const [albumResults, setAlbumResults] = useState<AlbumResult[]>([]);
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([]);
  const [playlistResults, setPlaylistResults] = useState<PlaylistResult[]>([]);
  const [searchDisplayQuery, setSearchDisplayQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(routeSearchQuery.length > 0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const {
    isHeaderElevated,
    handleHeaderScroll,
    resetHeaderElevation,
  } = useAppTopHeaderScrollElevation();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const suggestionsSeqRef = useRef(0);
  const latestSuggestionsRef = useRef<{ query: string; items: string[] } | null>(null);
  const suggestionsClosedForQueryRef = useRef<string | null>(null);
  const appliedRouteSearchQueryRef = useRef(routeSearchQuery);
  const activeSearchAbortRef = useRef<AbortController | null>(null);
  const resultsPlaylistsListRef = useRef<FlatList<PlaylistResult> | null>(null);
  const resultsAlbumsListRef = useRef<FlatList<AlbumResult> | null>(null);
  const resultsArtistsListRef = useRef<FlatList<ArtistResult> | null>(null);
  const resultsSongsListRef = useRef<FlatList<Song> | null>(null);
  const searchCacheRef = useRef<Map<string, SearchCacheEntry> | null>(null);
  if (searchCacheRef.current === null) {
    searchCacheRef.current = new Map();
  }
  const searchCache = searchCacheRef.current;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const shuffledBrowseCategories = useMemo(() => {
    const hero = STITCH_BROWSE_CATEGORIES.find((item) => item.isHero);
    const rest = STITCH_BROWSE_CATEGORIES.filter((item) => !item.isHero);
    const randomized = sortedCopy(rest, () => Math.random() - 0.5);
    return hero ? [hero, ...randomized] : randomized;
  }, []);
  const browseCategories = useMemo(
    () => filterMap(shuffledBrowseCategories, (category) => !category.isHero, (category) => category),
    [shuffledBrowseCategories]
  );

  const performSearch = useCallback(async (searchQuery: string) => {
    const requestId = ++requestSeqRef.current;
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      activeSearchAbortRef.current?.abort();
      activeSearchAbortRef.current = null;
      setSongResults([]);
      setYoutubeMusicResults([]);
      setAlbumResults([]);
      setArtistResults([]);
      setPlaylistResults([]);
      setSearchDisplayQuery("");
      setSearchLoading(false);
      return;
    }

    activeSearchAbortRef.current?.abort();
    const controller = new AbortController();
    activeSearchAbortRef.current = controller;

    // Check cache first (5 minute TTL)
    const cacheKey = normalizedQuery.toLowerCase();
    const cached = searchCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < 300000) { // 5 minutes
      setSongResults(cached.songs || []);
      setYoutubeMusicResults(cached.youtubeSongs || []);
      setAlbumResults(cached.albums || []);
      setArtistResults(cached.artists || []);
      setPlaylistResults(cached.playlists || []);
      setSearchDisplayQuery(normalizedQuery);
      setSearchLoading(false);
      if (activeSearchAbortRef.current === controller) {
        activeSearchAbortRef.current = null;
      }
      return;
    }

    setSearchLoading(true);
    setYoutubeMusicResults([]);
    const apiUrl = getApiUrl();
    const parsedQuery = parseStructuredQuery(normalizedQuery);
    const searchTerm = parsedQuery.freeText || normalizedQuery;

    // Safe fetch — returns parsed JSON or null, never throws
    const safeFetch = (url: string) =>
      fetch(url, { signal: controller.signal })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);

    // Which version of a song is better?
    const isBetter = (n: Song, e: Song): boolean => {
      if (n.source === "local" && e.source !== "local") return true;
      if (n.source !== "local" && e.source === "local") return false;
      if (n.artist === 'Unknown Artist' && e.artist !== 'Unknown Artist') return false;
      if (n.artist !== 'Unknown Artist' && e.artist === 'Unknown Artist') return true;
      const remix = /\b(remix|lofi|slowed|cover|live|acoustic|instrumental|8d|nightcore)\b/i;
      const nR = remix.test(n.title), eR = remix.test(e.title);
      if (!nR && eR) return true;
      if (nR && !eR) return false;
      return (n.playCount || 0) > (e.playCount || 0);
    };

    // Parse song results that may use .link or .url media fields.
    const parseBackup = (s: any): Song | null => {
      if (!s?.id) return null;
      const dl: any[] = Array.isArray(s.downloadUrl) ? s.downloadUrl : [];
      const audioUrl =
        dl.find(d => d.quality === '320kbps')?.link ||
        dl.find(d => d.quality === '320kbps')?.url ||
        dl.find(d => d.quality === '160kbps')?.link ||
        dl.find(d => d.quality === '160kbps')?.url ||
        dl[dl.length - 1]?.link || dl[dl.length - 1]?.url || '';
      if (!audioUrl) return null;
      const imgs: any[] = Array.isArray(s.image) ? s.image : [];
      const coverUrl =
        imgs.find(i => i.quality === '500x500')?.link ||
        imgs.find(i => i.quality === '500x500')?.url ||
        imgs.find(i => i.quality === '150x150')?.link ||
        imgs[imgs.length - 1]?.link || imgs[imgs.length - 1]?.url || '';
      const artist = (typeof s.primaryArtists === 'string' && s.primaryArtists.trim())
        ? s.primaryArtists.trim()
        : (s.artists?.primary || []).map((a: any) => a.name).join(', ') || 'Unknown Artist';
      const sec = Number(s.duration) || 0;
      return {
        id: s.id, title: s.name || s.title || '', artist,
        album: typeof s.album === "string" ? s.album : s.album?.name || '', duration: sec,
        coverUrl, genre: s.language || '', audioUrl,
        downloadUrl: s.downloadUrl,
        year: s.year ? String(s.year) : '', source: 'jiosaavn',
        playCount: Number(s.playCount) || 0,
      };
    };

    const keepVersionWords = hasSongVersionIntent(normalizedQuery);

    const mergeInto = (items: Song[], song: Song) => {
      const duplicateIndex = items.findIndex((existing) =>
        areDuplicateSearchSongs(song, existing, keepVersionWords)
      );

      if (duplicateIndex === -1) {
        items.push(song);
        return;
      }

      if (isBetter(song, items[duplicateIndex])) {
        items[duplicateIndex] = song;
      }
    };

    const toFinalList = (songs: Song[]) => {
      return uniqueSongResultIds(songs);
    };

    // Fast rank using JioSaavn playCount only — no network wait
    const fastRank = (songs: Song[]) =>
      rankSongs(songs, normalizedQuery, 5).map(r => r.song).slice(0, 15);
    const requestIsActive = () =>
      requestId === requestSeqRef.current && !controller.signal.aborted;

    try {
      if (!requestIsActive()) return;

      // OPTIMIZATION: Fetch catalog songs first (instant, local)
      const catalogSongs = await getCatalogSongs().catch(() => [] as Song[]);

      if (requestIsActive()) {
        // Show catalog results immediately
        const mergedSongs: Song[] = [];
        for (const s of searchCatalog(catalogSongs, normalizedQuery)) {
          mergeInto(mergedSongs, s);
        }

        const catalogResults = toFinalList(mergedSongs);
        if (catalogResults.length > 0) {
          setSongResults(fastRank(catalogResults));
          setSearchDisplayQuery(normalizedQuery);
        }

        // Fetch primary app/API sections first so the UI can settle before YouTube enrichment.
        const [
          globalData,
          songsData,
          albumSectionResults,
          artistsData,
          playlistsData
        ] = await Promise.all([
          safeFetch(`${apiUrl}api/search?query=${encodeURIComponent(searchTerm)}`),
          safeFetch(`${apiUrl}api/search/songs?query=${encodeURIComponent(searchTerm)}&limit=12`),
          searchJioSaavnAlbums(searchTerm, 8, controller.signal),
          safeFetch(`${apiUrl}api/search/artists?query=${encodeURIComponent(searchTerm)}&limit=8&page=1`),
          safeFetch(`${apiUrl}api/search/playlists?query=${encodeURIComponent(searchTerm)}&limit=6`),
        ]);

        if (requestIsActive()) {
          // Merge network results with catalog results
          for (const s of (songsData?.data?.results || songsData?.results || [])) {
            const song = parseBackup(s);
            if (song) mergeInto(mergedSongs, song);
          }

          const playlists = playlistsData?.success
            ? mergeUniqueById([
                ...normalizePlaylistResults(globalData?.data?.playlists?.results),
                ...normalizePlaylistResults(playlistsData.data?.results),
              ], 12)
            : Array.isArray(playlistsData?.results)
              ? mergeUniqueById([
                  ...normalizePlaylistResults(globalData?.data?.playlists?.results),
                  ...normalizePlaylistResults(playlistsData.results),
                ], 12)
              : mergeUniqueById([
                  ...normalizePlaylistResults(globalData?.data?.playlists?.results),
                ], 12);

          const albums = mergeUniqueById([
            ...normalizeAlbumResults(globalData?.data?.albums?.results),
            ...albumSectionResults,
          ], 12);
          const artists = mergeUniqueById([
            ...normalizeArtistResults(globalData?.data?.artists?.results),
            ...normalizeArtistResults(artistsData?.data?.results),
            ...normalizeArtistResults(artistsData?.results),
          ], 12);

          const songs = toFinalList(mergedSongs);
          const rankedSongs = fastRank(songs);

          // Show primary results without waiting for YouTube secondary sections.
          setSongResults(rankedSongs);
          setYoutubeMusicResults([]);
          setAlbumResults(albums);
          setArtistResults(artists);
          setPlaylistResults(playlists);
          setSearchDisplayQuery(normalizedQuery);
          setSearchLoading(false);

          const writeCache = (entry: SearchCacheEntry) => {
            searchCache.set(cacheKey, entry);
            if (searchCache.size > 20) {
              const firstKey = searchCache.keys().next().value;
              if (firstKey) searchCache.delete(firstKey);
            }
          };

          const loadDiscoverySections = async () => {
            try {
              const cachedSuggestions = latestSuggestionsRef.current;
              const suggestionRequest =
                cachedSuggestions?.query === normalizeText(searchTerm)
                  ? Promise.resolve(cachedSuggestions.items)
                  : getYouTubeMusicSearchSuggestions(searchTerm, controller.signal);
              // react-doctor-disable-next-line react-doctor/async-defer-await -- request activity can change while these concurrent calls are in flight.
              const [ytMusicSongs, ytMusicVideos, youtubeSuggestions] = await Promise.all([
                searchYouTubeMusic(searchTerm, "song", 15, controller.signal),
                searchYouTubeMusicVideos(searchTerm, 10, controller.signal),
                suggestionRequest,
              ]);

              if (!requestIsActive()) return;

              const youtubeSongs: Song[] = [];
              const seenYtIds = new Set<string>();
              for (const ytSong of [...ytMusicSongs, ...ytMusicVideos]) {
                if (ytSong && !seenYtIds.has(ytSong.id)) {
                  seenYtIds.add(ytSong.id);
                  youtubeSongs.push(ytSong);
                }
              }

              let enrichedRankedSongs = rankedSongs;
              const enrichmentQueries = buildJioSaavnEnrichmentQueries(
                searchTerm,
                normalizeSearchSuggestionList(searchTerm, youtubeSuggestions),
                youtubeSongs
              );
              if (enrichmentQueries.length > 0) {
                const enrichmentRequests = enrichmentQueries.map((enrichmentQuery) =>
                  safeFetch(`${apiUrl}api/search/songs?query=${encodeURIComponent(enrichmentQuery)}&limit=8`)
                );
                // react-doctor-disable-next-line react-doctor/async-defer-await -- the stale-request guard must run after this optional enrichment batch.
                const enrichmentResults = await Promise.all(enrichmentRequests);
                if (!requestIsActive()) return;

                const enrichedSongs = rankedSongs.slice();
                for (const suggestionData of enrichmentResults) {
                  for (const rawSong of (suggestionData?.data?.results || suggestionData?.results || [])) {
                    const parsedSong = parseBackup(rawSong);
                    if (parsedSong) mergeInto(enrichedSongs, parsedSong);
                  }
                }
                enrichedRankedSongs = fastRank(toFinalList(enrichedSongs));
              }

              logger.debug("[Search] Discovery results", {
                youtubeSongCount: youtubeSongs.length,
                jioSaavnSongCount: enrichedRankedSongs.length,
                enrichmentQueryCount: enrichmentQueries.length,
              });
              setSongResults(enrichedRankedSongs);
              setYoutubeMusicResults(youtubeSongs);
              writeCache({
                songs: enrichedRankedSongs,
                youtubeSongs,
                albums,
                artists,
                playlists,
                timestamp: Date.now(),
              });
            } catch (error) {
              if (!controller.signal.aborted) {
                logger.warn("[Search] YouTube Music enrichment failed:", error);
                writeCache({
                  songs: rankedSongs,
                  youtubeSongs: [],
                  albums,
                  artists,
                  playlists,
                  timestamp: Date.now(),
                });
              }
            } finally {
              if (activeSearchAbortRef.current === controller) {
                activeSearchAbortRef.current = null;
              }
            }
          };

          InteractionManager.runAfterInteractions(() => {
            void loadDiscoverySections();
          });
        }
      }

    } catch {
      if (!requestIsActive()) return;
      setSongResults([]);
      setYoutubeMusicResults([]);
      setAlbumResults([]);
      setArtistResults([]);
      setPlaylistResults([]);
      setSearchDisplayQuery(normalizedQuery);
      setSearchLoading(false);
      if (activeSearchAbortRef.current === controller) {
        activeSearchAbortRef.current = null;
      }
    }
  }, [searchCache]);



  const handleChangeText = useCallback((text: string) => {
    setQuery(text);
    if (text.trim().length < 2) {
      setResultFilter("all");
      setSuggestions([]);
      setSuggestionsOpen(false);
      suggestionsClosedForQueryRef.current = null;
      return;
    }
    suggestionsClosedForQueryRef.current = null;
    setSuggestionsOpen(true);
  }, []);

  useEffect(() => {
    let isActive = true;

    void getSearchHistory()
      .then((items) => {
        if (isActive) {
          setRecentSearches(toRecentSearchItems(items));
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      suggestionsSeqRef.current += 1;
      latestSuggestionsRef.current = null;
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    const requestId = ++suggestionsSeqRef.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const list = await getYouTubeMusicSearchSuggestions(trimmed, controller.signal);
        if (requestId === suggestionsSeqRef.current && !controller.signal.aborted) {
          const normalizedList = normalizeSearchSuggestionList(trimmed, list);
          const normalizedTrimmed = normalizeText(trimmed);
          latestSuggestionsRef.current = { query: normalizeText(trimmed), items: normalizedList };
          setSuggestions(normalizedList);
          setSuggestionsOpen(
            normalizedList.length > 0 && suggestionsClosedForQueryRef.current !== normalizedTrimmed
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.warn("Failed to fetch suggestions:", error);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const rememberRecentSearch = useCallback((label: string) => {
    const normalized = normalizeRecentSearchLabel(label);
    if (normalized.length < 2) return;

    setRecentSearches((prev) => {
      const nextItem: RecentSearchItem = {
        id: `q_${encodeURIComponent(normalized.toLowerCase()).slice(0, 100)}`,
        label: normalized,
        type: "query",
        icon: "time-outline",
      };
      const filtered = prev.filter(
        (item) => item.label.toLowerCase() !== normalized.toLowerCase()
      );
      return [nextItem, ...filtered].slice(0, 12);
    });

    void addSearchHistoryItem(normalized)
      .then((items) => setRecentSearches(toRecentSearchItems(items)))
      .catch(() => undefined);
  }, []);

  const applyProgrammaticSearchQuery = useCallback((next: string) => {
    setIsSearchMode(true);
    setQuery(next);
    setSuggestionsOpen(false);
  }, []);

  useEffect(() => {
    const next = routeSearchQuery;
    if (next.length < 2 || next === appliedRouteSearchQueryRef.current) return;

    appliedRouteSearchQueryRef.current = next;
    applyProgrammaticSearchQuery(next);
    suggestionsClosedForQueryRef.current = normalizeText(next);
    rememberRecentSearch(next);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    void performSearch(next);
  }, [applyProgrammaticSearchQuery, performSearch, rememberRecentSearch, routeSearchQuery]);

  const handleGenrePress = useCallback(
    (genreName: string) => {
      const next = genreName.trim();
      if (!next) return;
      resetHeaderElevation();
      setIsSearchMode(true);
      setQuery(next);
      suggestionsClosedForQueryRef.current = normalizeText(next);
      setSuggestionsOpen(false);
      setSuggestions([]);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, rememberRecentSearch, resetHeaderElevation]
  );

  const renderBrowseCategory = useCallback(
    ({ item, index }: { item: BrowseCategory; index: number }) => (
      <BrowseCategoryCard category={item} index={index} onPress={handleGenrePress} />
    ),
    [handleGenrePress]
  );

  const handleRecentSearchPress = useCallback(
    (item: RecentSearchItem) => {
      if (item.type === "song" && item.song) {
        playSong(item.song, [item.song]);
        void addSongSearchHistoryItem(item.song)
          .then((items) => setRecentSearches(toRecentSearchItems(items)))
          .catch(() => undefined);
        return;
      }

      const next = item.label.trim();
      if (next.length < 2) return;
      resetHeaderElevation();
      setIsSearchMode(true);
      setQuery(next);
      suggestionsClosedForQueryRef.current = normalizeText(next);
      setSuggestionsOpen(false);
      setSuggestions([]);
      rememberRecentSearch(next);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      void performSearch(next);
    },
    [performSearch, playSong, rememberRecentSearch, resetHeaderElevation]
  );

  const handleSuggestionPress = useCallback((suggestion: string) => {
    const next = normalizeRecentSearchLabel(suggestion);
    if (next.length < 2) return;
    resetHeaderElevation();
    setIsSearchMode(true);
    setResultFilter("all");
    suggestionsClosedForQueryRef.current = normalizeText(next);
    setSuggestionsOpen(false);
    setQuery(next);
    setSuggestions([]);
    Keyboard.dismiss();
    rememberRecentSearch(next);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    void performSearch(next);
  }, [performSearch, rememberRecentSearch, resetHeaderElevation]);

  const renderSuggestion = useCallback(
    ({ item: suggestion }: { item: string }) => (
      <Pressable
        style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionRowPressed]}
        onPressIn={() => handleSuggestionPress(suggestion)}
      >
        <Ionicons name="search-outline" size={18} color={Colors.subtext} style={styles.suggestionIcon} />
        <Text style={styles.suggestionText} numberOfLines={1}>
          {suggestion}
        </Text>
      </Pressable>
    ),
    [handleSuggestionPress]
  );

  const handleRemoveRecentSearch = useCallback((id: string) => {
    setRecentSearches((prev) => prev.filter((item) => item.id !== id));
    void removeSearchHistoryItem(id)
      .then((items) => setRecentSearches(toRecentSearchItems(items)))
      .catch(() => undefined);
  }, []);

  const handleResultFilterSelect = useCallback((filter: ResultFilter) => {
    resetHeaderElevation();
    setResultFilter(query.trim().length < 2 ? "all" : filter);
  }, [query, resetHeaderElevation]);

  const renderResultFilter = useCallback(
    ({ item }: { item: { key: ResultFilter; label: string } }) => (
      <SearchResultFilterChip
        filter={item}
        activeFilter={resultFilter}
        onSelect={handleResultFilterSelect}
      />
    ),
    [handleResultFilterSelect, resultFilter]
  );

  const applyEmptySearchState = useCallback((displayQuery = "") => {
    setSongResults([]);
    setYoutubeMusicResults([]);
    setAlbumResults([]);
    setArtistResults([]);
    setPlaylistResults([]);
    setSearchDisplayQuery(displayQuery);
    setSearchLoading(false);
  }, []);

  const startSearchLoading = useCallback(() => {
    setSearchLoading(true);
  }, []);

  const cancelActiveSearchWork = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    activeSearchAbortRef.current?.abort();
    activeSearchAbortRef.current = null;
  }, []);

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    suggestionsClosedForQueryRef.current = normalizeText(trimmed);
    setSuggestionsOpen(false);
    setSuggestions([]);
    Keyboard.dismiss();
    rememberRecentSearch(trimmed);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    void performSearch(trimmed);
  }, [performSearch, query, rememberRecentSearch]);

  const handleClear = useCallback(() => {
    requestSeqRef.current += 1;
    cancelActiveSearchWork();
    setQuery("");
    suggestionsClosedForQueryRef.current = null;
    setSuggestionsOpen(false);
    setSuggestions([]);
    applyEmptySearchState();
  }, [applyEmptySearchState, cancelActiveSearchWork]);

  const handleActivateSearchMode = useCallback(() => {
    resetHeaderElevation();
    setIsSearchMode(true);
  }, [resetHeaderElevation]);

  const handleCancelSearchMode = useCallback(() => {
    handleClear();
    resetHeaderElevation();
    setIsSearchMode(false);
  }, [handleClear, resetHeaderElevation]);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestSeqRef.current += 1;
      activeSearchAbortRef.current?.abort();
      activeSearchAbortRef.current = null;
      applyEmptySearchState();
      return;
    }

    startSearchLoading();
    const searchTimer = setTimeout(() => {
      void performSearch(trimmed);
    }, 300); // Increased from 150ms to 300ms for better performance
    debounceTimer.current = searchTimer;

    return () => {
      clearTimeout(searchTimer);
    };
  }, [applyEmptySearchState, performSearch, query, startSearchLoading]);

  useEffect(() => {
    return cancelActiveSearchWork;
  }, [cancelActiveSearchWork]);

  useEffect(() => {
    if (query.trim().length < 2) return;

    requestAnimationFrame(() => {
      if (resultFilter === "playlists") {
        resultsPlaylistsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else if (resultFilter === "albums") {
        resultsAlbumsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else if (resultFilter === "artists") {
        resultsArtistsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else {
        resultsSongsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    });
  }, [query, resultFilter]);

  const hasResults =
    songResults.length > 0 ||
    youtubeMusicResults.length > 0 ||
    albumResults.length > 0 ||
    artistResults.length > 0 ||
    playlistResults.length > 0;
  const showFocusedRecentSearches = isSearchMode && query.trim().length < 2;
  const showBrowse = !isSearchMode && query.trim().length < 2;
  const resultDataKey =
    `${query.trim()}-${resultFilter}-${songResults.length}-${youtubeMusicResults.length}-${albumResults.length}-${artistResults.length}-${playlistResults.length}-${searchLoading ? 1 : 0}`;
  const mixedSongResults = useMemo(
    () => interleaveSearchSongResults(songResults, youtubeMusicResults, hasSongVersionIntent(query)),
    [query, songResults, youtubeMusicResults]
  );
  const searchHeaderNode = useMemo(
    () => (
      <SearchHeaderField
        value={query}
        onChangeText={handleChangeText}
        onSubmit={handleSubmitSearch}
        onClear={handleClear}
        autoFocus={isSearchMode}
      />
    ),
    [handleChangeText, handleClear, handleSubmitSearch, isSearchMode, query]
  );
  const cancelSearchNode = useMemo(
    () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
        onPress={handleCancelSearchMode}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        style={({ pressed }) => [styles.searchCancelButton, pressed && styles.searchCancelButtonPressed]}
      >
        <Text style={styles.searchCancelText}>Cancel</Text>
      </Pressable>
    ),
    [handleCancelSearchMode]
  );

  useEffect(() => {
    if (showBrowse || showFocusedRecentSearches || searchLoading) return;

    requestAnimationFrame(() => {
      if (resultFilter === "playlists") {
        resultsPlaylistsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else if (resultFilter === "albums") {
        resultsAlbumsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else if (resultFilter === "artists") {
        resultsArtistsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else {
        resultsSongsListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    });
  }, [searchLoading, resultFilter, showBrowse, showFocusedRecentSearches, songResults.length, youtubeMusicResults.length, albumResults.length, artistResults.length, playlistResults.length]);

  const showAlbumResults = (resultFilter === "all" || resultFilter === "albums") && albumResults.length > 0;
  const showArtistResults = (resultFilter === "all" || resultFilter === "artists") && artistResults.length > 0;
  const showPlaylistResults = (resultFilter === "all" || resultFilter === "playlists") && playlistResults.length > 0;
  const showSongResults = (resultFilter === "all" || resultFilter === "songs") && mixedSongResults.length > 0;
  const displayedSongs = useMemo(
    () => (showSongResults ? mixedSongResults : []),
    [mixedSongResults, showSongResults]
  );
  const featuredAlbums = useMemo(() => albumResults.slice(0, 6), [albumResults]);
  const featuredArtists = useMemo(() => artistResults.slice(0, 5), [artistResults]);
  const featuredPlaylists = useMemo(() => playlistResults.slice(0, 6), [playlistResults]);
  const handleSongResultPress = useCallback((song: Song) => {
    void addSongSearchHistoryItem(song)
      .then((items) => setRecentSearches(toRecentSearchItems(items)))
      .catch(() => undefined);
  }, []);

  const renderSong = useCallback(
    ({ item }: { item: Song; index: number }) => {
      return (
          <SongRow
            song={item}
            onSongPress={handleSongResultPress}
          />
      );
    },
    [handleSongResultPress]
  );

  const handleArtistPress = useCallback(
    (artist: ArtistResult) => {
      routerPush(
        {
          pathname: "/artist/[id]",
          params: {
            id: artist.id,
            name: artist.name,
            image: getBestImageUrl(artist.image),
          },
        },
        {
          withAnchor: true,
          dangerouslySingular: () => "artist-profile",
        }
      );
    },
    [routerPush]
  );

  const getArtistRowElement = useCallback(
    (artist: ArtistResult) => (
      <Pressable
        style={({ pressed }) => [styles.artistResultRow, pressed && styles.recentRowPressed]}
        onPress={() => handleArtistPress(artist)}
      >
        {getBestImageUrl(artist.image) ? (
          <Image
            recyclingKey={`artist-search-${artist.id}`}
            source={{ uri: getBestImageUrl(artist.image) }}
            style={styles.artistResultImage}
            contentFit="cover"
            transition={100}
          />
        ) : (
          <View style={[styles.artistResultImage, styles.artistResultImageFallback]}>
            <Ionicons name="person" size={25} color={Colors.subtext} />
          </View>
        )}
        <View style={styles.artistResultInfo}>
          <Text style={styles.artistResultName} numberOfLines={1}>
            {artist.name}
          </Text>
          <Text style={styles.artistResultMeta} numberOfLines={1}>
            {artist.subtitle || artist.dominantLanguage || "Artist"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.subtext} />
      </Pressable>
    ),
    [handleArtistPress]
  );

  const renderArtistResult = useCallback(
    ({ item }: { item: ArtistResult }) => getArtistRowElement(item),
    [getArtistRowElement]
  );

  const getAlbumCardElement = useCallback(
    (album: AlbumResult, index: number) => {
      const seed = stableHash(`album-${album.id}-${index}`);
      const staggerPattern = [0, 7, 3, 9, 2, 5] as const;
      const tiltPattern = [0.8, -1.0, 1.1, -0.7, 0.6, -0.9] as const;
      const staggerOffset = staggerPattern[seed % staggerPattern.length];
      const tilt = tiltPattern[(Math.floor(seed / 7)) % tiltPattern.length];
      const metaParts = [
        album.artist || "Album",
        album.year,
        album.language,
      ].filter((value): value is string => Boolean(value));
      const isYt = isYouTubeCollectionResult(album.id, album.url, album.description);
      const imageUrl = isYt ? normalizeYouTubeArtworkUrl(getBestImageUrl(album.image)) : getBestImageUrl(album.image);
      const meta = album.songCount > 0
        ? `${album.songCount} songs`
        : metaParts.join(" · ") || "Album";

      return (
        <Pressable
          style={({ pressed }) => [
            styles.playlistGridCard,
            { marginTop: staggerOffset },
            pressed && styles.playlistClassicCardPressed,
          ]}
          onPress={() => {
            routerPush({
              pathname: "/playlist/[id]",
              params: {
                id: String(album.id).trim(),
                jiosaavn: isYt ? "false" : "true",
                youtube: isYt ? "true" : "false",
                album: "true",
                firestore: "false",
                link: album.url || "",
                title: album.name,
                description: album.description || meta,
                cover: imageUrl,
                songCount: String(Math.max(0, album.songCount || 0)),
              },
            }, {
              withAnchor: true,
              dangerouslySingular: () => "playlist-details",
            });
          }}
        >
          <View style={[styles.playlistGridImageWrap, { transform: [{ rotate: `${tilt}deg` }] }]}>
            <Image
              recyclingKey={`album-${album.id}`}
              source={{ uri: imageUrl }}
              style={styles.playlistGridImage}
              contentFit="cover"
              transition={160}
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.42)"]}
              start={{ x: 0.5, y: 0.22 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.brandCoverBadge}>
              <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
            </View>
          </View>
          <View style={styles.playlistGridContent}>
            <Text style={styles.playlistGridName} numberOfLines={2}>
              {album.name}
            </Text>
            <Text style={styles.playlistGridMeta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </Pressable>
      );
    },
    [routerPush]
  );

  const renderAlbumResult = useCallback(
    ({ item, index }: { item: AlbumResult; index: number }) => (
      <View style={styles.playlistGridItemWrap}>{getAlbumCardElement(item, index)}</View>
    ),
    [getAlbumCardElement]
  );

  const getPlaylistCardElement = useCallback(
    (playlist: PlaylistResult, index: number) => {
      const seed = stableHash(`${playlist.id}-${index}`);
      const staggerPattern = [0, 8, 4, 10, 2, 6] as const;
      const tiltPattern = [-1.1, 0.9, -0.8, 1.2, -0.6, 0.8] as const;
      const staggerOffset = staggerPattern[seed % staggerPattern.length];
      const tilt = tiltPattern[(Math.floor(seed / 7)) % tiltPattern.length];
      const isYt = isYouTubeCollectionResult(playlist.id, playlist.url, playlist.description);
      const imageUrl = isYt ? normalizeYouTubeArtworkUrl(getBestImageUrl(playlist.image)) : getBestImageUrl(playlist.image);
      const meta = playlist.songCount > 0
        ? `${Math.max(0, playlist.songCount || 0)} songs`
        : playlist.language || playlist.description || "Playlist";

      return (
        <Pressable
          style={({ pressed }) => [
            styles.playlistGridCard,
            { marginTop: staggerOffset },
            pressed && styles.playlistClassicCardPressed,
          ]}
          onPress={() => {
            routerPush({
              pathname: "/playlist/[id]",
              params: {
                id: String(playlist.id).trim(),
                jiosaavn: isYt ? "false" : "true",
                youtube: isYt ? "true" : "false",
                firestore: "false",
                link: playlist.url || "",
                title: playlist.name,
                description: playlist.description || meta,
                cover: imageUrl,
                songCount: String(Math.max(0, playlist.songCount || 0)),
              },
            }, {
              withAnchor: true,
              dangerouslySingular: () => "playlist-details",
            });
          }}
        >
          <View style={[styles.playlistGridImageWrap, { transform: [{ rotate: `${tilt}deg` }] }]}>
            <Image
              recyclingKey={playlist.id}
              source={{ uri: imageUrl }}
              style={styles.playlistGridImage}
              contentFit="cover"
              transition={160}
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.42)"]}
              start={{ x: 0.5, y: 0.22 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.brandCoverBadge}>
              <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
            </View>
          </View>
          <View style={styles.playlistGridContent}>
            <Text style={styles.playlistGridName} numberOfLines={2}>
              {playlist.name}
            </Text>
            <Text style={styles.playlistGridMeta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </Pressable>
      );
    },
    [routerPush]
  );

  const renderPlaylistResult = useCallback(
    ({ item, index }: { item: PlaylistResult; index: number }) => (
      <View style={styles.playlistGridItemWrap}>{getPlaylistCardElement(item, index)}</View>
    ),
    [getPlaylistCardElement]
  );

  return (
    <View style={styles.container}>
      {/* Offline: show banner when searching, full screen when idle */}
      {!isOnline && query.length === 0 && (
        <OfflineScreen
          message="Search requires an internet connection."
          hideDownloadsButton={false}
        />
      )}
      {!isOnline && query.length > 0 && <OfflineBanner />}
      {isSearchMode ? (
        <AppTopHeader
          topInset={topInset}
          elevated={isHeaderElevated}
          titleNode={searchHeaderNode}
          leftWidth={0}
          rightWidth={68}
          right={cancelSearchNode}
        />
      ) : (
        <AppTopHeader
          topInset={topInset}
          elevated={isHeaderElevated}
          title="Search"
          left={<AppTopHeaderProfileButton />}
          right={<AppTopHeaderDownloadButton />}
        />
      )}
      {!isSearchMode ? (
        <View style={[styles.searchBarRow, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 10 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search songs, albums, artists, playlists"
            style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}
            onPress={handleActivateSearchMode}
          >
            <Ionicons name="search" size={17} color="#6A6A6A" />
            <Text style={styles.inactiveSearchText} numberOfLines={1}>
              What do you want to listen to?
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isSearchMode && suggestionsOpen && suggestions.length > 0 && query.trim().length >= 2 && (
        <View style={[styles.suggestionsDropdown, { top: topInset + APP_TOP_HEADER_HEIGHT + 8 }]}>
          <FlatList
            data={suggestions}
            keyboardDismissMode="none"
            keyboardShouldPersistTaps="always"
            keyExtractor={(suggestion) => `suggestion-${suggestion}`}
            renderItem={renderSuggestion}
          />
        </View>
      )}

      {showFocusedRecentSearches ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 14, paddingBottom: 146 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={handleHeaderScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>Recent searches</Text>
            {recentSearches.length > 0 ? (
              recentSearches.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.recentRow, pressed && styles.recentRowPressed]}
                  onPress={() => handleRecentSearchPress(item)}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={[styles.recentThumb, item.type === "artist" && styles.recentThumbRound]}
                      contentFit="cover"
                      transition={100}
                    />
                  ) : (
                    <View style={[styles.recentThumb, styles.recentThumbRound, styles.recentThumbFallback]}>
                      <Ionicons name={item.icon ?? "search"} size={24} color={Colors.subtext} />
                    </View>
                  )}
                  <View style={styles.recentInfo}>
                    <Text style={styles.recentLabel} numberOfLines={1}>{item.label}</Text>
                    {item.subtitle ? (
                      <Text style={styles.recentSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    hitSlop={10}
                    style={styles.recentActionBtn}
                    onPress={(e) => { e.stopPropagation(); handleRemoveRecentSearch(item.id); }}
                  >
                    <Ionicons name="close" size={18} color={Colors.subtext} />
                  </Pressable>
                </Pressable>
              ))
            ) : (
              <View style={styles.recentEmpty}>
                <Ionicons name="search-outline" size={34} color={Colors.subtext} />
                <Text style={styles.recentEmptyText}>No recent searches</Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : showBrowse ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 146 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={handleHeaderScroll}
          scrollEventThrottle={16}
        >
          {/* Native Video Ad */}
          <AdMobNativeVideo />

          {/* ── Browse All ── */}
          <View style={styles.browseSection}>
            <Text style={styles.browseTitle}>Browse all</Text>
            <FlatList
              data={browseCategories}
              keyExtractor={(category) => category.id}
              renderItem={renderBrowseCategory}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.browseGridList}
              columnWrapperStyle={styles.browseGridRow}
            />
          </View>
        </ScrollView>
      ) : (
        /* ── Results ── */
        <View style={[styles.resultsWrap, { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 8 }]}>
          {/* Filter chips */}
          <View style={styles.filterRow}>
            <FlatList
              data={RESULT_FILTERS}
              keyExtractor={(filter) => filter.key}
              renderItem={renderResultFilter}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRowContent}
            />
          </View>

          {searchLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : !hasResults ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{`No results for "${searchDisplayQuery}"`}</Text>
              <Text style={styles.emptySubtext}>Check the spelling, or search for something else.</Text>
            </View>
          ) : resultFilter === "playlists" ? (
            <FlatList
              ref={resultsPlaylistsListRef}
              key={`pl-${resultDataKey}`}
              data={showPlaylistResults ? playlistResults : []}
              keyExtractor={(item) => item.id}
              renderItem={renderPlaylistResult}
              style={styles.scrollView}
              contentContainerStyle={[styles.playlistGridContentContainer, { paddingBottom: 146 }]}
              showsVerticalScrollIndicator={false}
              onScroll={handleHeaderScroll}
              scrollEventThrottle={16}
              numColumns={2}
              columnWrapperStyle={styles.playlistGridRow}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              ListEmptyComponent={<View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No playlists found.</Text></View>}
            />
          ) : resultFilter === "albums" ? (
            <FlatList
              ref={resultsAlbumsListRef}
              key={`al-${resultDataKey}`}
              data={showAlbumResults ? albumResults : []}
              keyExtractor={(item) => item.id}
              renderItem={renderAlbumResult}
              style={styles.scrollView}
              contentContainerStyle={[styles.playlistGridContentContainer, { paddingBottom: 146 }]}
              showsVerticalScrollIndicator={false}
              onScroll={handleHeaderScroll}
              scrollEventThrottle={16}
              numColumns={2}
              columnWrapperStyle={styles.playlistGridRow}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              ListEmptyComponent={<View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No albums found.</Text></View>}
            />
          ) : resultFilter === "artists" ? (
            <FlatList
              ref={resultsArtistsListRef}
              key={`ar-${resultDataKey}`}
              data={showArtistResults ? artistResults : []}
              keyExtractor={(item) => item.id}
              renderItem={renderArtistResult}
              style={styles.scrollView}
              contentContainerStyle={[styles.artistListContentContainer, { paddingBottom: 146 }]}
              showsVerticalScrollIndicator={false}
              onScroll={handleHeaderScroll}
              scrollEventThrottle={16}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              ListEmptyComponent={<View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No artists found.</Text></View>}
            />
          ) : !showSongResults && resultFilter === "songs" ? (
            <View style={styles.emptyInline}><Text style={styles.emptyInlineText}>No songs found.</Text></View>
          ) : resultFilter === "all" &&
              !showSongResults &&
              !showAlbumResults &&
              !showArtistResults &&
              !showPlaylistResults ? (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.resultsContent, { paddingBottom: 146 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={handleHeaderScroll}
              scrollEventThrottle={16}
            >
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>No results found.</Text>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              ref={resultsSongsListRef}
              key={`sg-${resultDataKey}`}
              data={displayedSongs}
              keyExtractor={(item) => item.id}
              renderItem={renderSong}
              style={styles.scrollView}
              contentContainerStyle={[styles.resultsContent, { paddingBottom: 146 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={handleHeaderScroll}
              scrollEventThrottle={16}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={7}
              ListFooterComponent={
                showAlbumResults || showArtistResults || showPlaylistResults ? (
                  <>
                    {showAlbumResults ? (
                      <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>Albums</Text>
                          {resultFilter === "all" ? (
                            <Pressable onPress={() => handleResultFilterSelect("albums")}>
                              <Text style={styles.sectionActionText}>See all</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.playlistGridWrap}>
                          {featuredAlbums.map((album, index) => (
                            <View key={album.id} style={styles.playlistGridItemWrap}>
                              {getAlbumCardElement(album, index)}
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                    {showArtistResults ? (
                      <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>Artists</Text>
                          {resultFilter === "all" ? (
                            <Pressable onPress={() => handleResultFilterSelect("artists")}>
                              <Text style={styles.sectionActionText}>See all</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.artistSectionList}>
                          {featuredArtists.map((artist) => (
                            <View key={artist.id}>{getArtistRowElement(artist)}</View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                    {showPlaylistResults ? (
                      <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                          <Text style={styles.sectionTitle}>Playlists</Text>
                          {resultFilter === "all" ? (
                            <Pressable onPress={() => handleResultFilterSelect("playlists")}>
                              <Text style={styles.sectionActionText}>See all</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.playlistGridWrap}>
                          {featuredPlaylists.map((playlist, index) => (
                            <View key={playlist.id} style={styles.playlistGridItemWrap}>
                              {getPlaylistCardElement(playlist, index)}
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </>
                ) : null
              }
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Search entry ────────────────────────────────────────────────────────────
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flex: 1,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    paddingHorizontal: 12,
    gap: 9,
  },
  searchBarPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  inactiveSearchText: {
    flex: 1,
    minWidth: 0,
    color: "#121212",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  searchCancelButton: {
    minHeight: 40,
    minWidth: 58,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  searchCancelButtonPressed: {
    opacity: 0.72,
  },
  searchCancelText: {
    color: "#F8FBF9",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },

  // ── Scroll / shared ─────────────────────────────────────────────────────────
  scrollView: { flex: 1 },
  content: {},

  // ── Recent searches ─────────────────────────────────────────────────────────
  recentSection: {
    paddingBottom: 24,
  },
  recentTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 14,
  },
  recentRowPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  recentThumb: {
    width: 56,
    height: 56,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  recentThumbRound: { borderRadius: 28 },
  recentThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  recentInfo: { flex: 1, gap: 3 },
  recentLabel: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  recentSubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  recentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  recentActionBtn: { padding: 8 },
  recentEmpty: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  recentEmptyText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },

  // legacy stubs (unused but referenced nowhere — safe to keep empty)
  recentHeaderRow: {},
  recentClearText: {},
  recentChipWrap: {},
  recentChip: {},
  recentChipPressed: {},
  recentChipImage: {},
  recentChipIconWrap: {},
  recentChipLabel: {},
  recentChipCloseBtn: {},
  topBar: {},
  header: {},

  // ── Browse All ───────────────────────────────────────────────────────────────
  browseSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  browseTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 14,
  },
  browseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  browseGridList: {
    gap: 8,
  },
  browseGridRow: {
    gap: 8,
  },
  browseCard: {
    width: "48%",
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    padding: 12,
    justifyContent: "flex-end",
  },
  browseCardPressed: { opacity: 0.85 },
  browseCardTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  browseCardImage: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 64,
    height: 64,
    borderRadius: 6,
    transform: [{ rotate: "25deg" }],
  },
  // unused hero styles kept as stubs
  browseHeroCard: {},
  browseSmallCard: {},
  browseHeroCardTitle: {},
  browseHeroCardImage: {},

  // ── Results ──────────────────────────────────────────────────────────────────
  resultsWrap: { flex: 1 },
  filterRow: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  filterRowContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  resultsContent: { paddingTop: 8 },
  sectionBlock: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sectionActionText: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  // ── Artist results ─────────────────────────────────────────────────────────
  artistListContentContainer: {
    paddingTop: 6,
    paddingBottom: 8,
  },
  artistSectionList: {
    marginHorizontal: -16,
  },
  artistResultRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 13,
  },
  artistResultImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surface,
  },
  artistResultImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceLight,
  },
  artistResultInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  artistResultName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  artistResultMeta: {
    color: Colors.subtext,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },

  // ── Playlist grid ────────────────────────────────────────────────────────────
  playlistGridContentContainer: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  playlistGridRow: {
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  playlistGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  playlistGridItemWrap: {
    width: "48.5%",
    marginBottom: 16,
  },
  playlistGridCard: {
    width: "100%",
    backgroundColor: "transparent",
  },
  playlistClassicCardPressed: { opacity: 0.8 },
  playlistGridImageWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  playlistGridImage: { width: "100%", height: "100%" },
  brandCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: Colors.background,
  },
  brandCoverBadgeImage: { width: "100%", height: "100%" },
  playlistGridContent: { marginTop: 8 },
  playlistGridName: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
  },
  playlistGridMeta: {
    marginTop: 3,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // ── States ───────────────────────────────────────────────────────────────────
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtext: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  emptyInline: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyInlineText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  // ── Unused stubs ─────────────────────────────────────────────────────────────
  resultsControlsWrap: {},
  resultsHeaderPlain: {},
  resultsPillText: {},
  filterTabsWrap: {},
  filterTabsRow: {},
  filterTabChip: {},
  filterTabChipActive: {},
  filterTabChipPressed: {},
  filterTabChipText: {},
  filterTabChipTextActive: {},

  // ── Suggestions Dropdown ──────────────────────────────────────────────────
  suggestionsDropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
    zIndex: 99,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  suggestionRowPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  suggestionIcon: {
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
