import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AdMobBanner from "@/components/AdMobBanner";
import AppPromotionModal from "@/components/AppPromotionModal";
import AppTopHeader, {
  AppTopHeaderProfileButton,
  useAppTopHeaderScrollElevation,
} from "@/components/AppTopHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import OfflineBanner from "@/components/OfflineBanner";
import OfflineScreen from "@/components/OfflineScreen";
import PromotionBanner from "@/components/PromotionBanner";
import Colors from "@/constants/colors";
import { useNetwork } from "@/contexts/NetworkContext";
import { usePlayerBrowse } from "@/contexts/PlayerContext";
import { getPublicPlaylists, type FirestorePlaylist } from "@/lib/firestore";
import { getBestImageUrl, type Song } from "@/lib/musicData";
import { getRecentlyPlayed, type RecentlyPlayedItem } from "@/lib/storage";
import { triggerImpact } from "@/lib/haptics";
import {
  clearJioSaavnPlaylistCache,
  getHomeJioSaavnCategories,
  type HomeJioSaavnCategoryData,
  type JioSaavnPlaylistResult,
} from "@/lib/jioSaavnService";
import { logger } from "@/lib/logger";
import {
  clearYouTubeMusicCache,
  getHomeYouTubeMusicCategories,
  getYouTubeMusicLatestIndiaSongs,
  type YouTubeMusicHomeCategoryData,
  type YouTubeMusicPlaylistCard,
} from "@/lib/youtubeMusicService";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import {
  getUnreadNotificationsCount,
  loadNotifications,
  subscribeNotifications,
} from "@/stores/notificationStore";

const APP_BRAND_ICON = require("@/assets/images/mavrixfy_icone.png");

type HomeFeedState = "ready" | "empty" | "network";
type PlaylistSource = "youtube" | "jiosaavn" | "community";

type PlaylistCardData = {
  id: string;
  title: string;
  imageUrl: string;
  meta: string;
  source: PlaylistSource;
  songCount?: number;
  description?: string;
  url?: string;
};

type HomeSection =
  | { id: "jump-back-in"; type: "jump-back-in"; title: string; items: RecentlyPlayedItem[] }
  | { id: "quick-picks"; type: "quick-picks"; title: string; songs: Song[] }
  | { id: string; type: "playlist-row"; title: string; eyebrow?: string; source: PlaylistSource; items: PlaylistCardData[] };

type HomeCache = {
  hydrated: boolean;
  recentlyPlayed: RecentlyPlayedItem[];
  quickPicks: Song[];
  youtubeRows: YouTubeMusicHomeCategoryData[];
  jioRows: HomeJioSaavnCategoryData[];
  communityPlaylists: FirestorePlaylist[];
};

const HOME_CACHE: HomeCache = {
  hydrated: false,
  recentlyPlayed: [],
  quickPicks: [],
  youtubeRows: [],
  jioRows: [],
  communityPlaylists: [],
};

const HOME_FETCH_TIMEOUT_MS = 15000;
const HOME_ROW_LIMIT = 10;
const HOME_BOOT_HEADER_HEIGHT = 56;
const HOME_IMAGE_TRANSITION_MS = 0;
const RECENT_CARD_SIZE = 92;
const PLAYLIST_CARD_SIZE = 152;
const PLAYLIST_CARD_GAP = 12;
const QUICK_PICK_COLUMN_GAP = 14;
const INLINE_AD_SECTION_INDEX = 5;
const PLACEHOLDER_ROW_ITEMS = [0, 1, 2, 3];
const QUICK_PICK_PLACEHOLDERS = [0, 1];
const QUICK_PICK_ROWS_PER_COLUMN = 4;
const YOUTUBE_HOME_SECTION_LIMIT = 7;
const JIOSAAVN_HOME_SECTION_LIMIT = 3;
const MOOD_CHIPS = ["Podcasts", "Romance", "Feel good", "Workout", "Relax"];
const JIOSAAVN_HOME_CATEGORY_IDS = ["trending", "new-arrivals", "most-viral", "romance", "party-mix", "chill-vibes"] as const;
const JIOSAAVN_BOTTOM_SECTION_PRIORITY = ["trending", "new-arrivals", "most-viral", "romance", "party-mix", "chill-vibes"];

function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
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

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function dedupeById<T extends { id: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const id = item.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ ...item, id });
    if (unique.length >= limit) break;
  }

  return unique;
}

function getPlaylistDedupeKeys(card: PlaylistCardData): string[] {
  const keys: string[] = [];
  const id = card.id.trim();
  const titleKey = normalizeKey(card.title);
  if (id) keys.push(`${card.source}:${id.toLowerCase()}`);
  if (titleKey) keys.push(`title:${titleKey}`);
  return keys;
}

function dedupePlaylistCards(
  items: PlaylistCardData[],
  limit: number,
  seenKeys?: Set<string>
): PlaylistCardData[] {
  const localSeen = seenKeys ?? new Set<string>();
  const unique: PlaylistCardData[] = [];

  for (const item of items) {
    const keys = getPlaylistDedupeKeys(item);
    if (keys.length === 0 || keys.some((key) => localSeen.has(key))) continue;
    keys.forEach((key) => localSeen.add(key));
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

function getShelfEyebrow(title: string): string | undefined {
  const key = title.toLowerCase();
  if (key.includes("latest") || key.includes("new release") || key.includes("fresh")) return "NEW MUSIC FIRST";
  if (key.includes("popular") || key.includes("most played")) return "WHAT INDIA IS PLAYING";
  if (key.includes("summer")) return "PLAYLISTS FOR THE SEASON";
  if (key.includes("romance") || key.includes("love")) return "BACKGROUND SCORE TO YOUR LOVE STORY";
  if (key.includes("india") || key.includes("biggest")) return "MUSIC THAT'S HOT AND HAPPENING!";
  return undefined;
}

function toYouTubeCard(item: YouTubeMusicPlaylistCard, fallbackMeta: string): PlaylistCardData | null {
  const id = item.id?.trim();
  const title = item.name?.trim();
  if (!id || !title) return null;

  return {
    id,
    title,
    imageUrl: item.imageUrl || "",
    meta: item.author || (item.songCount ? `${item.songCount} songs` : fallbackMeta),
    source: "youtube",
    songCount: item.songCount,
    description: item.description,
  };
}

function toJioSaavnCard(item: JioSaavnPlaylistResult): PlaylistCardData | null {
  const id = item.id?.trim();
  const title = item.name?.trim();
  if (!id || !title) return null;

  return {
    id,
    title,
    imageUrl: getBestImageUrl(item.image),
    meta: item.language || (item.songCount ? `${item.songCount} songs` : "JioSaavn"),
    source: "jiosaavn",
    songCount: item.songCount,
    description: item.description,
    url: item.url,
  };
}

function toCommunityCard(item: FirestorePlaylist): PlaylistCardData | null {
  const id = item.id?.trim();
  const title = item.name?.trim();
  if (!id || !title) return null;

  return {
    id,
    title,
    imageUrl: item.imageUrl || "",
    meta: item.createdBy?.name || item.createdBy?.fullName || "Community",
    source: "community",
    songCount: item.songs?.length || 0,
    description: item.description,
  };
}

function buildJioSaavnBottomSections(jioRows: HomeJioSaavnCategoryData[]): HomeSection[] {
  const seenCategoryIds = new Set<string>();
  const sortedRows = [
    ...JIOSAAVN_BOTTOM_SECTION_PRIORITY.flatMap((id) => {
      const row = jioRows.find((category) => category.id === id);
      return row ? [row] : [];
    }),
    ...jioRows,
  ].filter((row) => {
    const id = row.id || normalizeKey(row.title);
    if (!id || seenCategoryIds.has(id)) return false;
    seenCategoryIds.add(id);
    return true;
  });

  const seenPlaylistKeys = new Set<string>();
  return sortedRows.flatMap((row) => {
    const items = dedupePlaylistCards(
      row.results.flatMap((item) => {
        const card = toJioSaavnCard(item);
        return card ? [card] : [];
      }),
      HOME_ROW_LIMIT,
      seenPlaylistKeys
    );
    if (items.length === 0) return [];

    return [{
      id: `jiosaavn-${row.id || normalizeKey(row.title)}`,
      type: "playlist-row" as const,
      title: row.title,
      eyebrow: row.id === "new-arrivals" ? "NEW ON JIOSAAVN" : undefined,
      source: "jiosaavn" as const,
      items,
    }];
  }).slice(0, JIOSAAVN_HOME_SECTION_LIMIT);
}

function dedupeHomePlaylistSections(sections: HomeSection[]): HomeSection[] {
  const seenPlaylistKeys = new Set<string>();

  return sections.flatMap((section) => {
    if (section.type !== "playlist-row") return [section];

    const items = dedupePlaylistCards(section.items, HOME_ROW_LIMIT, seenPlaylistKeys);
    if (items.length === 0) return [];
    return [{ ...section, items }];
  });
}

function hasAnyHomeContent(cache: HomeCache): boolean {
  return (
    cache.recentlyPlayed.length > 0 ||
    cache.quickPicks.length > 0 ||
    cache.youtubeRows.length > 0 ||
    cache.jioRows.length > 0 ||
    cache.communityPlaylists.length > 0
  );
}

function HomeBootSurface() {
  return (
    <View style={styles.bootSurface}>
      <LinearGradient
        colors={["rgba(38,225,154,0.22)", "rgba(16,20,26,0)"]}
        style={styles.bootGlow}
      />
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

function HomeScreenInner() {
  useScreenTracking("Home");

  const { isOnline, isChecking } = useNetwork();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { push: routerPush } = useRouter();
  const { playSong, currentSong } = usePlayerBrowse();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const quickPickColumnWidth = Math.max(280, windowWidth - 42);
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedItem[]>(HOME_CACHE.recentlyPlayed);
  const [quickPicks, setQuickPicks] = useState<Song[]>(HOME_CACHE.quickPicks);
  const [youtubeRows, setYoutubeRows] = useState<YouTubeMusicHomeCategoryData[]>(HOME_CACHE.youtubeRows);
  const [jioRows, setJioRows] = useState<HomeJioSaavnCategoryData[]>(HOME_CACHE.jioRows);
  const [communityPlaylists, setCommunityPlaylists] = useState<FirestorePlaylist[]>(HOME_CACHE.communityPlaylists);
  const [loading, setLoading] = useState(!HOME_CACHE.hydrated);
  const [refreshing, setRefreshing] = useState(false);
  const [feedState, setFeedState] = useState<HomeFeedState>(
    hasAnyHomeContent(HOME_CACHE) ? "ready" : "empty"
  );
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const {
    isHeaderElevated,
    handleHeaderScroll,
  } = useAppTopHeaderScrollElevation();

  useEffect(() => {
    void loadNotifications().then(() => {
      setUnreadNotifCount(getUnreadNotificationsCount());
    });

    return subscribeNotifications(() => {
      setUnreadNotifCount(getUnreadNotificationsCount());
    });
  }, []);

  const applyHomeCache = useCallback((nextCache: HomeCache) => {
    HOME_CACHE.hydrated = nextCache.hydrated;
    HOME_CACHE.recentlyPlayed = nextCache.recentlyPlayed;
    HOME_CACHE.quickPicks = nextCache.quickPicks;
    HOME_CACHE.youtubeRows = nextCache.youtubeRows;
    HOME_CACHE.jioRows = nextCache.jioRows;
    HOME_CACHE.communityPlaylists = nextCache.communityPlaylists;

    setRecentlyPlayed(nextCache.recentlyPlayed);
    setQuickPicks(nextCache.quickPicks);
    setYoutubeRows(nextCache.youtubeRows);
    setJioRows(nextCache.jioRows);
    setCommunityPlaylists(nextCache.communityPlaylists);
    setFeedState(hasAnyHomeContent(nextCache) ? "ready" : "empty");
  }, []);

  const loadHomeData = useCallback(
    async (options?: { forceRefresh?: boolean; showLoader?: boolean }) => {
      const showLoader = options?.showLoader ?? true;
      if (showLoader && !hasAnyHomeContent(HOME_CACHE)) {
        setLoading(true);
      }

      try {
        const [recentResult, quickResult, youtubeResult, jioResult, communityResult] = await withPromiseTimeout(
          Promise.allSettled([
            getRecentlyPlayed(),
            getYouTubeMusicLatestIndiaSongs({ forceRefresh: options?.forceRefresh, limit: 12 }),
            getHomeYouTubeMusicCategories({ forceRefresh: options?.forceRefresh, limitPerCategory: HOME_ROW_LIMIT }),
            getHomeJioSaavnCategories({
              forceRefresh: options?.forceRefresh,
              limitPerCategory: HOME_ROW_LIMIT,
              categoryIds: [...JIOSAAVN_HOME_CATEGORY_IDS],
            }),
            getPublicPlaylists(16),
          ]),
          HOME_FETCH_TIMEOUT_MS,
          "Home feed timeout"
        );

        const nextCache: HomeCache = {
          hydrated: true,
          recentlyPlayed: recentResult.status === "fulfilled" ? recentResult.value.slice(0, 8) : HOME_CACHE.recentlyPlayed,
          quickPicks: quickResult.status === "fulfilled" ? dedupeById(quickResult.value, 16) : HOME_CACHE.quickPicks,
          youtubeRows: youtubeResult.status === "fulfilled" ? youtubeResult.value : HOME_CACHE.youtubeRows,
          jioRows: jioResult.status === "fulfilled" ? jioResult.value : HOME_CACHE.jioRows,
          communityPlaylists: communityResult.status === "fulfilled" ? communityResult.value : HOME_CACHE.communityPlaylists,
        };

        applyHomeCache(nextCache);
      } catch (error) {
        logger.warn("[Home] Failed to load feed:", error);
        HOME_CACHE.hydrated = true;
        setFeedState(hasAnyHomeContent(HOME_CACHE) ? "ready" : "network");
      } finally {
        setLoading(false);
      }
    },
    [applyHomeCache]
  );

  useEffect(() => {
    if (HOME_CACHE.hydrated && hasAnyHomeContent(HOME_CACHE)) {
      setLoading(false);
      return;
    }

    void loadHomeData({ showLoader: true });
  }, [loadHomeData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        clearYouTubeMusicCache().catch(() => {}),
        clearJioSaavnPlaylistCache().catch(() => {}),
      ]);
      await loadHomeData({ forceRefresh: true, showLoader: false });
    } finally {
      setRefreshing(false);
    }
  }, [loadHomeData]);

  const openPlaylist = useCallback(
    (playlist: PlaylistCardData) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      if (playlist.source === "youtube") {
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: playlist.id,
            youtube: "true",
            jiosaavn: "false",
            firestore: "false",
            title: playlist.title,
            cover: playlist.imageUrl,
            songCount: playlist.songCount ? String(playlist.songCount) : "",
          },
        }, {
          withAnchor: true,
          dangerouslySingular: () => "playlist-details",
        });
        return;
      }

      if (playlist.source === "jiosaavn") {
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: playlist.id,
            jiosaavn: "true",
            firestore: "false",
            link: playlist.url || "",
            title: playlist.title,
            cover: playlist.imageUrl,
            songCount: playlist.songCount ? String(playlist.songCount) : "",
          },
        }, {
          withAnchor: true,
          dangerouslySingular: () => "playlist-details",
        });
        return;
      }

      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: playlist.id,
          firestore: "true",
          jiosaavn: "false",
          title: playlist.title,
          description: playlist.description || "",
          cover: playlist.imageUrl,
          songCount: playlist.songCount ? String(playlist.songCount) : "",
        },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [routerPush]
  );

  const openSearch = useCallback(
    (query: string) => {
      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      routerPush({ pathname: "/(tabs)/search", params: { q: query } });
    },
    [routerPush]
  );

  const handleRecentPress = useCallback(
    (item: RecentlyPlayedItem) => {
      const itemId = item.id.trim();
      if (!itemId) return;

      void triggerImpact(Haptics.ImpactFeedbackStyle.Light);

      if (item.type === "song") {
        const sourceSong = item.data as Partial<Song> | undefined;
        const hydratedSong: Song = {
          id: sourceSong?.id || itemId,
          title: sourceSong?.title || item.name || "Unknown Song",
          artist: sourceSong?.artist || "Unknown Artist",
          album: sourceSong?.album || "",
          duration: Number(sourceSong?.duration) || 0,
          coverUrl: sourceSong?.coverUrl || item.imageUrl || "",
          genre: sourceSong?.genre || "",
          audioUrl: typeof sourceSong?.audioUrl === "string" ? sourceSong.audioUrl : "",
          year: sourceSong?.year,
          language: sourceSong?.language,
          source: sourceSong?.source,
          videoId: sourceSong?.videoId,
          youtubeVideoId: sourceSong?.youtubeVideoId,
          youtubeVisualVideoId: sourceSong?.youtubeVisualVideoId,
          youtubeVideoType: sourceSong?.youtubeVideoType,
          youtubeNativeAudio: sourceSong?.youtubeNativeAudio,
          playbackHeaders: sourceSong?.playbackHeaders,
        };
        playSong(hydratedSong, [hydratedSong]);
        routerPush("/player");
        return;
      }

      const data = item.data && typeof item.data === "object" ? item.data as Record<string, unknown> : {};
      const sourceValue = String(data.source || "").toLowerCase();
      const isYouTubePlaylist =
        sourceValue === "youtube" ||
        itemId.startsWith("VL") ||
        itemId.startsWith("PL") ||
        itemId.startsWith("RDCLAK") ||
        itemId.startsWith("RDTMAK") ||
        itemId.startsWith("OLAK");
      const isFirestorePlaylist = "createdBy" in data || "songs" in data;

      if (isYouTubePlaylist) {
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: itemId,
            youtube: "true",
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

      if (item.type === "jiosaavn-playlist" || (!isFirestorePlaylist && !itemId.startsWith("user_"))) {
        routerPush({
          pathname: "/playlist/[id]",
          params: {
            id: itemId,
            jiosaavn: "true",
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

      routerPush({
        pathname: "/playlist/[id]",
        params: {
          id: itemId,
          firestore: isFirestorePlaylist ? "true" : "false",
          jiosaavn: "false",
          title: item.name,
          cover: item.imageUrl,
          songCount: Array.isArray(data.songs) ? String(data.songs.length) : "",
        },
      }, {
        withAnchor: true,
        dangerouslySingular: () => "playlist-details",
      });
    },
    [playSong, routerPush]
  );

  const handleQuickPickPress = useCallback(
    (song: Song) => {
      const playableSongs = quickPicks.filter((candidate) => candidate.id && candidate.title);
      playSong(song, playableSongs.length > 0 ? playableSongs : [song]);
      routerPush("/player");
    },
    [playSong, quickPicks, routerPush]
  );

  const quickPickColumns = useMemo(
    () => chunkArray(quickPicks, QUICK_PICK_ROWS_PER_COLUMN).filter((chunk) => chunk.length > 0),
    [quickPicks]
  );

  const youtubeSections = useMemo<HomeSection[]>(() => {
    const seen = new Set<string>();
    const seenPlaylistKeys = new Set<string>();
    return youtubeRows.flatMap((row, index) => {
      const rowKey = normalizeKey(row.title || row.id || `youtube-${index}`);
      if (!rowKey || seen.has(rowKey)) return [];
      seen.add(rowKey);
      const items = dedupePlaylistCards(
        row.results.flatMap((item) => {
          const card = toYouTubeCard(item, row.title);
          return card ? [card] : [];
        }),
        HOME_ROW_LIMIT,
        seenPlaylistKeys
      );
      if (items.length === 0) return [];
      return [{
        id: `youtube-${rowKey}`,
        type: "playlist-row" as const,
        title: row.title,
        eyebrow: getShelfEyebrow(row.title),
        source: "youtube" as const,
        items,
      }];
    }).slice(0, YOUTUBE_HOME_SECTION_LIMIT);
  }, [youtubeRows]);

  const jioSections = useMemo(() => buildJioSaavnBottomSections(jioRows), [jioRows]);
  const communityItems = useMemo(
    () => dedupePlaylistCards(communityPlaylists.flatMap((item) => {
      const card = toCommunityCard(item);
      return card ? [card] : [];
    }), HOME_ROW_LIMIT),
    [communityPlaylists]
  );

  const sections = useMemo<HomeSection[]>(() => {
    const rows: HomeSection[] = [];
    if (recentlyPlayed.length > 0) {
      rows.push({ id: "jump-back-in", type: "jump-back-in", title: "Jump back in", items: recentlyPlayed });
    }
    if (quickPicks.length > 0 || loading) {
      rows.push({ id: "quick-picks", type: "quick-picks", title: "Quick picks", songs: quickPicks });
    }
    rows.push(...youtubeSections);
    rows.push(...jioSections);
    if (communityItems.length > 0) {
      rows.push({
        id: "trending-community",
        type: "playlist-row",
        title: "Trending community playlists",
        source: "community",
        items: communityItems,
      });
    }
    return dedupeHomePlaylistSections(rows);
  }, [communityItems, jioSections, loading, quickPicks, recentlyPlayed, youtubeSections]);

  const renderRowSeparator = useCallback(() => <View style={styles.rowSeparator} />, []);
  const renderQuickPickColumnSeparator = useCallback(() => <View style={{ width: QUICK_PICK_COLUMN_GAP }} />, []);

  const renderPlaceholderCard = useCallback(
    () => (
      <View style={styles.playlistCard}>
        <View style={styles.coverWrap}>
          <View style={[styles.coverImage, styles.placeholderBlock]} />
        </View>
        <View style={[styles.placeholderLine, styles.placeholderTitle]} />
        <View style={[styles.placeholderLine, styles.placeholderMeta]} />
      </View>
    ),
    []
  );

  const renderQuickPickPlaceholder = useCallback(
    () => (
      <View style={[styles.quickPickColumn, { width: quickPickColumnWidth }]}>
        {[0, 1, 2, 3].map((item) => (
          <View key={item} style={styles.quickPickRow}>
            <View style={[styles.quickPickCover, styles.placeholderBlock]} />
            <View style={styles.quickPickInfo}>
              <View style={[styles.placeholderLine, { width: "74%", height: 14, marginTop: 0 }]} />
              <View style={[styles.placeholderLine, { width: "52%", height: 11 }]} />
            </View>
          </View>
        ))}
      </View>
    ),
    [quickPickColumnWidth]
  );

  const renderQuickPickColumn = useCallback(
    ({ item: songs }: { item: Song[] }) => (
      <View style={[styles.quickPickColumn, { width: quickPickColumnWidth }]}>
        {songs.map((song) => {
          const isActive = currentSong?.id === song.id;
          return (
            <View key={song.id} style={styles.quickPickRow}>
              <Pressable
                style={({ pressed }) => [styles.quickPickPress, pressed && styles.cardPressed]}
                onPress={() => handleQuickPickPress(song)}
              >
                <Image
                  source={{ uri: song.coverUrl || undefined }}
                  style={styles.quickPickCover}
                  contentFit="cover"
                  cachePolicy="memory-disk"
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
                hitSlop={10}
                style={styles.quickPickMore}
                onPress={() => openSearch(song.title)}
              >
                <Ionicons name="ellipsis-vertical" size={18} color="rgba(255,255,255,0.62)" />
              </Pressable>
            </View>
          );
        })}
      </View>
    ),
    [currentSong?.id, handleQuickPickPress, openSearch, quickPickColumnWidth]
  );

  const renderRecentCard = useCallback(
    ({ item }: { item: RecentlyPlayedItem }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.name}
        style={({ pressed }) => [styles.recentCard, pressed && styles.cardPressed]}
        onPress={() => handleRecentPress(item)}
      >
        <Image
          source={{ uri: item.imageUrl || undefined }}
          style={styles.recentImage}
          contentFit="cover"
          transition={HOME_IMAGE_TRANSITION_MS}
          cachePolicy="memory-disk"
          recyclingKey={`recent-${item.id}`}
        />
        <LinearGradient
          colors={["transparent", "rgba(16,20,26,0.32)", "rgba(16,20,26,0.92)"]}
          locations={[0, 0.56, 1]}
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

  const renderPlaylistCard = useCallback(
    ({ item }: { item: PlaylistCardData }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title}
        style={({ pressed }) => [styles.playlistCard, pressed && styles.cardPressed]}
        onPress={() => openPlaylist(item)}
      >
        <View style={styles.coverWrap}>
          <Image
            source={{ uri: item.imageUrl || undefined }}
            style={styles.coverImage}
            contentFit="cover"
            transition={HOME_IMAGE_TRANSITION_MS}
            cachePolicy="memory-disk"
            recyclingKey={`${item.source}-${item.id}`}
          />
          <View pointerEvents="none" style={[styles.sourceBadge, styles[`${item.source}Badge`]]}>
            {item.source === "youtube" ? (
              <Ionicons name="logo-youtube" size={15} color="#FFFFFF" />
            ) : item.source === "jiosaavn" ? (
              <Image source={APP_BRAND_ICON} style={styles.badgeImage} contentFit="cover" />
            ) : (
              <Ionicons name="people" size={14} color="#10141a" />
            )}
          </View>
        </View>
        <Text style={styles.playlistTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.playlistMeta} numberOfLines={1}>
          {item.meta}
        </Text>
      </Pressable>
    ),
    [openPlaylist]
  );

  const renderSectionHeader = useCallback(
    (title: string, eyebrow?: string) => (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          {eyebrow ? (
            <Text style={styles.sectionEyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={() => openSearch(title)}>
          <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
    ),
    [openSearch]
  );

  const renderHomeSection = useCallback(
    ({ item, index }: { item: HomeSection; index: number }) => {
      if (item.type === "jump-back-in") {
        return (
          <View style={styles.section}>
            {renderSectionHeader(item.title)}
            <FlatList
              horizontal
              data={item.items}
              keyExtractor={(recent) => `jump-back-in-${recent.id}`}
              renderItem={renderRecentCard}
              ItemSeparatorComponent={renderRowSeparator}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rowContent}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "android"}
            />
          </View>
        );
      }

      if (item.type === "quick-picks") {
        return (
          <View style={styles.section}>
            <View style={styles.quickPickHeader}>
              <Text style={styles.sectionTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            {item.songs.length > 0 ? (
              <FlatList
                horizontal
                data={quickPickColumns}
                keyExtractor={(_, columnIndex) => `quick-picks-${columnIndex}`}
                renderItem={renderQuickPickColumn}
                ItemSeparatorComponent={renderQuickPickColumnSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                snapToInterval={quickPickColumnWidth + QUICK_PICK_COLUMN_GAP}
                decelerationRate="fast"
                snapToAlignment="start"
              />
            ) : (
              <FlatList
                horizontal
                data={QUICK_PICK_PLACEHOLDERS}
                keyExtractor={(placeholder) => `quick-pick-placeholder-${placeholder}`}
                renderItem={renderQuickPickPlaceholder}
                ItemSeparatorComponent={renderQuickPickColumnSeparator}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowContent}
                scrollEnabled={false}
              />
            )}
          </View>
        );
      }

      return (
        <>
          <View style={styles.section}>
            {renderSectionHeader(item.title, item.eyebrow)}
            <FlatList
              horizontal
              data={item.items}
              keyExtractor={(playlist) => `${item.id}-${playlist.source}-${playlist.id}`}
              renderItem={renderPlaylistCard}
              ItemSeparatorComponent={renderRowSeparator}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rowContent}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "android"}
            />
          </View>
          {index === INLINE_AD_SECTION_INDEX ? <AdMobBanner loadDelayMs={5000} /> : null}
        </>
      );
    },
    [
      quickPickColumnWidth,
      quickPickColumns,
      renderPlaylistCard,
      renderRecentCard,
      renderQuickPickColumn,
      renderQuickPickColumnSeparator,
      renderQuickPickPlaceholder,
      renderRowSeparator,
      renderSectionHeader,
    ]
  );

  const renderLoadingRows = useCallback(
    () => (
      <>
        {["Featured playlists for you", "Hello, Summer! ☀️🍉", "Romance Right Now"].map((title) => (
          <View key={title} style={styles.section}>
            {renderSectionHeader(title, getShelfEyebrow(title))}
            <FlatList
              horizontal
              data={PLACEHOLDER_ROW_ITEMS}
              keyExtractor={(placeholder) => `${title}-${placeholder}`}
              renderItem={renderPlaceholderCard}
              ItemSeparatorComponent={renderRowSeparator}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rowContent}
              scrollEnabled={false}
            />
          </View>
        ))}
      </>
    ),
    [renderPlaceholderCard, renderRowSeparator, renderSectionHeader]
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={Colors.primary}
        colors={[Colors.primary]}
        progressBackgroundColor="rgba(255,255,255,0.12)"
        progressViewOffset={topInset + HOME_BOOT_HEADER_HEIGHT}
      />
    ),
    [handleRefresh, refreshing, topInset]
  );

  const renderEmptyState = useCallback(() => {
    if (loading) return renderLoadingRows();

    const isNetworkIssue = feedState === "network";
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name={isNetworkIssue ? "cloud-offline-outline" : "musical-notes-outline"}
              size={22}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {isNetworkIssue ? "Fresh music is taking longer" : "Home is warming up"}
          </Text>
          <Text style={styles.emptyText}>
            {isNetworkIssue
              ? "Retry the YouTube Music and JioSaavn feed or jump into search."
              : "Retry the feed or search for music directly."}
          </Text>
          <View style={styles.emptyActions}>
            <Pressable
              style={[styles.emptyAction, styles.emptyActionPrimary]}
              onPress={() => {
                void handleRefresh();
              }}
            >
              <Ionicons name="refresh" size={16} color={Colors.black} />
              <Text style={styles.emptyActionPrimaryText}>Try Again</Text>
            </Pressable>
            <Pressable
              style={[styles.emptyAction, styles.emptyActionSecondary]}
              onPress={() => openSearch("trending songs India")}
            >
              <Ionicons name="search" size={16} color={Colors.text} />
              <Text style={styles.emptyActionSecondaryText}>Search</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }, [feedState, handleRefresh, loading, openSearch, renderLoadingRows]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleHeaderScroll(event);
    },
    [handleHeaderScroll]
  );

  const headerElement = useMemo(
    () => (
      <>
        <View style={styles.chipWrap}>
          <FlatList
            horizontal
            data={MOOD_CHIPS}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable style={styles.moodChip} onPress={() => openSearch(item)}>
                <Text style={styles.moodChipText}>{item}</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipContent}
          />
        </View>
        <PromotionBanner />
        <AppPromotionModal />
      </>
    ),
    [openSearch]
  );

  if (!isOnline && !isChecking && sections.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <OfflineScreen message="Connect to the internet to discover music." />
      </View>
    );
  }

  if (loading && sections.length === 0) {
    return (
      <View style={styles.container}>
        <HomeBootSurface />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["rgba(38,225,154,0.22)", "rgba(24,160,251,0.12)", "rgba(16,20,26,0)"]}
        locations={[0, 0.62, 1]}
        style={styles.headerGlow}
      />
      {!isOnline && <OfflineBanner />}
      <FlatList
        data={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderHomeSection}
        refreshControl={refreshControl}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInset + HOME_BOOT_HEADER_HEIGHT + 10 },
          sections.length === 0 && styles.listContentEmpty,
        ]}
        ListHeaderComponent={headerElement}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        windowSize={6}
        removeClippedSubviews={Platform.OS === "android"}
      />
      <AppTopHeader
        topInset={topInset}
        elevated={isHeaderElevated}
        title="Mavrixfy"
        left={<AppTopHeaderProfileButton />}
        right={
          <Pressable
            hitSlop={8}
            onPress={() => {
              void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
              routerPush("/notifications");
            }}
          >
            <View style={styles.notificationBellIconWrap}>
              <Ionicons name="notifications-outline" size={24} color="#F8FBF9" />
              {unreadNotifCount > 0 ? <View style={styles.notificationUnreadDot} /> : null}
            </View>
          </Pressable>
        }
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16,20,26,0)", "rgba(16,20,26,0.68)", Colors.background]}
        locations={[0, 0.66, 1]}
        style={styles.bottomOverlay}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 154,
    gap: 2,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  headerGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 460,
  },
  bootSurface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  bootGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  chipWrap: {
    paddingVertical: 10,
  },
  chipContent: {
    paddingHorizontal: 16,
  },
  moodChip: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  moodChipText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    marginTop: 22,
  },
  sectionHeader: {
    minHeight: 34,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  quickPickHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    color: "rgba(223,226,235,0.64)",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 29,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  rowContent: {
    paddingHorizontal: 16,
  },
  rowSeparator: {
    width: PLAYLIST_CARD_GAP,
  },
  recentCard: {
    width: RECENT_CARD_SIZE,
    height: RECENT_CARD_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  recentImage: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.surfaceLight,
  },
  recentLabelWrap: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
  },
  recentLabel: {
    color: "#FFFFFF",
    fontSize: 10.5,
    lineHeight: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0,
  },
  playlistCard: {
    width: PLAYLIST_CARD_SIZE,
  },
  coverWrap: {
    width: PLAYLIST_CARD_SIZE,
    height: PLAYLIST_CARD_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  coverImage: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.surfaceLight,
  },
  sourceBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  youtubeBadge: {
    backgroundColor: "rgba(220,38,38,0.96)",
  },
  jiosaavnBadge: {
    backgroundColor: "#10141a",
  },
  communityBadge: {
    backgroundColor: Colors.primary,
  },
  badgeImage: {
    width: "100%",
    height: "100%",
  },
  playlistTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 8,
  },
  playlistMeta: {
    color: "rgba(223,226,235,0.66)",
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  cardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
  quickPickColumn: {
    gap: 12,
  },
  quickPickRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
  },
  quickPickPress: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  quickPickCover: {
    width: 58,
    height: 58,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: Colors.surfaceLight,
  },
  quickPickInfo: {
    flex: 1,
    minWidth: 0,
  },
  quickPickTitle: {
    color: "#FFFFFF",
    fontSize: 15.5,
    lineHeight: 20,
    fontFamily: "Inter_700Bold",
  },
  quickPickArtist: {
    color: "rgba(223,226,235,0.66)",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  quickPickMore: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  placeholderBlock: {
    backgroundColor: Colors.surfaceLight,
  },
  placeholderLine: {
    marginTop: 8,
    borderRadius: 4,
    backgroundColor: "rgba(223,226,235,0.2)",
  },
  placeholderTitle: {
    width: 128,
    height: 11,
  },
  placeholderMeta: {
    width: 84,
    height: 9,
    marginTop: 6,
    opacity: 0.75,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 28,
  },
  emptyCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(38,225,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 19,
    lineHeight: 25,
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    marginTop: 8,
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  emptyActions: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  emptyAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
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
  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 132,
  },
});
