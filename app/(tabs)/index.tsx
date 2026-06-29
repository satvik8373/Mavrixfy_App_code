import React, { memo, useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  AppState,
  RefreshControl,
  useWindowDimensions,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type AppStateStatus,
  type ViewToken,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { showGlobalToast } from "@/app/_layout";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getBestImageUrl, JioSaavnImage, Song } from "@/lib/musicData";
import { getRecentlyPlayed, RecentlyPlayedItem } from "@/lib/storage";
import { getPublicPlaylists, FirestorePlaylist } from "@/lib/firestore";
import { getCachedHomePublicPlaylists, setCachedHomePublicPlaylists } from "@/lib/homeCache";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { triggerImpact } from "@/lib/haptics";
import {
  clearJioSaavnPlaylistCache,
  getHomeJioSaavnCategories,
  HomeJioSaavnCategoryData,
  prefetchVisiblePlaylists,
} from "@/lib/jioSaavnService";
import {
  getRecommendationHomeFeed,
  recommendationFeedEnabled,
  RecommendationFeed,
  RecommendationItem,
  RecommendationSection,
} from "@/lib/recommendationService";
import { getDailyNewReleaseSongs } from "@/lib/newReleaseSongService";
import {
  subscribeNotifications,
  getUnreadNotificationsCount,
  loadNotifications,
} from "@/stores/notificationStore";
import { getFeaturedArtists, ArtistCard, prefetchArtist } from "@/lib/artistService";
import {
  clearYouTubeMusicCache,
  getHomeYouTubeMusicCategories,
  getYouTubeMusicTrendingPlaylists,
  YouTubeMusicHomeCategoryData,
  YouTubeMusicPlaylistCard,
  type YouTubeMusicPlaylistKind,
} from "@/lib/youtubeMusicService";
import OfflineScreen from "@/components/OfflineScreen";
import OfflineBanner from "@/components/OfflineBanner";
import AppTopHeader, {
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import AdMobBanner from "@/components/AdMobBanner";
import AppPromotionModal from "@/components/AppPromotionModal";
import PromotionBanner from "@/components/PromotionBanner";
import { useNetwork } from "@/contexts/NetworkContext";
import { filterMap, mapFilter } from "@/lib/arrayUtils";
import { DISABLED_HOME_HERO_CONFIG, subscribeHomeHeroConfig, type HomeHeroVideoItem } from "@/lib/homeHeroConfig";
import { getGoogleMobileAdsModule, type GoogleNativeAd } from "@/lib/googleMobileAds";
import { logger } from "@/lib/logger";

const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");

type HomeSection =
  | { id: "recents"; type: "recents" }
  | { id: "new-release-songs"; type: "new-release-songs" }
  | { id: "youtube-trending"; type: "youtube-trending" }
  | { id: "public-playlists"; type: "public-playlists" }
  | { id: "featured-artists"; type: "featured-artists" }
  | { id: string; type: "recommendation"; data: RecommendationSection }
  | { id: string; type: "category"; data: HomeCategoryData };

type HomeContentSource = "jiosaavn" | "youtube";

type HomeCategoryItem = {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
  source: HomeContentSource;
  imageUrl?: string;
  url?: string;
  playlistKind?: YouTubeMusicPlaylistKind;
  playlistAuthor?: string;
};

type HomeCategoryData = {
  id: string;
  title: string;
  results: HomeCategoryItem[];
};

type HomeSessionCache = {
  hydrated: boolean;
  categories: HomeCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  recentlyPlayed: RecentlyPlayedItem[];
  featuredArtists: ArtistCard[];
  newReleaseSongs: Song[];
  youtubeTrending: YouTubeMusicPlaylistCard[];
};

type HomeFeedState = "ready" | "empty" | "network";

const HOME_SESSION_CACHE: HomeSessionCache = {
  hydrated: false,
  categories: [],
  publicPlaylists: [],
  recentlyPlayed: [],
  featuredArtists: [],
  newReleaseSongs: [],
  youtubeTrending: [],
};

const HOME_CATEGORY_SECTION_ORDER = [
  "trending",
  "top-charts",
  "new-releases",
  "ranked",
  "viral-hits",
  "hot-right-now",
  "bollywood",
  "popular",
  "new-arrivals",
  "most-viral",
  "party-mix",
  "chill-vibes",
  "romance",
  "workout",
  "retro",
] as const;

const HOME_JIOSAAVN_TITLES: Record<string, string> = {
  trending:       "Trending Now",
  "top-charts":   "Top Charts",
  "new-releases": "New Releases",
  ranked:         "Top Ranked",
  "viral-hits":   "Viral Hits",
  "hot-right-now": "Hot Right Now",
  bollywood:      "Bollywood Hits",
  popular:        "Most Popular",
  "new-arrivals": "New Songs",
  "most-viral":   "Viral Hits",
  "party-mix":    "Party Mix",
  "chill-vibes":  "Chill Vibes",
  romance:        "Love & Romance",
  workout:        "Workout & Energy",
  retro:          "Retro Classics",
};

const BRAND = {
  blue: "#26E19A",
  teal: "#26E19A",
  green: "#00B87B",
  ink900: "#10141A",
  ink800: "#181C22",
  ink700: "#262A31",
  panelStrong: "#262A31",
  panelSoft: "#1C2026",
  chipSurface: "#262A31",
  textPrimary: "#DFE2EB",
  textSecondary: "rgba(223,226,235,0.9)",
  textMuted: "rgba(188,203,185,0.76)",
};

const MIN_PUBLIC_PLAYLIST_ITEMS = 1;
const PUBLIC_PLAYLIST_FETCH_TIMEOUT_MS = 4500;
const HOME_CATEGORY_FETCH_TIMEOUT_MS = 12000;
const HOME_BOOTSTRAP_MAX_WAIT_MS = 15000;
const HOME_NEW_RELEASE_SONG_TIMEOUT_MS = 8000;
const MAX_ROW_ITEMS = 10;
const NEW_RELEASE_SONG_LIMIT = 10;
const HOME_DEFAULT_BROWSE_CATEGORY_IDS = ["trending", "top-charts", "new-releases", "bollywood"] as const;
const HOME_BROWSE_CATEGORY_FETCH_IDS = [
  "trending",
  "top-charts",
  "new-releases",
  "bollywood",
  "party-mix",
  "chill-vibes",
  "romance",
  "workout",
  "retro",
] as const;
const HOME_MAX_DEFAULT_BROWSE_SECTIONS = 4;
const HOME_MAX_MOOD_BROWSE_SECTIONS = 3;
const HOME_MAX_RECOMMENDATION_SECTIONS = 2;
const HOME_MAX_PUBLIC_PLAYLISTS = 12;
const HOME_MAX_YOUTUBE_DISCOVERY_PLAYLISTS = 8;
const HOME_PRIORITY_CATEGORY_TIMEOUT_MS = 5500;
const PLACEHOLDER_ROW_ITEMS = [0, 1, 2, 3];
const QUICK_PICK_PLACEHOLDER_COLUMNS = [0, 1];
const MOOD_CHIPS = ["Podcasts", "Energize", "Feel good", "Romance", "Workout", "Relax"];
const HORIZONTAL_ROW_GAP = 12;
const RECENT_CARD_SIZE = 90;
const RECT_CARD_WIDTH = 152;
const ARTIST_CARD_WIDTH = 120;
const PINNED_HOME_HEADER_HEIGHT = 56;
const HOME_VIDEO_CARD_GAP = 10;
const HOME_HERO_AD_INIT_TIMEOUT_MS = 3000;
const HOME_HERO_AD_LOAD_TIMEOUT_MS = 5500;
const CLOUDINARY_VIDEO_UPLOAD_PATH = "/video/upload/";
const HOME_HERO_VIDEO_TRANSFORM = "f_mp4,vc_h264,c_crop,g_center,w_1440,h_810/c_fill,w_1080,h_608,q_auto:good";
const HOME_HERO_POSTER_TRANSFORM = "so_2,c_crop,g_center,w_1440,h_810/c_fill,w_1080,h_608,q_auto,f_jpg";
const INITIAL_CATEGORY_LIMIT = 10;
const REFRESH_CATEGORY_LIMIT = 12;
const INITIAL_PUBLIC_LIMIT = 24;
const INLINE_AD_SCROLL_GATE_Y = 1800;
const INLINE_AD_LOAD_DELAY_MS = 6000;
const HOME_IMAGE_TRANSITION_MS = 0;
const HOME_ROW_INITIAL_RENDER_COUNT = 4;
const HOME_ROW_WINDOW_SIZE = 5;
const HOME_VERTICAL_INITIAL_RENDER_COUNT = 3;
const HOME_VERTICAL_MAX_RENDER_BATCH = 2;
const HOME_VERTICAL_WINDOW_SIZE = 5;

function hasHomeContent(source: {
  categories: HomeCategoryData[];
  publicPlaylists: FirestorePlaylist[];
  recentlyPlayed: RecentlyPlayedItem[];
  newReleaseSongs: Song[];
  youtubeTrending?: YouTubeMusicPlaylistCard[];
}): boolean {
  return (
    source.recentlyPlayed.length > 0 ||
    source.newReleaseSongs.length > 0 ||
    source.categories.length > 0 ||
    source.publicPlaylists.length > 0 ||
    Boolean(source.youtubeTrending && source.youtubeTrending.length > 0)
  );
}

function hasVisibleHomeSections(source: HomeSessionCache): boolean {
  return hasHomeContent(source) || source.featuredArtists.length > 0;
}

function isRecentYouTubeSong(song: Partial<Song>): boolean {
  return Boolean(
    song.source === "youtube" ||
      String(song.id || "").startsWith("youtube_") ||
      song.youtubeVideoId ||
      song.videoId
  );
}

function getRecentSongAudioUrl(sourceSong: Partial<Song>): string {
  const legacySource = sourceSong as Partial<Song> & {
    url?: string;
    uri?: string;
    streamUrl?: string;
    downloadUrl?: string | { url?: string; link?: string };
  };
  const downloadUrlCandidate =
    typeof legacySource.downloadUrl === "string"
      ? legacySource.downloadUrl
      : legacySource.downloadUrl?.url || legacySource.downloadUrl?.link || "";

  return [
    sourceSong.audioUrl,
    legacySource.url,
    legacySource.uri,
    legacySource.streamUrl,
    downloadUrlCandidate,
  ].find((candidate) => typeof candidate === "string" && candidate.trim().length > 0)?.trim() || "";
}

function getThumbImageUrl(images: JioSaavnImage[] | undefined): string {
  if (!Array.isArray(images) || images.length === 0) return "";
  return getBestImageUrl(images);
}

function getHomeCategoryItemImageUrl(item: HomeCategoryItem): string {
  return item.imageUrl || getThumbImageUrl(item.image);
}

function normalizeId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function dedupeHomeCategoryItemsBySource(
  items: HomeCategoryItem[],
  limit: number
): HomeCategoryItem[] {
  const seen = new Set<string>();
  const unique: HomeCategoryItem[] = [];

  for (const item of items) {
    const id = normalizeId(item?.id);
    const source = item?.source || "jiosaavn";
    const key = `${source}:${id}`;
    if (!id || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function getQuickPickRotationSeed(): number {
  const now = new Date();
  const daySeed = Math.floor(now.getTime() / 86_400_000);
  return daySeed * 4 + Math.floor(now.getHours() / 6);
}

function getQuickPickSongs(songs: Song[], seed: number): Song[] {
  const seen = new Set<string>();
  const latestSongs: Song[] = [];

  for (const song of songs) {
    const id = String(song.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    latestSongs.push(song);
    if (latestSongs.length >= 24) break;
  }

  if (latestSongs.length <= 5) return latestSongs;

  const [latestSong, ...rotatingSongs] = latestSongs;
  const offset = rotatingSongs.length > 0 ? seed % rotatingSongs.length : 0;
  return [
    latestSong,
    ...rotatingSongs.slice(offset),
    ...rotatingSongs.slice(0, offset),
  ];
}

function toJioSaavnHomeCategoryItem(item: HomeJioSaavnCategoryData["results"][number]): HomeCategoryItem {
  return {
    id: item.id,
    name: item.name,
    image: item.image,
    songCount: Number(item.songCount || 0),
    source: "jiosaavn",
  };
}

function toYouTubeHomeCategoryItem(item: YouTubeMusicPlaylistCard): HomeCategoryItem {
  return {
    id: item.id,
    name: item.name,
    image: item.imageUrl ? [{ quality: "500x500", url: item.imageUrl }] : [],
    imageUrl: item.imageUrl,
    songCount: Number(item.songCount || 0),
    source: "youtube",
    playlistKind: item.kind,
    playlistAuthor: item.author,
  };
}

function mergeHomeCategorySources(
  jioCategories: HomeJioSaavnCategoryData[],
  youtubeCategories: YouTubeMusicHomeCategoryData[],
  limit: number
): HomeCategoryData[] {
  // Extract all JioSaavn items as a fallback pool
  const allJioItems: HomeCategoryItem[] = jioCategories.flatMap((c) =>
    c.results.map(toJioSaavnHomeCategoryItem)
  );

  // Extract all YouTube items as a fallback pool
  const allYoutubeItems: HomeCategoryItem[] = youtubeCategories.flatMap((c) =>
    c.results.map(toYouTubeHomeCategoryItem)
  );

  const mergedRows: HomeCategoryData[] = [];
  const processedYouTubeIds = new Set<string>();
  const processedJioIds = new Set<string>();

  // Helper to interleave items with 60% YouTube (3 items) and 40% JioSaavn (2 items)
  const createMixedResults = (ytItems: HomeCategoryItem[], jioItems: HomeCategoryItem[]): HomeCategoryItem[] => {
    const merged: HomeCategoryItem[] = [];
    const seen = new Set<string>();

    const append = (item: HomeCategoryItem | undefined) => {
      if (!item || merged.length >= limit) return;
      const key = `${item.source}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    };

    let ytIdx = 0;
    let jioIdx = 0;
    const fallbackYt = ytItems.length > 0 ? ytItems : allYoutubeItems;
    const fallbackJio = jioItems.length > 0 ? jioItems : allJioItems;

    while (merged.length < limit && (ytIdx < fallbackYt.length || jioIdx < fallbackJio.length)) {
      // 3 YouTube items
      for (let i = 0; i < 3 && ytIdx < fallbackYt.length && merged.length < limit; i++) {
        append(fallbackYt[ytIdx++]);
      }
      // 2 JioSaavn items
      for (let i = 0; i < 2 && jioIdx < fallbackJio.length && merged.length < limit; i++) {
        append(fallbackJio[jioIdx++]);
      }
      if (ytIdx >= fallbackYt.length && jioIdx >= fallbackJio.length) {
        break;
      }
    }

    // Fill remaining up to limit
    if (merged.length < limit) {
      [...fallbackYt, ...fallbackJio].forEach(append);
    }

    return merged;
  };

  // 1. Process matching categories first (exact ID match)
  jioCategories.forEach((jioCat) => {
    const matchingYt = youtubeCategories.find((y) => y.id === jioCat.id);
    const ytItems = matchingYt ? matchingYt.results.map(toYouTubeHomeCategoryItem) : [];
    const jioItems = jioCat.results.map(toJioSaavnHomeCategoryItem);

    if (matchingYt) {
      processedYouTubeIds.add(matchingYt.id);
    }
    processedJioIds.add(jioCat.id);

    const title = HOME_JIOSAAVN_TITLES[jioCat.id] ?? jioCat.title;
    const results = createMixedResults(ytItems, jioItems);
    if (results.length > 0) {
      mergedRows.push({ id: jioCat.id, title, results });
    }
  });

  // 2. Process remaining YouTube categories (not yet processed)
  youtubeCategories.forEach((ytCat) => {
    if (processedYouTubeIds.has(ytCat.id)) return;
    processedYouTubeIds.add(ytCat.id);

    const ytItems = ytCat.results.map(toYouTubeHomeCategoryItem);
    // Mix with general JioSaavn items as fallback so it's a mixed row!
    const results = createMixedResults(ytItems, allJioItems);
    if (results.length > 0) {
      mergedRows.push({ id: ytCat.id, title: ytCat.title, results });
    }
  });

  // 3. Process remaining JioSaavn categories (not yet processed)
  jioCategories.forEach((jioCat) => {
    if (processedJioIds.has(jioCat.id)) return;
    processedJioIds.add(jioCat.id);

    const jioItems = jioCat.results.map(toJioSaavnHomeCategoryItem);
    // Mix with general YouTube items as fallback so it's a mixed row!
    const results = createMixedResults(allYoutubeItems, jioItems);
    if (results.length > 0) {
      mergedRows.push({ id: jioCat.id, title: HOME_JIOSAAVN_TITLES[jioCat.id] ?? jioCat.title, results });
    }
  });

  return mergedRows;
}


function getJioSaavnPrefetchCategories(categories: HomeCategoryData[]): HomeJioSaavnCategoryData[] {
  return mapFilter(
    categories,
    (category) => {
      const results = mapFilter(
        category.results,
        (item) => (
          item.source === "jiosaavn"
            ? {
                id: item.id,
                name: item.name,
                image: item.image,
                songCount: item.songCount,
              }
            : null
        ),
        (item): item is HomeJioSaavnCategoryData["results"][number] => Boolean(item)
      );

      return results.length > 0 ? { id: category.id, title: category.title, results } : null;
    },
    (category): category is HomeJioSaavnCategoryData => Boolean(category)
  );
}

function dedupeFirestorePlaylistsById(items: FirestorePlaylist[], limit: number): FirestorePlaylist[] {
  const seen = new Set<string>();
  const unique: FirestorePlaylist[] = [];

  for (const item of items) {
    const id = normalizeId(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

function canonicalPlaylistKey(item: Pick<RecommendationItem, "contentId" | "title" | "source">): string {
  const title = String(item.title || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return title ? `playlist:${title}` : `playlist:${item.source}:${item.contentId}`;
}

function dedupeRecommendationFeed(feed: RecommendationFeed | null): RecommendationFeed | null {
  if (!feed) return null;
  const shown = new Set<string>();
  const sections = feed.sections.flatMap((section) => {
    const items = section.items.filter((item) => {
      if (item.kind !== "playlist") return false;
      const key = canonicalPlaylistKey(item);
      if (shown.has(key)) return false;
      shown.add(key);
      return true;
    });

    return items.length > 0 ? [{ ...section, items }] : [];
  });

  return { ...feed, sections, sectionOrder: sections.map((section) => section.id) };
}

function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function getHomeMixedCategories(options: {
  forceRefresh: boolean;
  limitPerCategory: number;
  realtime: boolean;
  categoryIds?: string[];
  youtubeTimeoutMs?: number;
}): Promise<HomeCategoryData[]> {
  const youtubeLimit = Math.max(3, Math.ceil(options.limitPerCategory / 2));
  const jioPromise = getHomeJioSaavnCategories({
    forceRefresh: options.forceRefresh,
    limitPerCategory: options.limitPerCategory,
    realtime: options.realtime,
    categoryIds: options.categoryIds,
  });
  const youtubePromise = withPromiseTimeout(
    getHomeYouTubeMusicCategories({
      forceRefresh: options.forceRefresh,
      limitPerCategory: youtubeLimit,
    }),
    options.youtubeTimeoutMs ?? 12000,
    "Home YouTube Music categories timeout"
  );

  const [jioResult, youtubeResult] = await Promise.allSettled([jioPromise, youtubePromise]);
  const jioCategories = jioResult.status === "fulfilled" ? jioResult.value : [];
  const youtubeCategories = youtubeResult.status === "fulfilled" ? youtubeResult.value : [];

  if (jioResult.status === "rejected") {
    logger.warn("[Home] JioSaavn category fetch failed:", jioResult.reason);
  }
  if (youtubeResult.status === "rejected") {
    logger.warn("[Home] YouTube Music category fetch failed:", youtubeResult.reason);
  }

  const merged = mergeHomeCategorySources(jioCategories, youtubeCategories, options.limitPerCategory);
  if (merged.length === 0 && jioResult.status === "rejected" && youtubeResult.status === "rejected") {
    throw new Error("Home music categories unavailable");
  }

  return merged;
}

function withCloudinaryHomeVideoTransform(url: string, transform: string, forceJpg = false): string {
  const trimmedUrl = url.trim();
  const uploadIndex = trimmedUrl.indexOf(CLOUDINARY_VIDEO_UPLOAD_PATH);
  if (uploadIndex < 0) return trimmedUrl;

  const prefixEnd = uploadIndex + CLOUDINARY_VIDEO_UPLOAD_PATH.length;
  const prefix = trimmedUrl.slice(0, prefixEnd);
  const suffixWithTail = trimmedUrl.slice(prefixEnd);
  const tailIndex = suffixWithTail.search(/[?#]/);
  const suffix = tailIndex >= 0 ? suffixWithTail.slice(0, tailIndex) : suffixWithTail;
  const tail = tailIndex >= 0 ? suffixWithTail.slice(tailIndex) : "";
  const segments = suffix.split("/").filter(Boolean);
  const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
  const publicSegments = versionIndex >= 0 ? segments.slice(versionIndex) : segments;
  if (publicSegments.length === 0) return trimmedUrl;

  let publicPath = publicSegments.join("/");
  if (forceJpg) {
    publicPath = publicPath.replace(/\.[^/.]+$/, ".jpg");
  }

  return `${prefix}${transform}/${publicPath}${tail}`;
}

function getHomeHeroPlaybackUrl(videoUrl: string): string {
  return withCloudinaryHomeVideoTransform(videoUrl, HOME_HERO_VIDEO_TRANSFORM);
}

function getHomeHeroPosterPreviewUrl(posterUrlValue: string, videoUrl: string): string {
  const posterUrl = posterUrlValue.trim();
  if (posterUrl) return withCloudinaryHomeVideoTransform(posterUrl, HOME_HERO_POSTER_TRANSFORM, true);
  return withCloudinaryHomeVideoTransform(videoUrl, HOME_HERO_POSTER_TRANSFORM, true);
}

function getHomeHeroPlayableSong(item: HomeHeroVideoItem): Song | null {
  const linkedSong = item.song;
  if (!linkedSong?.id || !linkedSong.title || !linkedSong.audioUrl) return null;

  return {
    id: linkedSong.id,
    title: linkedSong.title,
    artist: linkedSong.artist || "Unknown Artist",
    album: linkedSong.album || "",
    duration: linkedSong.duration || 0,
    coverUrl: linkedSong.coverUrl || item.posterUrl,
    genre: linkedSong.genre || "",
    audioUrl: linkedSong.audioUrl,
    source: "local",
  };
}

function ActiveHomeHeroVideo({
  playbackUrl,
  isMuted,
  loop,
  onPlaybackEnd,
}: {
  playbackUrl: string;
  isMuted: boolean;
  loop: boolean;
  onPlaybackEnd: () => void;
}) {
  const hasPlayedToEndRef = useRef(false);
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const player = useVideoPlayer(playbackUrl, (videoPlayer) => {
    videoPlayer.loop = loop;
    videoPlayer.muted = isMuted;
    videoPlayer.volume = isMuted ? 0 : 1;
    videoPlayer.audioMixingMode = "auto";
    videoPlayer.showNowPlayingNotification = false;
    videoPlayer.play();
  });

  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
  }, [onPlaybackEnd]);

  useEffect(() => {
    hasPlayedToEndRef.current = false;
    player.loop = loop;
    player.muted = isMuted;
    player.volume = isMuted ? 0 : 1;
    player.play();
  }, [isMuted, loop, player]);

  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      if (hasPlayedToEndRef.current) return;

      hasPlayedToEndRef.current = true;
      try {
        player.pause();
        player.currentTime = 0;
      } catch {
        // Native player object may have already been deallocated
      }
      onPlaybackEndRef.current();
    });

    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    const activePlayer = player;
    return () => {
      try {
        activePlayer.pause();
        activePlayer.currentTime = 0;
      } catch {
        // Native player object may have already been deallocated
        // This is expected during unmount and can be safely ignored
      }
    };
  }, [player]);

  return (
    <VideoView
      pointerEvents="none"
      player={player}
      style={[styles.liveVideoPlayer, styles.liveVideoMediaFill]}
      nativeControls={false}
      contentFit="cover"
      playsInline
      allowsPictureInPicture={false}
      startsPictureInPictureAutomatically={false}
      fullscreenOptions={{ enable: false }}
      surfaceType="textureView"
      useExoShutter={false}
    />
  );
}

function HomeHeroVideoCard({
  item,
  isActive,
  isMuted,
  width,
  height,
  onPress,
  onToggleMute,
  onPlaybackEnd,
  onAdUnavailable,
  loop,
}: {
  item: HomeHeroVideoItem;
  isActive: boolean;
  isMuted: boolean;
  width: number;
  height: number;
  onPress: (item: HomeHeroVideoItem) => void;
  onToggleMute: () => void;
  onPlaybackEnd: () => void;
  onAdUnavailable: (itemId: string) => void;
  loop: boolean;
}) {
  const [ad, setAd] = useState<GoogleNativeAd | null>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adUnavailable, setAdUnavailable] = useState(false);
  const isNativeAdItem = item.kind === "ad" || Boolean(item.adUnitId?.trim() && !item.videoUrl.trim());
  const adUnitId = item.adUnitId?.trim() || "";

  useEffect(() => {
    if (!isNativeAdItem || !adUnitId) return;

    let active = true;
    let loadedAd: GoogleNativeAd | null = null;
    let shouldDestroyLateAd = false;

    const loadHeroNativeAd = async () => {
      try {
        setAd(null);
        setAdLoaded(false);
        setAdUnavailable(false);

        const adsModule = getGoogleMobileAdsModule();
        if (!adsModule) {
          if (active) {
            setAdUnavailable(true);
          }
          return;
        }

        const { default: mobileAds, NativeAd } = adsModule;

        await withPromiseTimeout(
          mobileAds().initialize(),
          HOME_HERO_AD_INIT_TIMEOUT_MS,
          "Home Hero video ad SDK init timed out"
        );
        if (!active) return;

        const nativeAdRequest = NativeAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: true,
          startVideoMuted: true,
        });

        nativeAdRequest
          .then((lateAd) => {
            if (shouldDestroyLateAd || !active) {
              lateAd.destroy();
            }
          })
          .catch(() => {});

        const nativeAd = await withPromiseTimeout(
          nativeAdRequest,
          HOME_HERO_AD_LOAD_TIMEOUT_MS,
          "Home Hero video ad request timed out"
        );

        if (!active) {
          nativeAd.destroy();
          return;
        }

        loadedAd = nativeAd;
        setAd(nativeAd);
        setAdLoaded(true);
      } catch (err) {
        logger.warn("Home Hero video ad failed to load:", err);
        if (active) {
          shouldDestroyLateAd = true;
          setAdUnavailable(true);
          if (!__DEV__) {
            onAdUnavailable(item.id);
          }
        }
      }
    };

    loadHeroNativeAd();

    return () => {
      active = false;
      if (loadedAd) {
        loadedAd.destroy();
      }
    };
  }, [adUnitId, isNativeAdItem, item.id, onAdUnavailable]);

  const playbackUrl = useMemo(
    () => (isNativeAdItem ? "" : getHomeHeroPlaybackUrl(item.videoUrl)),
    [isNativeAdItem, item.videoUrl]
  );
  const posterPreviewUrl = useMemo(
    () => (isNativeAdItem ? "" : getHomeHeroPosterPreviewUrl(item.posterUrl, item.videoUrl)),
    [isNativeAdItem, item.posterUrl, item.videoUrl]
  );

  const playableSong = getHomeHeroPlayableSong(item);

  if (isNativeAdItem) {
    if (adUnavailable) {
      if (__DEV__) {
        return (
          <View style={[styles.liveVideoSlide, styles.liveVideoAdUnavailableCard, { width, height }]}>
            <View style={styles.liveVideoAdUnavailableBadge}>
              <Text style={styles.liveVideoAdUnavailableBadgeText}>AD</Text>
            </View>
            <Text style={styles.liveVideoAdUnavailableTitle}>Native video ad slot</Text>
            <Text style={styles.liveVideoAdUnavailableText}>
              Ad unit saved. It appears after AdMob returns fill in a dev or release build.
            </Text>
          </View>
        );
      }

      return null;
    }

    const adsModule = ad ? getGoogleMobileAdsModule() : null;
    const NativeAdView = adsModule?.NativeAdView;
    const NativeAsset = adsModule?.NativeAsset;
    const NativeAssetType = adsModule?.NativeAssetType;
    const NativeMediaView = adsModule?.NativeMediaView;

    return (
      <View style={[styles.liveVideoSlide, { width, height, overflow: "hidden", borderRadius: 12 }]}>
        {adLoaded && ad && NativeAdView && NativeAsset && NativeAssetType && NativeMediaView ? (
          <NativeAdView
            nativeAd={ad}
            style={styles.liveVideoAdView}
          >
            <NativeMediaView
              resizeMode="cover"
              style={[StyleSheet.absoluteFillObject, styles.liveVideoMediaFill]}
            />
            
            <View style={styles.adOverlayContainer}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <View style={{
                      borderRadius: 4,
                      backgroundColor: "#26e19a",
                      paddingHorizontal: 5,
                      paddingVertical: 2,
                    }}>
                      <Text style={{
                        color: "#10141a",
                        fontSize: 12,
                        fontFamily: "Inter_700Bold",
                      }}>AD</Text>
                    </View>
                    <NativeAsset assetType={NativeAssetType.HEADLINE}>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFFFFF" }} numberOfLines={1}>
                        {ad.headline}
                      </Text>
                    </NativeAsset>
                  </View>
                  
                  {ad.body && (
                    <NativeAsset assetType={NativeAssetType.BODY}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.6)" }} numberOfLines={1}>
                        {ad.body}
                      </Text>
                    </NativeAsset>
                  )}
                </View>

                {ad.callToAction && (
                  <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                    <View style={{
                      backgroundColor: "#26e19a",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}>
                      <Text style={{
                        color: "#10141a",
                        fontSize: 12,
                        fontFamily: "Inter_700Bold",
                      }}>
                        {ad.callToAction}
                      </Text>
                    </View>
                  </NativeAsset>
                )}
              </View>
            </View>
          </NativeAdView>
        ) : (
          <View style={styles.liveVideoAdLoading}>
            <ActivityIndicator size="small" color="#26e19a" />
            <Text style={styles.liveVideoAdLoadingText}>Loading sponsored card</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playableSong ? `Play ${playableSong.title}` : item.title}
      style={[styles.liveVideoSlide, { width, height }]}
      onPress={() => onPress(item)}
    >
      <Image
        source={{ uri: posterPreviewUrl }}
        style={[styles.liveVideoPoster, styles.liveVideoMediaFill]}
        contentFit="cover"
      />
      {isActive ? (
        <ActiveHomeHeroVideo
          key={playbackUrl}
          playbackUrl={playbackUrl}
          isMuted={isMuted}
          loop={loop}
          onPlaybackEnd={onPlaybackEnd}
        />
      ) : null}
      <View pointerEvents="none" style={styles.liveVideoCardCopy}>
        <View style={styles.liveVideoBadgeRow}>
          <View style={styles.liveVideoLiveBadge}>
            <Text style={styles.liveVideoLiveBadgeText}>LIVE</Text>
          </View>
          {playableSong ? <Ionicons name="musical-note" size={11} color="#F8FBF9" /> : null}
        </View>
        <Text style={styles.liveVideoCardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {playableSong ? (
          <Text style={styles.liveVideoSongTitle} numberOfLines={1}>
            {playableSong.title}
          </Text>
        ) : null}
      </View>
      {isActive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isMuted ? "Unmute video" : "Mute video"}
          style={styles.liveVideoMuteButton}
          onPress={onToggleMute}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isMuted ? "volume-mute-outline" : "volume-high-outline"}
            size={14}
            color="#F8FBF9"
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function HomeBootSurface({ topInset }: { topInset: number }) {
  return (
    <View style={[styles.bootSurface, { paddingTop: topInset }]}>
      <LinearGradient
        colors={["rgba(38,225,154,0.10)", "rgba(16,20,26,0)"]}
        locations={[0, 1]}
        style={styles.bootSurfaceGlow}
      />
    </View>
  );
}

const MoodChipListItem = memo(function MoodChipListItem({
  item,
  selected,
  onPress,
}: {
  item: string;
  selected: boolean;
  onPress: (mood: string) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.moodChip,
        selected ? styles.moodChipSelected : styles.moodChipUnselected,
      ]}
    >
      <Text
        style={[
          styles.moodChipText,
          selected ? styles.moodChipTextSelected : styles.moodChipTextUnselected,
        ]}
      >
        {item}
      </Text>
    </Pressable>
  );
});

function MoodChips({
  selectedMood,
  onMoodPress,
}: {
  selectedMood: string | null;
  onMoodPress: (mood: string) => void;
}) {
  const renderMoodChip = useCallback(
    ({ item }: { item: string }) => (
      <MoodChipListItem
        item={item}
        selected={selectedMood === item}
        onPress={onMoodPress}
      />
    ),
    [onMoodPress, selectedMood]
  );

  return (
    <View style={styles.moodChipsContainer}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={MOOD_CHIPS}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.moodChipsContent}
        renderItem={renderMoodChip}
      />
    </View>
  );
}

export default function HomeScreen() {
  return (
    <ErrorBoundary>
      <HomeScreenInner />
    </ErrorBoundary>
  );
}

function HomeScreenInner() {
  return useHomeScreenInnerView();
}

function useHomeScreenInnerView() {
  useScreenTracking("Home");

  const { isOnline, isChecking } = useNetwork();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { push: routerPush } = useRouter();
  const {
    loading: authLoading,
    isAuthenticated,
    isGuest,
    firebaseUser,
  } = useAuth();
  const { playSong, currentSong, isPlaying } = usePlayerBrowse();
  const currentSongId = currentSong?.id || null;
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const videoSafeTopInset = Platform.OS === "web" ? 0 : insets.top;
  const [homeHeroConfig, setHomeHeroConfig] = useState(DISABLED_HOME_HERO_CONFIG);
  const [unavailableHomeAdItemIds, setUnavailableHomeAdItemIds] = useState<string[]>([]);
  const homeHeroVideos = useMemo(
    () => (
      homeHeroConfig.enabled
        ? homeHeroConfig.items.filter((item) => {
            if (!item.enabled) return false;
            if (item.kind === "ad") {
              return Boolean(item.adUnitId?.trim()) && !unavailableHomeAdItemIds.includes(item.id);
            }
            return Boolean(item.videoUrl.trim());
          })
        : []
    ),
    [homeHeroConfig.enabled, homeHeroConfig.items, unavailableHomeAdItemIds]
  );
  const liveVideoCardWidth = useMemo(() => Math.round(Math.max(280, windowWidth - 28)), [windowWidth]);
  const liveVideoCardHeight = useMemo(() => Math.round(liveVideoCardWidth * 9 / 16), [liveVideoCardWidth]);
  const liveVideoHeight = useMemo(
    () => Math.round(videoSafeTopInset + (homeHeroVideos.length > 0 ? liveVideoCardHeight + 96 : 72)),
    [homeHeroVideos.length, liveVideoCardHeight, videoSafeTopInset]
  );
  const [isLiveVideoMuted, setIsLiveVideoMuted] = useState(true);
  const [activeHomeVideoIndex, setActiveHomeVideoIndex] = useState(0);
  const [isHomeScreenFocused, setIsHomeScreenFocused] = useState(true);
  const [isHomeHeroOnScreen, setIsHomeHeroOnScreen] = useState(true);
  const [isAppStateActive, setIsAppStateActive] = useState(() => AppState.currentState === "active");
  const [shouldRenderInlineAd, setShouldRenderInlineAd] = useState(false);
  const visibleActiveHomeVideoIndex = homeHeroVideos.length === 0
    ? 0
    : Math.min(activeHomeVideoIndex, homeHeroVideos.length - 1);
  const homeVideoListRef = useRef<FlatList<HomeHeroVideoItem> | null>(null);
  const homeHeroVideoCountRef = useRef(homeHeroVideos.length);
  const latestHomeScrollYRef = useRef(0);
  const inlineAdUnlockedRef = useRef(false);
  const liveVideoVerticalVisibilityCutoff = useMemo(
    () => Math.max(24, liveVideoHeight - 96),
    [liveVideoHeight]
  );
  const isHomeHeroPlaybackAllowed =
    isAppStateActive && isHomeScreenFocused && isHomeHeroOnScreen && homeHeroVideos.length > 0;

  useEffect(
    () => subscribeHomeHeroConfig((nextConfig) => {
      setHomeHeroConfig(nextConfig);
      setUnavailableHomeAdItemIds([]);
    }),
    []
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      setIsAppStateActive(nextState === "active");
    });

    return () => subscription.remove();
  }, []);

  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    // Initial load
    void loadNotifications().then(() => {
      setUnreadNotifCount(getUnreadNotificationsCount());
    });

    // Subscribe to store updates
    const unsubscribe = subscribeNotifications(() => {
      setUnreadNotifCount(getUnreadNotificationsCount());
    });
    return () => unsubscribe();
  }, []);

  const bellRotation = useSharedValue(0);

  const triggerBellShake = useCallback(() => {
    bellRotation.value = withSequence(
      withTiming(-22, { duration: 90 }),
      withTiming(18, { duration: 110 }),
      withTiming(-14, { duration: 110 }),
      withTiming(10, { duration: 110 }),
      withTiming(-6, { duration: 110 }),
      withTiming(3, { duration: 110 }),
      withTiming(-1, { duration: 110 }),
      withTiming(0, { duration: 110 })
    );
  }, [bellRotation]);

  const prevNotifCountRef = useRef(0);

  useEffect(() => {
    if (unreadNotifCount > prevNotifCountRef.current) {
      triggerBellShake();
    }
    prevNotifCountRef.current = unreadNotifCount;
  }, [unreadNotifCount, triggerBellShake]);

  const animatedBellStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: -10 },
        { rotate: `${bellRotation.value}deg` },
        { translateY: 10 },
      ],
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsHomeScreenFocused(true);

      return () => {
        setIsHomeScreenFocused(false);
      };
    }, [])
  );

  homeHeroVideoCountRef.current = homeHeroVideos.length;

  const homeVideoViewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 70,
    minimumViewTime: 80,
  });
  const handleHomeVideoViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let nextVisibleIndex: number | null = null;

      for (const viewableItem of viewableItems) {
        if (!viewableItem.isViewable || typeof viewableItem.index !== "number") continue;
        nextVisibleIndex =
          nextVisibleIndex === null ? viewableItem.index : Math.min(nextVisibleIndex, viewableItem.index);
      }

      if (nextVisibleIndex === null) return;

      const maxIndex = homeHeroVideoCountRef.current - 1;
      if (maxIndex < 0) return;

      const nextIndex = Math.max(0, Math.min(maxIndex, nextVisibleIndex));
      setActiveHomeVideoIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
    }
  );

  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const handleMoodPress = useCallback((mood: string) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMood((current) => (current === mood ? null : mood));
  }, []);

  // Auto-mute video card when a song is playing
  useEffect(() => {
    if (isPlaying) {
      setIsLiveVideoMuted(true);
    }
  }, [isPlaying]);

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedItem[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.recentlyPlayed : []
  );
  const [categories, setCategories] = useState<HomeCategoryData[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.categories : []
  );
  const [publicPlaylists, setPublicPlaylists] = useState<FirestorePlaylist[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.publicPlaylists : []
  );
  const [featuredArtists, setFeaturedArtists] = useState<ArtistCard[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.featuredArtists : []
  );
  const [newReleaseSongs, setNewReleaseSongs] = useState<Song[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.newReleaseSongs : []
  );
  const [youtubeTrendingPlaylists, setYoutubeTrendingPlaylists] = useState<YouTubeMusicPlaylistCard[]>(
    HOME_SESSION_CACHE.hydrated ? HOME_SESSION_CACHE.youtubeTrending : []
  );
  const [isLoadingYoutubeTrending, setIsLoadingYoutubeTrending] = useState(
    !HOME_SESSION_CACHE.hydrated && HOME_SESSION_CACHE.youtubeTrending.length === 0
  );
  const [loading, setLoading] = useState(!HOME_SESSION_CACHE.hydrated);
  const [homeFeedState, setHomeFeedState] = useState<HomeFeedState>(
    hasHomeContent(HOME_SESSION_CACHE) ? "ready" : "empty"
  );
  const [refreshing, setRefreshing] = useState(false);
  const {
    isHeaderElevated: isHomeHeaderElevated,
    handleHeaderScroll: handleHomeScroll,
  } = useAppTopHeaderScrollElevation();
  const handleHomeScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const yOffset = event.nativeEvent.contentOffset.y;
      latestHomeScrollYRef.current = yOffset;
      handleHomeScroll(event);

      if (!inlineAdUnlockedRef.current && yOffset > INLINE_AD_SCROLL_GATE_Y) {
        inlineAdUnlockedRef.current = true;
        setShouldRenderInlineAd(true);
      }

      const shouldKeepHeroPlaying = homeHeroVideos.length > 0 && yOffset < liveVideoVerticalVisibilityCutoff;
      setIsHomeHeroOnScreen((current) => (
        current === shouldKeepHeroPlaying ? current : shouldKeepHeroPlaying
      ));
    },
    [handleHomeScroll, homeHeroVideos.length, liveVideoVerticalVisibilityCutoff]
  );
  const [isLoadingCategories, setIsLoadingCategories] = useState(
    !HOME_SESSION_CACHE.hydrated && HOME_SESSION_CACHE.categories.length === 0
  );
  const [isLoadingPublicPlaylists, setIsLoadingPublicPlaylists] = useState(
    !HOME_SESSION_CACHE.hydrated && HOME_SESSION_CACHE.publicPlaylists.length === 0
  );
  const [isLoadingNewReleaseSongs, setIsLoadingNewReleaseSongs] = useState(
    !HOME_SESSION_CACHE.hydrated && HOME_SESSION_CACHE.newReleaseSongs.length === 0
  );
  const [recommendationFeed, setRecommendationFeed] = useState<RecommendationFeed | null>(null);
  const [isRecommendationFeedLoading, setIsRecommendationFeedLoading] = useState(false);
  const [hasRecommendationFeedFailed, setHasRecommendationFeedFailed] = useState(false);
  const latestLoadIdRef = useRef(0);
  const latestRecommendationLoadIdRef = useRef(0);
  const quickPickRotationSeedRef = useRef<number | null>(null);
  if (quickPickRotationSeedRef.current === null) {
    quickPickRotationSeedRef.current = getQuickPickRotationSeed();
  }
  const hasHydratedRef = useRef(HOME_SESSION_CACHE.hydrated);
  const prefetchStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPlaylistPrefetchRef = useRef<(() => void) | null>(null);

  const invalidateLatestLoad = useCallback(() => {
    latestLoadIdRef.current += 1;
  }, []);

  const cancelScheduledPlaylistPrefetch = useCallback(() => {
    if (prefetchStartTimerRef.current) {
      clearTimeout(prefetchStartTimerRef.current);
      prefetchStartTimerRef.current = null;
    }
    cancelPlaylistPrefetchRef.current?.();
    cancelPlaylistPrefetchRef.current = null;
  }, []);

  const shouldUseRecommendationFeed =
    !authLoading &&
    isAuthenticated &&
    !isGuest &&
    Boolean(firebaseUser) &&
    recommendationFeedEnabled();

  const loadRecommendationFeed = useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (!shouldUseRecommendationFeed) {
      latestRecommendationLoadIdRef.current += 1;
      setRecommendationFeed(null);
      setHasRecommendationFeedFailed(false);
      setIsRecommendationFeedLoading(false);
      return;
    }

    const recommendationLoadId = ++latestRecommendationLoadIdRef.current;
    setIsRecommendationFeedLoading(true);
    setHasRecommendationFeedFailed(false);
    try {
      if (recommendationLoadId !== latestRecommendationLoadIdRef.current) return;
      const feed = await withPromiseTimeout(
        getRecommendationHomeFeed({ ...options, authUser: firebaseUser }),
        8000,
        "Recommendation feed timeout"
      );
      const isLatestRecommendationLoad = recommendationLoadId === latestRecommendationLoadIdRef.current;
      if (!isLatestRecommendationLoad) return;
      setRecommendationFeed(dedupeRecommendationFeed(feed));
    } catch {
      if (recommendationLoadId !== latestRecommendationLoadIdRef.current) return;
      setRecommendationFeed(null);
      setHasRecommendationFeedFailed(true);
    } finally {
      if (recommendationLoadId === latestRecommendationLoadIdRef.current) {
        setIsRecommendationFeedLoading(false);
      }
    }
  }, [firebaseUser, shouldUseRecommendationFeed]);

  useEffect(() => {
    void loadRecommendationFeed();
  }, [loadRecommendationFeed]);

  const schedulePlaylistPrefetch = useCallback((categoryData: HomeCategoryData[], delayMs: number) => {
    cancelScheduledPlaylistPrefetch();

    prefetchStartTimerRef.current = setTimeout(() => {
      prefetchStartTimerRef.current = null;
      cancelPlaylistPrefetchRef.current = prefetchVisiblePlaylists(
        getJioSaavnPrefetchCategories(categoryData),
        3
      );
    }, delayMs);
  }, [cancelScheduledPlaylistPrefetch]);

  const loadHomeData = useCallback(
    async (options?: {
      forceRefresh?: boolean;
      showLoader?: boolean;
      refreshPublicPlaylists?: boolean;
      realtimeRefresh?: boolean;
      limitPerCategory?: number;
      publicLimit?: number;
    }) => {
      const forceRefresh = options?.forceRefresh ?? false;
      const showLoader = options?.showLoader ?? true;
      const refreshPublicPlaylists = options?.refreshPublicPlaylists ?? true;
      const realtimeRefresh = options?.realtimeRefresh ?? false;
      const limitPerCategory = options?.limitPerCategory ?? INITIAL_CATEGORY_LIMIT;
      const publicLimit = options?.publicLimit ?? INITIAL_PUBLIC_LIMIT;

      const loadId = ++latestLoadIdRef.current;
      const shouldShowLoader = showLoader && !hasHydratedRef.current;

      if (shouldShowLoader) {
        setLoading(true);
      }
      if (HOME_SESSION_CACHE.categories.length === 0) {
        setIsLoadingCategories(true);
      }
      if (refreshPublicPlaylists && HOME_SESSION_CACHE.publicPlaylists.length === 0) {
        setIsLoadingPublicPlaylists(true);
      }
      if (HOME_SESSION_CACHE.newReleaseSongs.length === 0) {
        setIsLoadingNewReleaseSongs(true);
      }

      try {
        const markReadyIfContentVisible = () => {
          if (loadId !== latestLoadIdRef.current) return;
          if (hasVisibleHomeSections(HOME_SESSION_CACHE)) {
            hasHydratedRef.current = true;
            HOME_SESSION_CACHE.hydrated = true;
            setHomeFeedState("ready");
            setLoading(false);
          }
        };

        const publicPlaylistsPromise = refreshPublicPlaylists
          ? withPromiseTimeout(
              getPublicPlaylists(publicLimit),
              PUBLIC_PLAYLIST_FETCH_TIMEOUT_MS,
              "Home public playlists timeout"
            )
          : Promise.resolve<FirestorePlaylist[]>(HOME_SESSION_CACHE.publicPlaylists.slice(0, publicLimit));

        // Load artists in parallel — no separate timeout, it's fast from cache
        const artistsPromise = getFeaturedArtists().catch(() => [] as ArtistCard[]);
        const newReleaseSongsPromise = withPromiseTimeout(
          getDailyNewReleaseSongs({
            forceRefresh,
            limit: NEW_RELEASE_SONG_LIMIT,
          }),
          HOME_NEW_RELEASE_SONG_TIMEOUT_MS,
          "Home new release songs timeout"
        );

        const youtubeTrendingPromise = withPromiseTimeout(
          getYouTubeMusicTrendingPlaylists("IN"),
          6000,
          "YouTube trending timeout"
        ).catch((err) => {
          logger.warn("[Home] YouTube trending fetch failed or timed out:", err);
          return [] as YouTubeMusicPlaylistCard[];
        });

        const youtubeTrendingResultPromise = youtubeTrendingPromise
          .then((playlists) => {
            if (loadId !== latestLoadIdRef.current) {
              return { status: "fulfilled" as const, value: playlists };
            }
            const hasPreviousPlaylists = HOME_SESSION_CACHE.youtubeTrending.length > 0;
            const shouldReplacePlaylists = playlists.length > 0 || !hasPreviousPlaylists;
            if (shouldReplacePlaylists) {
              setYoutubeTrendingPlaylists(playlists);
              HOME_SESSION_CACHE.youtubeTrending = playlists;
            }
            setIsLoadingYoutubeTrending(false);
            if (playlists.length > 0) {
              markReadyIfContentVisible();
            }
            return { status: "fulfilled" as const, value: playlists };
          })
          .catch((reason) => ({ status: "rejected" as const, reason }));

        const publicPlaylistsResultPromise = publicPlaylistsPromise
          .then((nextPublicPlaylists) => {
            if (loadId !== latestLoadIdRef.current) {
              return { status: "fulfilled" as const, value: nextPublicPlaylists };
            }

            if (refreshPublicPlaylists) {
              const hasPreviousPublicPlaylists = HOME_SESSION_CACHE.publicPlaylists.length > 0;
              const shouldReplacePublicPlaylists =
                nextPublicPlaylists.length > 0 || !hasPreviousPublicPlaylists;

              if (shouldReplacePublicPlaylists) {
                setPublicPlaylists(nextPublicPlaylists);
                HOME_SESSION_CACHE.publicPlaylists = nextPublicPlaylists;
              }

              if (nextPublicPlaylists.length > 0) {
                void setCachedHomePublicPlaylists(nextPublicPlaylists);
              }
            }

            if (nextPublicPlaylists.length > 0) {
              markReadyIfContentVisible();
            }

            return { status: "fulfilled" as const, value: nextPublicPlaylists };
          })
          .catch((reason) => ({ status: "rejected" as const, reason }));

        const newReleaseSongsResultPromise = newReleaseSongsPromise
          .then((songs) => {
            if (loadId !== latestLoadIdRef.current) {
              return { status: "fulfilled" as const, value: songs };
            }

            const hasPreviousSongs = HOME_SESSION_CACHE.newReleaseSongs.length > 0;
            const shouldReplaceSongs = songs.length > 0 || !hasPreviousSongs;
            if (shouldReplaceSongs) {
              setNewReleaseSongs(songs);
              HOME_SESSION_CACHE.newReleaseSongs = songs;
            }

            if (songs.length > 0) {
              markReadyIfContentVisible();
            }

            return { status: "fulfilled" as const, value: songs };
          })
          .catch((reason) => ({ status: "rejected" as const, reason }));

        const applyCategorySnapshot = (categoryData: HomeCategoryData[]) => {
          const validCategories = categoryData.filter((cat) => cat.results.length > 0);
          const hasPreviousCategories = HOME_SESSION_CACHE.categories.length > 0;
          const shouldReplaceCategories = validCategories.length > 0 || !hasPreviousCategories;

          if (shouldReplaceCategories) {
            setCategories(validCategories);
            HOME_SESSION_CACHE.categories = validCategories;
            if (validCategories.length > 0) {
              schedulePlaylistPrefetch(validCategories, 1200);
            }
          }

          if (validCategories.length > 0) {
            markReadyIfContentVisible();
          }
        };

        const categoryResultPromise = (async () => {
          let partialCategories: HomeCategoryData[] = [];
          let hasPartialCategories = false;

          try {
            const priorityCategoryData = await withPromiseTimeout(
              getHomeMixedCategories({
                forceRefresh,
                limitPerCategory: Math.min(limitPerCategory, 8),
                realtime: realtimeRefresh,
                categoryIds: [...HOME_DEFAULT_BROWSE_CATEGORY_IDS],
                youtubeTimeoutMs: 4800,
              }),
              HOME_PRIORITY_CATEGORY_TIMEOUT_MS,
              "Home priority categories timeout"
            );

            if (loadId === latestLoadIdRef.current) {
              applyCategorySnapshot(priorityCategoryData);
            }

            partialCategories = priorityCategoryData;
            hasPartialCategories = priorityCategoryData.some((cat) => cat.results.length > 0);
          } catch {
            // Continue to full fetch fallback below.
          }

          try {
            const fullCategoryData = await withPromiseTimeout(
              getHomeMixedCategories({
                forceRefresh,
                limitPerCategory,
                realtime: realtimeRefresh,
                categoryIds: [...HOME_BROWSE_CATEGORY_FETCH_IDS],
                youtubeTimeoutMs: 8000,
              }),
              HOME_CATEGORY_FETCH_TIMEOUT_MS,
              "Home categories timeout"
            );

            if (loadId === latestLoadIdRef.current) {
              applyCategorySnapshot(fullCategoryData);
            }

            return { status: "fulfilled" as const, value: fullCategoryData };
          } catch (reason) {
            if (hasPartialCategories) {
              return { status: "fulfilled" as const, value: partialCategories };
            }

            return { status: "rejected" as const, reason };
          }
        })();

        const artistsResultPromise = artistsPromise
          .then((artists) => {
            if (loadId !== latestLoadIdRef.current) {
              return { status: "fulfilled" as const, value: artists };
            }

            if (artists.length > 0) {
              setFeaturedArtists(artists);
              HOME_SESSION_CACHE.featuredArtists = artists;
              artists.slice(0, 4).forEach((a) => prefetchArtist(a.id));
              markReadyIfContentVisible();
            }

            return { status: "fulfilled" as const, value: artists };
          })
          .catch((reason) => ({ status: "rejected" as const, reason }));

        const [publicPlaylistsResult, categoryResult, newReleaseSongsResult] = await Promise.all([
          publicPlaylistsResultPromise,
          categoryResultPromise,
          newReleaseSongsResultPromise,
          youtubeTrendingResultPromise,
        ]);

        if (loadId === latestLoadIdRef.current) {
          await artistsResultPromise;

          if (hasVisibleHomeSections(HOME_SESSION_CACHE) || youtubeTrendingPlaylists.length > 0) {
            hasHydratedRef.current = true;
            HOME_SESSION_CACHE.hydrated = true;
          }

          const nextFeedState = hasHomeContent(HOME_SESSION_CACHE) || youtubeTrendingPlaylists.length > 0
            ? "ready"
            : publicPlaylistsResult.status === "rejected" ||
                categoryResult.status === "rejected" ||
                newReleaseSongsResult.status === "rejected"
              ? "network"
              : "empty";
          setHomeFeedState(nextFeedState);

          // Mark bootstrapped even on empty/offline response to avoid repeated heavy reloads.
          if (!HOME_SESSION_CACHE.hydrated) {
            HOME_SESSION_CACHE.hydrated = true;
            hasHydratedRef.current = true;
          }
        }
      } finally {
        // Always clear loading — whether we set it or it was already true from bootstrap
        if (loadId === latestLoadIdRef.current) {
          setLoading(false);
          setIsLoadingCategories(false);
          setIsLoadingNewReleaseSongs(false);
          setIsLoadingYoutubeTrending(false);
          if (refreshPublicPlaylists) {
            setIsLoadingPublicPlaylists(false);
          }
        }
      }
    },
    [schedulePlaylistPrefetch, youtubeTrendingPlaylists.length]
  );

  const resetHomeState = useCallback((options?: { clearUi?: boolean }) => {
    const clearUi = options?.clearUi ?? false;
    invalidateLatestLoad();
    hasHydratedRef.current = false;
    HOME_SESSION_CACHE.hydrated = false;
    HOME_SESSION_CACHE.categories = [];
    HOME_SESSION_CACHE.publicPlaylists = [];
    HOME_SESSION_CACHE.recentlyPlayed = [];
    HOME_SESSION_CACHE.newReleaseSongs = [];
    HOME_SESSION_CACHE.youtubeTrending = [];

    if (clearUi) {
      setCategories([]);
      setPublicPlaylists([]);
      setRecentlyPlayed([]);
      setNewReleaseSongs([]);
      setYoutubeTrendingPlaylists([]);
      setLoading(true);
      setIsLoadingCategories(true);
      setIsLoadingPublicPlaylists(true);
      setIsLoadingNewReleaseSongs(true);
      setIsLoadingYoutubeTrending(true);
    }

    setHomeFeedState("empty");
  }, [invalidateLatestLoad]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      resetHomeState();
      await Promise.all([
        clearJioSaavnPlaylistCache().catch(() => {}),
        clearYouTubeMusicCache().catch(() => {}),
      ]);
      const recommendationPromise = shouldUseRecommendationFeed
        ? loadRecommendationFeed({ forceRefresh: true })
        : Promise.resolve();
      if (shouldUseRecommendationFeed) {
        setHasRecommendationFeedFailed(false);
      }
      try {
        const recent = await getRecentlyPlayed();
        const trimmedRecent = recent.slice(0, 8);
        setRecentlyPlayed(trimmedRecent);
        HOME_SESSION_CACHE.recentlyPlayed = trimmedRecent;
      } catch {
        setRecentlyPlayed([]);
        HOME_SESSION_CACHE.recentlyPlayed = [];
      }
      await loadHomeData({
        forceRefresh: true,
        showLoader: false,
        refreshPublicPlaylists: true,
        realtimeRefresh: false,
        limitPerCategory: REFRESH_CATEGORY_LIMIT,
        publicLimit: INITIAL_PUBLIC_LIMIT,
      });
      await recommendationPromise;
    } finally {
      setRefreshing(false);
    }
  }, [loadHomeData, loadRecommendationFeed, resetHomeState, shouldUseRecommendationFeed]);

  const applyHomeCacheSnapshot = useCallback(() => {
    setRecentlyPlayed(HOME_SESSION_CACHE.recentlyPlayed);
    setCategories(HOME_SESSION_CACHE.categories);
    setPublicPlaylists(HOME_SESSION_CACHE.publicPlaylists);
    setFeaturedArtists(HOME_SESSION_CACHE.featuredArtists);
    setNewReleaseSongs(HOME_SESSION_CACHE.newReleaseSongs);
    setYoutubeTrendingPlaylists(HOME_SESSION_CACHE.youtubeTrending);
    setIsLoadingCategories(HOME_SESSION_CACHE.categories.length === 0);
    setIsLoadingPublicPlaylists(HOME_SESSION_CACHE.publicPlaylists.length === 0);
    setIsLoadingNewReleaseSongs(HOME_SESSION_CACHE.newReleaseSongs.length === 0);
    setIsLoadingYoutubeTrending(HOME_SESSION_CACHE.youtubeTrending.length === 0);
    setHomeFeedState(hasHomeContent(HOME_SESSION_CACHE) ? "ready" : "empty");
    const hasVisibleFeed =
      hasHomeContent(HOME_SESSION_CACHE) || HOME_SESSION_CACHE.featuredArtists.length > 0;
    setLoading(!hasVisibleFeed);
    if (HOME_SESSION_CACHE.categories.length > 0) {
      schedulePlaylistPrefetch(HOME_SESSION_CACHE.categories, 800);
    }
    return HOME_SESSION_CACHE.categories.length > 0 &&
      HOME_SESSION_CACHE.featuredArtists.length > 0;
  }, [schedulePlaylistPrefetch]);

  const applyWarmBootstrapResults = useCallback((
    recentResult: PromiseSettledResult<RecentlyPlayedItem[]>,
    cachedPublicResult: PromiseSettledResult<FirestorePlaylist[]>
  ) => {
    let hasWarmContent = false;
    if (recentResult.status === "fulfilled") {
      const trimmedRecent = recentResult.value.slice(0, 8);
      setRecentlyPlayed(trimmedRecent);
      HOME_SESSION_CACHE.recentlyPlayed = trimmedRecent;
      hasWarmContent = hasWarmContent || trimmedRecent.length > 0;
    } else {
      setRecentlyPlayed([]);
      HOME_SESSION_CACHE.recentlyPlayed = [];
    }

    if (cachedPublicResult.status === "fulfilled") {
      const cachedPublic = cachedPublicResult.value.slice(0, INITIAL_PUBLIC_LIMIT);
      if (cachedPublic.length > 0) {
        setPublicPlaylists(cachedPublic);
        HOME_SESSION_CACHE.publicPlaylists = cachedPublic;
        setIsLoadingPublicPlaylists(false);
        hasWarmContent = true;
      }
    }
    return hasWarmContent;
  }, []);

  const revealWarmHomeContent = useCallback(() => {
    hasHydratedRef.current = true;
    HOME_SESSION_CACHE.hydrated = true;
    setLoading(false);
    setHomeFeedState("ready");
  }, []);

  const applyHomeBootstrapFailure = useCallback((hasWarmContent: boolean) => {
    setLoading(false);
    setHomeFeedState(hasWarmContent ? "ready" : "network");
    hasHydratedRef.current = true;
    HOME_SESSION_CACHE.hydrated = true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (HOME_SESSION_CACHE.hydrated) {
        const hasFullFeed = applyHomeCacheSnapshot();
        if (hasFullFeed) return;
        // Fall through to load missing data
      }

      const [recentResult, cachedPublicResult] = await Promise.allSettled([
        getRecentlyPlayed(),
        getCachedHomePublicPlaylists({ allowStale: true }),
      ]);

      let hasWarmContent = false;

      if (!cancelled) {
        hasWarmContent = applyWarmBootstrapResults(recentResult, cachedPublicResult);

        if (hasWarmContent) {
          // Show warm content immediately while live categories refresh in background.
          revealWarmHomeContent();
        }
      }

      if (cancelled) return;

      try {
        await withPromiseTimeout(
          loadHomeData({
            forceRefresh: false,
            showLoader: !hasWarmContent,
            refreshPublicPlaylists: true,
            realtimeRefresh: false,
            limitPerCategory: INITIAL_CATEGORY_LIMIT,
            publicLimit: INITIAL_PUBLIC_LIMIT,
          }),
          HOME_BOOTSTRAP_MAX_WAIT_MS,
          "Home bootstrap timeout"
        );
      } catch {
        if (!cancelled) {
          applyHomeBootstrapFailure(hasWarmContent);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      invalidateLatestLoad();
    };
  }, [
    applyHomeBootstrapFailure,
    applyHomeCacheSnapshot,
    applyWarmBootstrapResults,
    invalidateLatestLoad,
    loadHomeData,
    revealWarmHomeContent,
  ]);

  useEffect(() => {
    return cancelScheduledPlaylistPrefetch;
  }, [cancelScheduledPlaylistPrefetch]);

  const filteredCategories = useMemo(() => {
    if (!selectedMood) return categories;
    const moodLower = selectedMood.toLowerCase();

    let targetCategoryIds: string[] = [];
    if (moodLower === "romance") {
      targetCategoryIds = ["romance"];
    } else if (moodLower === "energize" || moodLower === "workout") {
      targetCategoryIds = ["workout", "party-mix"];
    } else if (moodLower === "feel good") {
      targetCategoryIds = ["chill-vibes", "party-mix"];
    } else if (moodLower === "podcasts") {
      targetCategoryIds = ["retro", "trending"];
    } else if (moodLower === "relax") {
      targetCategoryIds = ["chill-vibes", "retro"];
    }

    if (targetCategoryIds.length === 0) return categories;
    return categories.filter((cat) => targetCategoryIds.includes(cat.id));
  }, [categories, selectedMood]);

  const orderedHomeCategories = useMemo<HomeCategoryData[]>(() => {
    return filteredCategories.map((c) => ({
      ...c,
      title: HOME_JIOSAAVN_TITLES[c.id] ?? c.title,
    }));
  }, [filteredCategories]);

  const allCategoryRows = useMemo(() => {
    return mapFilter(orderedHomeCategories, (cat) => ({
        ...cat,
        results: dedupeHomeCategoryItemsBySource(cat.results, MAX_ROW_ITEMS),
      }), (cat) => cat.results.length > 0);
  }, [orderedHomeCategories]);

  const visibleBrowseCategoryRows = useMemo(() => {
    if (selectedMood) {
      return allCategoryRows.slice(0, HOME_MAX_MOOD_BROWSE_SECTIONS);
    }
    return allCategoryRows;
  }, [allCategoryRows, selectedMood]);

  const publicPlaylistsForSection = useMemo(
    () => dedupeFirestorePlaylistsById(publicPlaylists, HOME_MAX_PUBLIC_PLAYLISTS),
    [publicPlaylists]
  );

  const recommendationSections = useMemo(
    () => recommendationFeed?.sections.filter((section) => section.items.length > 0).slice(0, HOME_MAX_RECOMMENDATION_SECTIONS) ?? [],
    [recommendationFeed]
  );

  const youtubeDiscoveryPlaylists = useMemo(
    () => youtubeTrendingPlaylists.slice(0, HOME_MAX_YOUTUBE_DISCOVERY_PLAYLISTS),
    [youtubeTrendingPlaylists]
  );

  const sections = useMemo<HomeSection[]>(() => {
    const data: HomeSection[] = [];
    const appendCategorySections = () => {
      visibleBrowseCategoryRows.forEach((category) => {
        data.push({ id: `category-${category.id}`, type: "category", data: category });
      });

      if (visibleBrowseCategoryRows.length === 0 && isLoadingCategories) {
        HOME_DEFAULT_BROWSE_CATEGORY_IDS.slice(0, 2).forEach((priorityId) => {
          data.push({
            id: `category-loading-${priorityId}`,
            type: "category",
            data: {
              id: priorityId,
              title: HOME_JIOSAAVN_TITLES[priorityId] ?? priorityId,
              results: [],
            },
          });
        });
      }
    };

    if (shouldUseRecommendationFeed && recommendationSections.length > 0) {
      if (recentlyPlayed.length > 0) {
        data.push({ id: "recents", type: "recents" });
      }
      if (newReleaseSongs.length > 0 || isLoadingNewReleaseSongs) {
        data.push({ id: "new-release-songs", type: "new-release-songs" });
      }
      if (youtubeDiscoveryPlaylists.length > 0 || isLoadingYoutubeTrending) {
        data.push({ id: "youtube-trending", type: "youtube-trending" });
      }
      recommendationSections.forEach((section) => {
        data.push({ id: `recommendation-${section.id}`, type: "recommendation", data: section });
      });
      appendCategorySections();
      if (publicPlaylistsForSection.length >= MIN_PUBLIC_PLAYLIST_ITEMS || isLoadingPublicPlaylists) {
        data.push({ id: "public-playlists", type: "public-playlists" });
      }
      if (featuredArtists.length > 0 && !selectedMood) {
        data.push({ id: "featured-artists", type: "featured-artists" });
      }
      return data;
    }

    const hasFallbackContent =
      featuredArtists.length > 0 ||
      recentlyPlayed.length > 0 ||
      youtubeDiscoveryPlaylists.length > 0 ||
      visibleBrowseCategoryRows.length > 0 ||
      publicPlaylistsForSection.length >= MIN_PUBLIC_PLAYLIST_ITEMS;

    if (shouldUseRecommendationFeed && isRecommendationFeedLoading && !hasRecommendationFeedFailed && !hasFallbackContent) {
      return data;
    }

    // 1. Resume first: this is the fastest path back into listening.
    if (recentlyPlayed.length > 0) {
      data.push({ id: "recents", type: "recents" });
    }

    // 2. Fresh songs and quick taps.
    if (newReleaseSongs.length > 0 || isLoadingNewReleaseSongs) {
      data.push({ id: "new-release-songs", type: "new-release-songs" });
    }

    // 3. Video-backed discovery is separate from the main app catalog.
    if (youtubeDiscoveryPlaylists.length > 0 || isLoadingYoutubeTrending) {
      data.push({ id: "youtube-trending", type: "youtube-trending" });
    }

    // 4. Browse: a small curated set, filtered by mood when selected.
    appendCategorySections();

    // 5. Made for You and people discovery sit lower to keep the first screen calm.
    if (publicPlaylistsForSection.length >= MIN_PUBLIC_PLAYLIST_ITEMS || isLoadingPublicPlaylists) {
      data.push({ id: "public-playlists", type: "public-playlists" });
    }
    if (featuredArtists.length > 0 && !selectedMood) {
      data.push({ id: "featured-artists", type: "featured-artists" });
    }

    return data;
  }, [
    recentlyPlayed,
    publicPlaylistsForSection,
    featuredArtists,
    visibleBrowseCategoryRows,
    newReleaseSongs.length,
    isLoadingNewReleaseSongs,
    youtubeDiscoveryPlaylists.length,
    isLoadingYoutubeTrending,
    isLoadingCategories,
    isLoadingPublicPlaylists,
    recommendationSections,
    shouldUseRecommendationFeed,
    isRecommendationFeedLoading,
    hasRecommendationFeedFailed,
    selectedMood,
  ]);

  const openJioSaavnPlaylist = useCallback(
    (playlist: { id: string; name?: string; imageUrl?: string; songCount?: number; url?: string }) => {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: playlist.id,
          jiosaavn: "true",
          firestore: "false",
          link: playlist.url || "",
          title: playlist.name || "",
          cover: playlist.imageUrl || "",
          songCount: playlist.songCount ? String(playlist.songCount) : "",
        },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [routerPush]
  );

  const openFirestorePlaylist = useCallback(
    (playlist: { id: string; name?: string; imageUrl?: string; description?: string; songCount?: number }) => {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: playlist.id,
          firestore: "true",
          jiosaavn: "false",
          title: playlist.name || "",
          description: playlist.description || "",
          cover: playlist.imageUrl || "",
          songCount: playlist.songCount ? String(playlist.songCount) : "",
        },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [routerPush]
  );

  const openYouTubeMusicPlaylist = useCallback(
    (playlist: { id: string; name?: string; imageUrl?: string; songCount?: number }) => {
      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: playlist.id,
          youtube: "true",
          jiosaavn: "false",
          firestore: "false",
          title: playlist.name || "",
          cover: playlist.imageUrl || "",
          songCount: playlist.songCount ? String(playlist.songCount) : "",
        },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [routerPush]
  );

  const openRecommendationPlaylist = useCallback(
    (item: RecommendationItem) => {
      const isJioSaavn =
        item.source === "jiosaavn" ||
        item.source === "trending" ||
        item.source === "fresh" ||
        item.source === "regional" ||
        item.playlist?.type === "jiosaavn-playlist";

      if (isJioSaavn) {
        openJioSaavnPlaylist({
          id: item.contentId,
          name: item.title,
          imageUrl: item.imageUrl,
          songCount: Number(item.playlist?.songCount || 0),
          url: String(item.playlist?.url || item.playlist?.link || ""),
        });
        return;
      }

      openFirestorePlaylist({
        id: item.contentId,
        name: item.title,
        imageUrl: item.imageUrl,
        description: item.subtitle,
        songCount: Number(item.playlist?.songCount || 0),
      });
    },
    [openFirestorePlaylist, openJioSaavnPlaylist]
  );

  const newReleaseSongQueue = useMemo(
    () => newReleaseSongs.filter((song) => song.audioUrl.trim().length > 0),
    [newReleaseSongs]
  );

  const handleNewReleaseSongPress = useCallback(
    (song: Song) => {
      const queue = newReleaseSongQueue.length > 0 ? newReleaseSongQueue : [song];
      playSong(song, queue);
      routerPush("/player");
    },
    [newReleaseSongQueue, playSong, routerPush]
  );


  const handleRecentPress = useCallback(
    (item: RecentlyPlayedItem) => {
      const itemId = item?.id?.trim();
      if (!itemId) {
        return;
      }

      if (item.type === "song") {
        const sourceSong = item.data as Partial<Song> | undefined;
        if (sourceSong && typeof sourceSong.id === "string") {
          const resolvedAudioUrl = getRecentSongAudioUrl(sourceSong);

          const hydratedSong: Song = {
            ...sourceSong,
            id: sourceSong.id,
            title: sourceSong.title || item.name || "Unknown Song",
            artist: sourceSong.artist || "Unknown Artist",
            album: sourceSong.album || "",
            duration: Number(sourceSong.duration) || 0,
            coverUrl: sourceSong.coverUrl || item.imageUrl || "",
            genre: sourceSong.genre || "",
            audioUrl: resolvedAudioUrl,
            year: sourceSong.year,
            language: sourceSong.language,
            source: sourceSong.source,
          };
          if (hydratedSong.audioUrl.trim().length > 0 || isRecentYouTubeSong(hydratedSong)) {
            playSong(hydratedSong, [hydratedSong]);
            routerPush("/player");
            return;
          }
        }
        if (currentSongId) {
          routerPush("/player");
        }
        return;
      }

      if (item.type === "jiosaavn-playlist") {
        openJioSaavnPlaylist({
          id: itemId,
          name: item.name,
          imageUrl: item.imageUrl,
        });
        return;
      }

      const maybePlaylistData =
        item.data && typeof item.data === "object" ? (item.data as Record<string, unknown>) : null;
      if (maybePlaylistData && "createdBy" in maybePlaylistData) {
        openFirestorePlaylist({
          id: itemId,
          name: item.name,
          imageUrl: item.imageUrl,
          description:
            typeof maybePlaylistData.description === "string" ? maybePlaylistData.description : "",
          songCount: Array.isArray(maybePlaylistData.songs) ? maybePlaylistData.songs.length : 0,
        });
        return;
      }

      if (itemId.startsWith("user_")) {
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: itemId,
            jiosaavn: "false",
            firestore: "false",
            title: item.name,
            cover: item.imageUrl,
          },
        }, {
          withAnchor: true,
          dangerouslySingular: () => "playlist-details",
        });
        return;
      }

      // Legacy fallback: non-local playlist recents are usually JioSaavn ids.
      openJioSaavnPlaylist({
        id: itemId,
        name: item.name,
        imageUrl: item.imageUrl,
      });
    },
    [currentSongId, openFirestorePlaylist, openJioSaavnPlaylist, playSong, routerPush]
  );

  const renderRecentCard = useCallback(
    ({ item }: { item: RecentlyPlayedItem }) => (
      <Pressable
        style={({ pressed }) => [styles.recentCard, pressed && styles.cardPressed]}
        onPress={() => handleRecentPress(item)}
      >
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.recentImage}
          contentFit="cover"
          transition={HOME_IMAGE_TRANSITION_MS}
          cachePolicy="memory-disk"
          recyclingKey={`recent-${item.id}`}
        />
        <LinearGradient
          colors={["transparent", "rgba(38,42,49,0.36)", "rgba(16,20,26,0.9)"]}
          locations={[0, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.recentLabelWrap}>
          <Text style={styles.recentLabel} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      </Pressable>
    ),
    [handleRecentPress]
  );

  const renderPublicPlaylist = useCallback(
    ({ item }: { item: FirestorePlaylist }) => (
      <Pressable
        style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
        onPress={() =>
          openFirestorePlaylist({
            id: item.id,
            name: item.name,
            imageUrl: item.imageUrl,
            description: item.description,
            songCount: item.songs?.length || 0,
          })
        }
      >
        <View style={styles.rectCardImageWrap}>
          <Image
            source={{ uri: item.imageUrl || undefined }}
            style={[styles.rectCardImage, { borderColor: Colors.cardBorder }]}
            contentFit="contain"
            transition={HOME_IMAGE_TRANSITION_MS}
            cachePolicy="memory-disk"
            recyclingKey={`public-${item.id}`}
          />
          <View pointerEvents="none" style={styles.brandCoverBadge}>
            <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
          </View>
        </View>
        <Text style={styles.rectCardTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.rectCardMeta} numberOfLines={1}>
          {item.createdBy?.name || item.createdBy?.fullName || "Community"}
        </Text>
      </Pressable>
    ),
    [openFirestorePlaylist]
  );

  const renderArtistCard = useCallback(
    ({ item }: { item: ArtistCard }) => {
      const img = item.image?.length ? getBestImageUrl(item.image) : "";
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.name}
          style={({ pressed }) => [styles.artistCard, pressed && styles.cardPressed]}
          onPress={() =>
            routerPush(
              { pathname: "/artist/[id]", params: { id: item.id, name: item.name, image: img } },
              { withAnchor: true, dangerouslySingular: () => "artist-profile" }
            )
          }
        >
          <View style={styles.artistAvatarWrap}>
            <Image
              source={{ uri: img || undefined }}
              style={styles.artistAvatar}
              contentFit="cover"
              transition={HOME_IMAGE_TRANSITION_MS}
              cachePolicy="memory-disk"
              recyclingKey={`artist-${item.id}`}
            />
          </View>
          <Text style={styles.artistCardName} numberOfLines={2}>{item.name}</Text>
          {item.dominantLanguage ? (
            <Text style={styles.artistCardLang} numberOfLines={1}>
              {item.dominantLanguage}
            </Text>
          ) : null}
        </Pressable>
      );
    },
    [routerPush]
  );

  const categoryCardCallbacks = useMemo(
    () => ({ openJioSaavnPlaylist, openYouTubeMusicPlaylist }),
    [openJioSaavnPlaylist, openYouTubeMusicPlaylist]
  );

  const renderCategoryPlaylist = useCallback(
    ({ item, categoryId, categoryTitle }: { item: HomeCategoryData["results"][number]; categoryId: string; categoryTitle: string }) => {
      const imageUrl = getHomeCategoryItemImageUrl(item);
      return (
        <Pressable
          style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
          onPress={() => {
            if (item.source === "youtube") {
              categoryCardCallbacks.openYouTubeMusicPlaylist({
                id: item.id,
                name: item.name,
                imageUrl,
                songCount: Number(item.songCount || 0),
              });
              return;
            }
            categoryCardCallbacks.openJioSaavnPlaylist({
              id: item.id,
              name: item.name,
              imageUrl,
              songCount: Number(item.songCount || 0),
              url: item.url,
            });
          }}
        >
          <View style={styles.rectCardImageWrap}>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.rectCardImage, { borderColor: Colors.cardBorder }]}
              contentFit="contain"
              transition={HOME_IMAGE_TRANSITION_MS}
              cachePolicy="memory-disk"
              recyclingKey={`${categoryId}-${item.id}`}
            />
            <View pointerEvents="none" style={styles.brandCoverBadge}>
              {item.source === "youtube" ? (
                <Ionicons name="logo-youtube" size={15} color="#FFFFFF" />
              ) : (
                <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
              )}
            </View>
          </View>
          <Text style={styles.rectCardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.rectCardMeta} numberOfLines={1}>
            {item.songCount > 0 ? `${item.songCount} songs` : categoryTitle}
          </Text>
        </Pressable>
      );
    },
    [categoryCardCallbacks]
  );

  const makeCategoryRenderItem = useCallback(
    (categoryId: string, categoryTitle: string) =>
      ({ item }: { item: HomeCategoryData["results"][number] }) =>
        renderCategoryPlaylist({ item, categoryId, categoryTitle }),
    [renderCategoryPlaylist]
  );

  const renderRecommendationPlaylist = useCallback(
    ({ item }: { item: RecommendationItem }) => (
      <Pressable
        style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
        onPress={() => openRecommendationPlaylist(item)}
      >
        <View style={styles.rectCardImageWrap}>
          <Image
            source={{ uri: item.imageUrl || undefined }}
            style={[styles.rectCardImage, { borderColor: Colors.cardBorder }]}
            contentFit="contain"
            transition={HOME_IMAGE_TRANSITION_MS}
            cachePolicy="memory-disk"
            recyclingKey={`recommendation-${item.id}`}
          />
          <View pointerEvents="none" style={styles.brandCoverBadge}>
            <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
          </View>
        </View>
        <Text style={styles.rectCardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rectCardMeta} numberOfLines={1}>
          {item.subtitle || "Playlist"}
        </Text>
      </Pressable>
    ),
    [openRecommendationPlaylist]
  );

  const renderYouTubeTrendingPlaylist = useCallback(
    ({ item }: { item: YouTubeMusicPlaylistCard }) => (
      <Pressable
        style={({ pressed }) => [styles.rectCard, pressed && styles.cardPressed]}
        onPress={() =>
          openYouTubeMusicPlaylist({
            id: item.id,
            name: item.name,
            imageUrl: item.imageUrl,
            songCount: item.songCount,
          })
        }
      >
        <View style={styles.rectCardImageWrap}>
          <Image
            source={{ uri: item.imageUrl || undefined }}
            style={[styles.rectCardImage, { borderColor: Colors.cardBorder }]}
            contentFit="cover"
            transition={HOME_IMAGE_TRANSITION_MS}
            cachePolicy="memory-disk"
            recyclingKey={`yt-trending-${item.id}`}
          />
          <View pointerEvents="none" style={styles.brandCoverBadge}>
            <Image source={APP_BRAND_ICON} style={styles.brandCoverBadgeImage} contentFit="cover" />
          </View>
        </View>
        <Text style={styles.rectCardTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.rectCardMeta} numberOfLines={1}>
          {item.songCount ? `${item.songCount} songs` : "Playlist"}
        </Text>
      </Pressable>
    ),
    [openYouTubeMusicPlaylist]
  );

  const quickPicksChunks = useMemo(() => {
    const quickPickSongs = getQuickPickSongs(newReleaseSongs, quickPickRotationSeedRef.current ?? 0);
    return chunkArray(quickPickSongs, 4).filter((chunk) => chunk.length === 4);
  }, [newReleaseSongs]);

  const renderQuickPicksColumnSeparator = useCallback(() => <View style={{ width: 14 }} />, []);

  const renderQuickPicksColumn = useCallback(
    ({ item: columnSongs }: { item: Song[] }) => (
      <View style={{ width: windowWidth * 0.86, gap: 10 }}>
        {columnSongs.map((song) => {
          const isActive = currentSongId === song.id;
          return (
            <View key={song.id} style={styles.quickPickRow}>
              <Pressable
                style={({ pressed }) => [
                  { flex: 1, flexDirection: "row", alignItems: "center" },
                  pressed && styles.quickPickRowPressed,
                ]}
                onPress={() => handleNewReleaseSongPress(song)}
              >
                <Image
                  source={{ uri: song.coverUrl }}
                  style={styles.quickPickCover}
                  contentFit="cover"
                  recyclingKey={`quick-pick-${song.id}`}
                />
                <View style={styles.quickPickInfo}>
                  <Text style={[styles.quickPickTitle, isActive && { color: Colors.primary }]} numberOfLines={1}>
                    {song.title}
                  </Text>
                  <Text style={styles.quickPickArtist} numberOfLines={1}>
                    {song.artist}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  try {
                    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
                    const prunedSong = {
                      id: song.id,
                      title: song.title,
                      artist: song.artist,
                      album: song.album || "",
                      coverUrl: song.coverUrl || "",
                      audioUrl: song.audioUrl ? song.audioUrl.split("?")[0] : "",
                      source: song.source,
                    };
                    routerPush({
                      pathname: "/song-options",
                      params: {
                        song: JSON.stringify(prunedSong),
                        showDownload: song.source !== "youtube" ? "1" : "0",
                        canRemove: "0",
                        optionContext: "",
                      },
                    });
                  } catch (err) {
                    logger.error("[QuickPicks] Failed to open options menu:", err);
                    showGlobalToast("Could not open options");
                  }
                }}
                hitSlop={10}
                style={styles.quickPickMore}
              >
                <Ionicons name="ellipsis-vertical" size={18} color="rgba(255, 255, 255, 0.6)" />
              </Pressable>
            </View>
          );
        })}
      </View>
    ),
    [currentSongId, handleNewReleaseSongPress, routerPush, windowWidth]
  );

  const renderQuickPicksPlaceholder = useCallback(
    () => (
      <View style={{ width: windowWidth * 0.86, gap: 10 }}>
        {[0, 1, 2, 3].map((val) => (
          <View key={val} style={styles.quickPickRow}>
            <View style={[styles.quickPickCover, styles.placeholderBlock]} />
            <View style={styles.quickPickInfo}>
              <View style={[styles.placeholderLine, { width: "70%", height: 14, marginBottom: 6 }]} />
              <View style={[styles.placeholderLine, { width: "45%", height: 11 }]} />
            </View>
          </View>
        ))}
      </View>
    ),
    [windowWidth]
  );

  const renderRectPlaceholder = useCallback(
    ({ item }: { item: number }) => (
      <View style={styles.rectCard}>
        <View style={styles.rectCardImageWrap}>
          <View style={[styles.rectCardImage, styles.placeholderBlock]} />
        </View>
        <View style={[styles.placeholderLine, styles.placeholderLineTitle]} />
        <View style={[styles.placeholderLine, styles.placeholderLineMeta]} />
      </View>
    ),
    []
  );

  const handleHomeVideoScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const xOffset = event.nativeEvent.contentOffset.x;
      const interval = liveVideoCardWidth + HOME_VIDEO_CARD_GAP;
      const nextIndex = Math.max(0, Math.min(homeHeroVideos.length - 1, Math.round(xOffset / interval)));
      setActiveHomeVideoIndex(nextIndex);
    },
    [homeHeroVideos.length, liveVideoCardWidth]
  );

  const advanceHomeVideo = useCallback(() => {
    if (homeHeroVideos.length <= 1) return;

    setActiveHomeVideoIndex((currentIndex) => {
      const boundedIndex = Math.min(currentIndex, homeHeroVideos.length - 1);
      const nextIndex = (boundedIndex + 1) % homeHeroVideos.length;
      const offset = nextIndex * (liveVideoCardWidth + HOME_VIDEO_CARD_GAP);

      requestAnimationFrame(() => {
        homeVideoListRef.current?.scrollToOffset({ offset, animated: true });
      });

      return nextIndex;
    });
  }, [homeHeroVideos.length, liveVideoCardWidth]);

  const handleHomeVideoPress = useCallback(
    (item: HomeHeroVideoItem) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);

      if (item.linkType === "album" && item.album) {
        const albumId = String(item.album.saavnId || item.album.id || item.album.albumId || "").trim();
        const albumLink = String(item.album.url || item.album.link || item.linkUrl || "").trim();
        const albumTitle = String(item.album.title || item.album.name || item.title || "").trim();
        const albumCover = String(item.album.coverUrl || item.album.imageUrl || item.album.cover || "").trim();
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: albumId || item.id,
            jiosaavn: "true",
            album: "true",
            firestore: "false",
            link: albumLink,
            title: albumTitle,
            cover: albumCover,
            songCount: String(item.album.songCount ?? 0),
          },
        });
        return;
      }

      if (item.linkType === "playlist" && item.playlist) {
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: item.playlist.saavnId || item.playlist.id,
            jiosaavn: "true",
            firestore: "false",
            title: item.playlist.title,
            cover: item.playlist.coverUrl,
            songCount: String(item.playlist.songCount ?? 0),
          },
        });
        return;
      }

      const playableSong = getHomeHeroPlayableSong(item);
      if (playableSong) {
        playSong(playableSong, [playableSong]);
        routerPush("/player");
        return;
      }

      if (item.linkUrl) {
        void Linking.openURL(item.linkUrl);
      }
    },
    [playSong, routerPush]
  );

  const toggleLiveVideoMute = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setIsLiveVideoMuted((current) => !current);
  }, []);

  const handleHomeVideoAdUnavailable = useCallback((itemId: string) => {
    setUnavailableHomeAdItemIds((current) => (
      current.includes(itemId) ? current : [...current, itemId]
    ));
  }, []);

  const renderHomeVideoSeparator = useCallback(() => <View style={styles.liveVideoSeparator} />, []);

  const renderHomeVideoItem = useCallback(
    ({ item, index }: { item: HomeHeroVideoItem; index: number }) => (
      <HomeHeroVideoCard
        item={item}
        isActive={isHomeHeroPlaybackAllowed && index === visibleActiveHomeVideoIndex}
        isMuted={isLiveVideoMuted}
        width={liveVideoCardWidth}
        height={liveVideoCardHeight}
        onPress={handleHomeVideoPress}
        onToggleMute={toggleLiveVideoMute}
        onPlaybackEnd={advanceHomeVideo}
        onAdUnavailable={handleHomeVideoAdUnavailable}
        loop={homeHeroVideos.length <= 1}
      />
    ),
    [
      advanceHomeVideo,
      handleHomeVideoAdUnavailable,
      handleHomeVideoPress,
      homeHeroVideos.length,
      isHomeHeroPlaybackAllowed,
      isLiveVideoMuted,
      liveVideoCardHeight,
      liveVideoCardWidth,
      toggleLiveVideoMute,
      visibleActiveHomeVideoIndex,
    ]
  );
  const homeVideoPlaybackStateKey = `${visibleActiveHomeVideoIndex}:${isHomeHeroPlaybackAllowed ? "active" : "paused"}:${
    isLiveVideoMuted ? "muted" : "sound"
  }`;

  const getLiveVideoElement = useCallback(() => {
    return (
      <View style={styles.liveVideoWrap}>
        <View style={[styles.liveVideoSurface, { height: liveVideoHeight }]}>
          {homeHeroVideos.length > 0 ? (
            <FlatList
              ref={homeVideoListRef}
              horizontal
              data={homeHeroVideos}
              keyExtractor={(item) => item.id}
              extraData={homeVideoPlaybackStateKey}
              renderItem={renderHomeVideoItem}
              ItemSeparatorComponent={renderHomeVideoSeparator}
              showsHorizontalScrollIndicator={false}
              style={[styles.liveVideoRail, { top: videoSafeTopInset + 72, height: liveVideoCardHeight }]}
              contentContainerStyle={styles.liveVideoRailContent}
              snapToInterval={liveVideoCardWidth + HOME_VIDEO_CARD_GAP}
              decelerationRate="fast"
              disableIntervalMomentum
              onViewableItemsChanged={handleHomeVideoViewableItemsChangedRef.current}
              viewabilityConfig={homeVideoViewabilityConfigRef.current}
              onMomentumScrollEnd={handleHomeVideoScrollEnd}
              onScrollEndDrag={handleHomeVideoScrollEnd}
              scrollEventThrottle={16}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={3}
              removeClippedSubviews={Platform.OS === "android"}
            />
          ) : null}
        </View>
      </View>
    );
  }, [
    handleHomeVideoScrollEnd,
    homeHeroVideos,
    homeVideoPlaybackStateKey,
    liveVideoCardHeight,
    liveVideoCardWidth,
    liveVideoHeight,
    renderHomeVideoItem,
    renderHomeVideoSeparator,
    videoSafeTopInset,
  ]);

  const moodChipsElement = useMemo(
    () => <MoodChips selectedMood={selectedMood} onMoodPress={handleMoodPress} />,
    [handleMoodPress, selectedMood]
  );

  const getTopHeaderElement = useCallback(() => {
    return (
      <AppTopHeader
        topInset={topInset}
        elevated={isHomeHeaderElevated}
        title="Mavrixfy"
        left={<AppTopHeaderProfileButton />}
        right={
          <Pressable
            hitSlop={8}
            onPress={() => {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
              router.push("/notifications");
            }}
          >
            <Animated.View style={[styles.notificationBellIconWrap, animatedBellStyle]}>
              <Ionicons name="notifications-outline" size={24} color="#F8FBF9" />
              {unreadNotifCount > 0 && (
                <View style={styles.notificationUnreadDot} />
              )}
            </Animated.View>
          </Pressable>
        }
      />
    );
  }, [isHomeHeaderElevated, topInset, unreadNotifCount, animatedBellStyle]);

  const renderEmptyState = useCallback(() => {
    const isNetworkIssue = homeFeedState === "network";
    const title = isNetworkIssue ? "Fresh content is taking longer than expected" : "Start listening right away";
    const subtitle = isNetworkIssue
      ? "We could not refresh live recommendations right now. You can retry, import songs, or browse search instead."
      : "Your Home feed is still warming up. You can retry, import songs, or jump into search while live recommendations load.";

    return (
      <View style={styles.emptyStateWrap}>
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyStateIcon}>
            <Ionicons
              name={isNetworkIssue ? "cloud-offline-outline" : "musical-notes-outline"}
              size={22}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.emptyStateTitle}>{title}</Text>
          <Text style={styles.emptyStateText}>{subtitle}</Text>

          <View style={styles.emptyActionRow}>
            <Pressable
              style={[styles.emptyActionButton, styles.emptyActionPrimary]}
              onPress={() => {
                void handleRefresh();
              }}
            >
              <Ionicons name="refresh" size={16} color={Colors.black} />
              <Text style={styles.emptyActionPrimaryText}>Try Again</Text>
            </Pressable>

            <Pressable
              style={[styles.emptyActionButton, styles.emptyActionSecondary]}
              onPress={() => routerPush("/(tabs)/search")}
            >
              <Ionicons name="search" size={16} color={Colors.text} />
              <Text style={styles.emptyActionSecondaryText}>Search</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.emptyActionButton, styles.emptyActionTertiary]}
            onPress={() => routerPush("/import-songs")}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={Colors.text} />
            <Text style={styles.emptyActionSecondaryText}>Import Songs</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [handleRefresh, homeFeedState, routerPush]);

  const getSectionHeaderElement = useCallback((title: string, onViewAll?: () => void) => {
    return (
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {onViewAll ? (
          <Pressable onPress={onViewAll} hitSlop={8}>
            <Text style={styles.viewAllText}>View All</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }, []);

  const renderRowSeparator = useCallback(() => <View style={styles.rowSeparator} />, []);

  const getSectionElement = useCallback(
    ({ item: section }: { item: HomeSection }) => {
      switch (section.type) {
        case "recents":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("Jump Back In")}
              <FlatList
                horizontal
                data={recentlyPlayed}
                keyExtractor={(item) => `recent-${item.id}`}
                renderItem={renderRecentCard}
                ItemSeparatorComponent={renderRowSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={HOME_ROW_INITIAL_RENDER_COUNT}
                maxToRenderPerBatch={HOME_ROW_INITIAL_RENDER_COUNT}
                windowSize={HOME_ROW_WINDOW_SIZE}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "new-release-songs":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("Quick Picks")}
              {newReleaseSongs.length > 0 ? (
                <FlatList
                  horizontal
                  data={quickPicksChunks}
                  keyExtractor={(_, index) => `quick-picks-col-${index}`}
                  renderItem={renderQuickPicksColumn}
                  ItemSeparatorComponent={renderQuickPicksColumnSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  snapToInterval={windowWidth * 0.86 + 14}
                  decelerationRate="fast"
                  snapToAlignment="start"
                />
              ) : (
                <FlatList
                  horizontal
                  data={QUICK_PICK_PLACEHOLDER_COLUMNS}
                  keyExtractor={(item) => `quick-picks-loading-${item}`}
                  renderItem={renderQuickPicksPlaceholder}
                  ItemSeparatorComponent={renderQuickPicksColumnSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  scrollEnabled={false}
                />
              )}
            </View>
          );

        case "youtube-trending":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("YouTube Music videos")}
              {youtubeDiscoveryPlaylists.length > 0 ? (
                <FlatList
                  horizontal
                  data={youtubeDiscoveryPlaylists}
                  keyExtractor={(item) => `yt-trending-playlist-${item.id}`}
                  renderItem={renderYouTubeTrendingPlaylist}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  initialNumToRender={HOME_ROW_INITIAL_RENDER_COUNT}
                  maxToRenderPerBatch={HOME_ROW_INITIAL_RENDER_COUNT}
                  windowSize={HOME_ROW_WINDOW_SIZE}
                  removeClippedSubviews={Platform.OS === "android"}
                />
              ) : (
                <FlatList
                  horizontal
                  data={PLACEHOLDER_ROW_ITEMS}
                  keyExtractor={(item) => `yt-trending-playlist-loading-${item}`}
                  renderItem={renderRectPlaceholder}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  scrollEnabled={false}
                />
              )}
            </View>
          );

        case "public-playlists":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("Made for You")}
              {publicPlaylistsForSection.length > 0 ? (
                <FlatList
                  horizontal
                  data={publicPlaylistsForSection}
                  keyExtractor={(item) => `public-${item.id}`}
                  renderItem={renderPublicPlaylist}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  initialNumToRender={HOME_ROW_INITIAL_RENDER_COUNT}
                  maxToRenderPerBatch={HOME_ROW_INITIAL_RENDER_COUNT}
                  windowSize={HOME_ROW_WINDOW_SIZE}
                  removeClippedSubviews={Platform.OS === "android"}
                />
              ) : (
                <FlatList
                  horizontal
                  data={PLACEHOLDER_ROW_ITEMS}
                  keyExtractor={(item) => `public-loading-${item}`}
                  renderItem={renderRectPlaceholder}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  scrollEnabled={false}
                />
              )}
            </View>
          );

        case "featured-artists":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement("Artists to explore", () => routerPush("/artists", { withAnchor: true }))}
              <FlatList
                horizontal
                data={featuredArtists}
                keyExtractor={(item) => `artist-${item.id}`}
                renderItem={renderArtistCard}
                ItemSeparatorComponent={renderRowSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={HOME_ROW_INITIAL_RENDER_COUNT}
                maxToRenderPerBatch={HOME_ROW_INITIAL_RENDER_COUNT}
                windowSize={HOME_ROW_WINDOW_SIZE}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        case "category":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement(section.data.title)}
              {section.data.results.length > 0 ? (
                <FlatList
                  horizontal
                  data={section.data.results}
                  keyExtractor={(item) => `${section.data.id}-${item.id}`}
                  renderItem={makeCategoryRenderItem(section.data.id, section.data.title)}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  initialNumToRender={HOME_ROW_INITIAL_RENDER_COUNT}
                  maxToRenderPerBatch={HOME_ROW_INITIAL_RENDER_COUNT}
                  updateCellsBatchingPeriod={30}
                  windowSize={HOME_ROW_WINDOW_SIZE}
                  removeClippedSubviews
                />
              ) : (
                <FlatList
                  horizontal
                  data={PLACEHOLDER_ROW_ITEMS}
                  keyExtractor={(item) => `${section.data.id}-loading-${item}`}
                  renderItem={renderRectPlaceholder}
                  ItemSeparatorComponent={renderRowSeparator}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rowContent}
                  scrollEnabled={false}
                />
              )}
            </View>
          );

        case "recommendation":
          return (
            <View style={styles.section}>
              {getSectionHeaderElement(section.data.title)}
              <FlatList
                horizontal
                data={section.data.items}
                keyExtractor={(item) => `recommendation-${section.data.id}-${item.id}`}
                renderItem={renderRecommendationPlaylist}
                ItemSeparatorComponent={renderRowSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                initialNumToRender={HOME_ROW_INITIAL_RENDER_COUNT}
                maxToRenderPerBatch={HOME_ROW_INITIAL_RENDER_COUNT}
                windowSize={HOME_ROW_WINDOW_SIZE}
                removeClippedSubviews={Platform.OS === "android"}
              />
            </View>
          );

        default:
          return null;
      }
    },
    [
      recentlyPlayed,
      renderRecentCard,
      newReleaseSongs,
      quickPicksChunks,
      renderQuickPicksColumn,
      renderQuickPicksColumnSeparator,
      renderQuickPicksPlaceholder,
      publicPlaylistsForSection,
      renderPublicPlaylist,
      renderRectPlaceholder,
      featuredArtists,
      renderArtistCard,
      makeCategoryRenderItem,
      youtubeDiscoveryPlaylists,
      renderYouTubeTrendingPlaylist,
      renderRecommendationPlaylist,
      getSectionHeaderElement,
      renderRowSeparator,
      routerPush,
      windowWidth,
    ]
  );

  const refreshControlElement = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={BRAND.teal}
        colors={[BRAND.teal]}
        progressBackgroundColor="rgba(255,255,255,0.12)"
        progressViewOffset={topInset + PINNED_HOME_HEADER_HEIGHT}
      />
    ),
    [handleRefresh, refreshing, topInset]
  );

  const homeFeedListHeader = useMemo(
    () => (
      <>
        {getLiveVideoElement()}
        {moodChipsElement}
        <PromotionBanner />
        <AppPromotionModal />
      </>
    ),
    [getLiveVideoElement, moodChipsElement]
  );

  const shouldShowBootSurface = (loading || isRecommendationFeedLoading) && sections.length === 0;
  const inlineAdSectionIndex = useMemo(() => Math.min(5, Math.max(0, sections.length - 1)), [sections.length]);
  const renderHomeSection = useCallback(
    ({ item, index }: { item: HomeSection; index: number }) => (
      <>
        {getSectionElement({ item })}
        {shouldRenderInlineAd && index === inlineAdSectionIndex ? (
          <AdMobBanner loadDelayMs={INLINE_AD_LOAD_DELAY_MS} />
        ) : null}
      </>
    ),
    [getSectionElement, inlineAdSectionIndex, shouldRenderInlineAd]
  );

  // Show full offline screen only when there's no cached content to display
  if (!isOnline && !isChecking && sections.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <OfflineScreen message="Connect to the internet to discover music." />
      </View>
    );
  }

  if (shouldShowBootSurface) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <HomeBootSurface topInset={0} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["rgba(38, 225, 154, 0.28)", "rgba(24, 160, 251, 0.15)", "rgba(16, 20, 26, 0)"]}
        locations={[0, 0.65, 1]}
        style={styles.headerGlowGradient}
      />
      {/* Slim banner when offline but cached content is available */}
      {!isOnline && <OfflineBanner />}
      <FlatList
        data={sections}
        keyExtractor={(section) => section.id}
        renderItem={renderHomeSection}
        refreshControl={refreshControlElement}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, sections.length === 0 && styles.scrollContentEmpty]}
        showsVerticalScrollIndicator={false}
        onScroll={handleHomeScrollEvent}
        scrollEventThrottle={16}
        initialNumToRender={HOME_VERTICAL_INITIAL_RENDER_COUNT}
        maxToRenderPerBatch={HOME_VERTICAL_MAX_RENDER_BATCH}
        updateCellsBatchingPeriod={30}
        windowSize={HOME_VERTICAL_WINDOW_SIZE}
        removeClippedSubviews
        ListHeaderComponent={homeFeedListHeader}
        ListEmptyComponent={renderEmptyState}
      />
      {getTopHeaderElement()}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16,20,26,0)", "rgba(16,20,26,0.52)", "rgba(16,20,26,0.84)", Colors.background]}
        locations={[0, 0.58, 0.86, 1]}
        style={styles.bottomVisibilityOverlay}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bootSurface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  bootSurfaceGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  adOverlayContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(11, 13, 16, 0.85)",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    zIndex: 3,
  },
  liveVideoAdView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#11141a",
    overflow: "hidden",
  },
  liveVideoAdLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#11141a",
    gap: 8,
  },
  liveVideoAdLoadingText: {
    color: "rgba(248,251,249,0.68)",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
  },
  liveVideoAdUnavailableCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#11141a",
    borderWidth: 1,
    borderColor: "rgba(38,225,154,0.22)",
    paddingHorizontal: 24,
  },
  liveVideoAdUnavailableBadge: {
    borderRadius: 4,
    backgroundColor: "#26e19a",
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 10,
  },
  liveVideoAdUnavailableBadgeText: {
    color: "#10141a",
    fontSize: 10,
    lineHeight: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  liveVideoAdUnavailableTitle: {
    color: "#F8FBF9",
    fontSize: 16,
    lineHeight: 21,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
    textAlign: "center",
  },
  liveVideoAdUnavailableText: {
    maxWidth: 260,
    color: "rgba(248,251,249,0.66)",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0,
    textAlign: "center",
    marginTop: 6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 156,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  bottomVisibilityOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 176,
  },
  headerBrandTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerBrandLargeTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  notificationBellIconWrap: {
    position: "relative",
  },
  notificationUnreadDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: "#10141a",
  },
  liveVideoWrap: {
    width: "100%",
    marginTop: 0,
    backgroundColor: "transparent",
  },
  liveVideoSurface: {
    width: "100%",
    backgroundColor: "transparent",
    overflow: "hidden",
    position: "relative",
  },
  liveVideoRail: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  liveVideoRailContent: {
    paddingHorizontal: 8,
  },
  liveVideoSeparator: {
    width: HOME_VIDEO_CARD_GAP,
  },
  liveVideoSlide: {
    borderRadius: 10,
    backgroundColor: "transparent",
    overflow: "hidden",
    position: "relative",
  },
  liveVideoPoster: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
  liveVideoPlayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
    zIndex: 1,
  },
  liveVideoMediaFill: {
    transform: [{ scale: 1.015 }],
  },
  liveVideoCardCopy: {
    position: "absolute",
    left: 14,
    right: 50,
    bottom: 14,
    zIndex: 3,
  },
  liveVideoBadgeRow: {
    minHeight: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },
  liveVideoLiveBadge: {
    borderRadius: 4,
    backgroundColor: "#E11D2E",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  liveVideoLiveBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    lineHeight: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  liveVideoCardTitle: {
    color: "#F8FBF9",
    fontSize: 15,
    lineHeight: 19,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
    textShadowColor: "rgba(0,0,0,0.72)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liveVideoSongTitle: {
    marginTop: 2,
    color: "rgba(248,251,249,0.82)",
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
    textShadowColor: "rgba(0,0,0,0.72)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liveVideoMuteButton: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(18,24,30,0.78)",
    borderWidth: 1,
    borderColor: "rgba(248,251,249,0.16)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  section: {
    marginTop: 20,
  },
  emptyStateWrap: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  emptyStateCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyStateIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(38,225,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyStateTitle: {
    color: Colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: "Inter_700Bold",
  },
  emptyStateText: {
    marginTop: 8,
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  emptyActionRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  emptyActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
  },
  emptyActionPrimary: {
    backgroundColor: Colors.primary,
  },
  emptyActionPrimaryText: {
    color: Colors.black,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  emptyActionSecondary: {
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyActionSecondaryText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyActionTertiary: {
    marginTop: 10,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 19,
    color: BRAND.textPrimary,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.18,
  },
  viewAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  rowContent: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  rowSeparator: {
    width: HORIZONTAL_ROW_GAP,
  },
  recentCard: {
    width: RECENT_CARD_SIZE,
    height: RECENT_CARD_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  recentImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  recentLabelWrap: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
  },
  recentLabel: {
    color: BRAND.textPrimary,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  rectCard: {
    width: RECT_CARD_WIDTH,
    alignItems: "center",
  },
  artistCard: {
    width: ARTIST_CARD_WIDTH,
    alignItems: "center",
    gap: 6,
  },
  artistAvatarWrap: {
    width: 108,
    height: 108,
    position: "relative",
  },
  artistAvatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#1e2228",
  },
  artistCardName: {
    color: "#DFE2EB",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  artistCardLang: {
    color: "rgba(188,203,185,0.76)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    textTransform: "capitalize",
  },
  rectCardImageWrap: {
    width: RECT_CARD_WIDTH,
    height: RECT_CARD_WIDTH,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  rectCardImage: {
    width: RECT_CARD_WIDTH,
    height: RECT_CARD_WIDTH,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  rectCardTitle: {
    color: BRAND.textPrimary,
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
    textAlign: "center",
  },
  rectCardMeta: {
    color: BRAND.textMuted,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 3,
    textAlign: "center",
  },
  brandCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.45)",
    backgroundColor: "#0E131A",
  },
  brandCoverBadgeImage: {
    width: "100%",
    height: "100%",
    opacity: 0.82,
  },
  placeholderBlock: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.cardBorder,
  },
  placeholderLine: {
    marginTop: 8,
    alignSelf: "center",
    borderRadius: 4,
    backgroundColor: "rgba(223,226,235,0.2)",
  },
  placeholderLineTitle: {
    width: 124,
    height: 11,
  },
  placeholderLineMeta: {
    width: 84,
    height: 9,
    marginTop: 6,
    opacity: 0.75,
  },
  cardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
  headerGlowGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 540,
    zIndex: 0,
  },
  moodChipsContainer: {
    width: "100%",
    paddingVertical: 12,
    backgroundColor: "transparent",
  },
  moodChipsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  moodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  moodChipUnselected: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  moodChipSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  moodChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  moodChipTextUnselected: {
    color: "#FFFFFF",
  },
  moodChipTextSelected: {
    color: "#10141a",
  },
  quickPickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    width: "100%",
  },
  quickPickRowPressed: {
    opacity: 0.7,
  },
  quickPickCover: {
    width: 52,
    height: 52,
    borderRadius: 4,
    marginRight: 12,
    backgroundColor: Colors.surfaceLight,
  },
  quickPickInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  quickPickTitle: {
    color: "#FFFFFF",
    fontSize: 15.5,
    fontFamily: "Inter_600SemiBold",
  },
  quickPickArtist: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  quickPickMore: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
});
