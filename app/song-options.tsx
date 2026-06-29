import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import DownloadButton from "@/components/DownloadButton";
import { showGlobalToast } from "@/app/_layout";
import { usePlayerActions } from "@/contexts/PlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Song, getBestImageUrl } from "@/lib/musicData";
import { isYouTubeBackedSong } from "@/lib/downloads/sourceGuards";
import { addSongToPlaylist, getUserPlaylists, removeSongFromPlaylist, UserPlaylist } from "@/lib/storage";
import {
  getUserFirestorePlaylists,
  addSongToFirestorePlaylist,
  removeSongFromFirestorePlaylist,
  FirestorePlaylist,
} from "@/lib/firestore";
import { searchArtists } from "@/lib/artistService";
import { safeGoBack } from "@/utils/navigation";
import { compactMap } from "@/lib/arrayUtils";

type MenuIconName = React.ComponentProps<typeof Ionicons>["name"];
type SubView = "main" | "add-to-playlist" | "go-to-artists" | "song-credits" | "mavrixfy-code";
type SongOptionMenuItem = {
  label: string;
  icon: MenuIconName;
  chevron?: boolean;
  onPress: () => void;
};

const SHEET_BACKGROUND = "#1E1E1E";
const HANDLE_COLOR = "#6D6D6D";

function parseSongParam(value: string | string[] | undefined): Song | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Song>;
    if (!parsed.id || !parsed.title) return null;
    return {
      id: parsed.id,
      title: parsed.title,
      artist: parsed.artist || "Unknown Artist",
      album: parsed.album || "",
      duration: parsed.duration || 0,
      coverUrl: parsed.coverUrl || "",
      genre: parsed.genre || "",
      audioUrl: parsed.audioUrl || "",
      downloadUrl: parsed.downloadUrl,
      year: parsed.year,
      language: parsed.language,
      source: parsed.source,
      playCount: parsed.playCount,
      videoId: parsed.videoId,
      youtubeVideoId: parsed.youtubeVideoId,
      youtubeVisualVideoId: parsed.youtubeVisualVideoId,
      youtubeVideoType: parsed.youtubeVideoType,
    };
  } catch {
    return null;
  }
}

// ─── Shared sub-view header with back button ──────────────────────────────────
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.subHeader, pressed && styles.rowPressed]}
      onPress={onBack}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={22} color="#BDBDBD" />
      <Text style={styles.subHeaderTitle}>{title}</Text>
    </Pressable>
  );
}

// ─── Sub-view: Add to playlist ────────────────────────────────────────────────
type MergedPlaylist = UserPlaylist & { isFirestore?: boolean };

function AddToPlaylistRow({
  playlist,
  addingId,
  onAdd,
}: {
  playlist: MergedPlaylist;
  addingId: string | null;
  onAdd: (playlist: MergedPlaylist) => Promise<void>;
}) {
  const isAdding = addingId === playlist.id;
  const handlePress = useCallback(() => {
    void onAdd(playlist);
  }, [onAdd, playlist]);

  return (
    <Pressable
      style={({ pressed }) => [styles.playlistRow, pressed && styles.rowPressed]}
      onPress={handlePress}
      disabled={isAdding}
    >
      {playlist.coverUrl ? (
        <Image source={{ uri: playlist.coverUrl }} style={styles.playlistThumb} contentFit="cover" />
      ) : (
        <View style={[styles.playlistThumb, styles.playlistThumbFallback]}>
          <Ionicons name="musical-notes" size={18} color="#777" />
        </View>
      )}
      <View style={styles.playlistInfo}>
        <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
        <Text style={styles.playlistCount}>
          {playlist.songs?.length ?? 0} {playlist.songs?.length === 1 ? "song" : "songs"}
        </Text>
      </View>
      {isAdding ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
      )}
    </Pressable>
  );
}

function ArtistNameOptionRow({
  name,
  searching,
  onPress,
}: {
  name: string;
  searching: string | null;
  onPress: (name: string) => void;
}) {
  const isSearching = searching === name;
  const handlePress = useCallback(() => onPress(name), [name, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
      onPress={handlePress}
      disabled={isSearching}
    >
      <View style={styles.artistIcon}>
        <Ionicons name="person-outline" size={22} color="#BDBDBD" />
      </View>
      <Text style={styles.menuText} numberOfLines={1}>{name}</Text>
      {isSearching ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color="#555" />
      )}
    </Pressable>
  );
}

function SongCreditRow({ row }: { row: { label: string; value: string } }) {
  return (
    <View style={styles.creditRow}>
      <Text style={styles.creditLabel}>{row.label}</Text>
      <Text style={styles.creditValue} selectable>{row.value}</Text>
    </View>
  );
}

function MainMenuOptionRow({ item }: { item: SongOptionMenuItem }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.rowPressed]}
      onPress={item.onPress}
    >
      <Ionicons name={item.icon} size={24} color="#BDBDBD" style={styles.menuIcon} />
      <Text style={styles.menuText} numberOfLines={2}>{item.label}</Text>
      {item.chevron ? <Ionicons name="chevron-forward" size={22} color="#BDBDBD" /> : null}
    </Pressable>
  );
}

function renderMainMenuOption({ item }: { item: SongOptionMenuItem }) {
  return <MainMenuOptionRow item={item} />;
}

function AddToPlaylistView({
  song,
  onBack,
  bottomPad,
  userId,
}: {
  song: Song;
  onBack: () => void;
  bottomPad: number;
  userId: string | null;
}) {
  const [playlists, setPlaylists] = useState<MergedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const playlistBottomPad = Math.max(bottomPad + 72, 104);
  const startPlaylistLoad = useCallback(() => {
    setLoading(true);
  }, []);
  const finishPlaylistLoad = useCallback((items: MergedPlaylist[]) => {
    setPlaylists(items);
    setLoading(false);
  }, []);

  const loadPlaylists = useCallback(async () => {
    startPlaylistLoad();
    try {
      const local = await getUserPlaylists();
      const localMerged: MergedPlaylist[] = local.map((p) => ({
        ...p,
        isFirestore: false,
        coverUrl: p.coverUrl || p.songs?.[0]?.coverUrl || "",
      }));

      if (!userId) {
        finishPlaylistLoad(localMerged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        return;
      }

      const firestoreRaw = await getUserFirestorePlaylists(userId);
      const firestoreIds = new Set(firestoreRaw.map((fp: FirestorePlaylist) => fp.id));

      const firestoreMerged: MergedPlaylist[] = firestoreRaw.map(
        (fp: FirestorePlaylist): MergedPlaylist => ({
          id: fp.id,
          name: fp.name,
          description: fp.description || "",
          coverUrl: fp.imageUrl || (fp.songs?.[0] as any)?.imageUrl || "",
          songs: (fp.songs || []).map((fs: any) => ({
            id: fs.id,
            title: fs.title,
            artist: fs.artist,
            coverUrl: fs.imageUrl || "",
            audioUrl: fs.audioUrl || "",
            duration: fs.duration || 0,
            album: fs.album || "",
            genre: "",
          })),
          createdAt: 0,
          updatedAt: 0,
          isFirestore: true,
        })
      );

      const localOnly = localMerged.filter((p) => !firestoreIds.has(p.id));
      const merged = [...firestoreMerged, ...localOnly].sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );
      finishPlaylistLoad(merged);
    } catch {
      try {
        const local = await getUserPlaylists();
        finishPlaylistLoad(local.map((p) => ({ ...p, isFirestore: false })));
      } catch {
        finishPlaylistLoad([]);
      }
    }
  }, [finishPlaylistLoad, startPlaylistLoad, userId]);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const handleAdd = useCallback(
    async (playlist: MergedPlaylist) => {
      setAdding(playlist.id);
      try {
        let added: boolean;
        if (playlist.isFirestore) {
          added = await addSongToFirestorePlaylist(playlist.id, song);
        } else {
          added = await addSongToPlaylist(playlist.id, song);
        }
        showGlobalToast(added ? `Added to ${playlist.name}` : "Already in this playlist");
        onBack();
      } catch {
        showGlobalToast("Failed to add to playlist");
      } finally {
        setAdding(null);
      }
    },
    [song, onBack]
  );

  const renderPlaylist = useCallback(
    ({ item }: { item: MergedPlaylist }) => (
      <AddToPlaylistRow playlist={item} addingId={adding} onAdd={handleAdd} />
    ),
    [adding, handleAdd]
  );

  return (
    <View style={styles.subView}>
      <SubHeader title="Add to playlist" onBack={onBack} />
      <View style={styles.divider} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : playlists.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="musical-notes-outline" size={40} color="#555" />
          <Text style={styles.emptyMsg}>No playlists yet</Text>
          <Text style={styles.emptyHint}>Create a playlist from Library first</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          style={styles.playlistList}
          contentContainerStyle={styles.playlistListContent}
          showsVerticalScrollIndicator
          scrollIndicatorInsets={{ bottom: bottomPad }}
          contentInsetAdjustmentBehavior="never"
          nestedScrollEnabled
          bounces={false}
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          ListFooterComponent={<View style={[styles.playlistFooter, { height: playlistBottomPad }]} />}
          renderItem={renderPlaylist}
        />
      )}
    </View>
  );
}

// ─── Sub-view: Go to artists ──────────────────────────────────────────────────
function GoToArtistsView({ song, onBack, bottomPad }: { song: Song; onBack: () => void; bottomPad: number }) {
  const [searching, setSearching] = useState<string | null>(null);

  const artists = useMemo(
    () => compactMap((song.artist || "").split(","), (a) => a.trim()),
    [song.artist]
  );

  const handleArtist = useCallback(async (artistName: string) => {
    setSearching(artistName);
    try {
      const results = await searchArtists(artistName);
      const artist = results[0];
      if (!artist?.id) {
        showGlobalToast("Could not find this artist");
        return;
      }
      const image = artist.image?.length ? getBestImageUrl(artist.image) : "";
      safeGoBack();
      setTimeout(() => {
        router.push({
          pathname: "/artist/[id]",
          params: { id: artist.id, name: artist.name || artistName, image },
        });
      }, 180);
    } catch {
      showGlobalToast("Could not find this artist");
    } finally {
      setSearching(null);
    }
  }, []);

  const renderArtistName = useCallback(
    ({ item }: { item: string }) => (
      <ArtistNameOptionRow name={item} searching={searching} onPress={handleArtist} />
    ),
    [handleArtist, searching]
  );

  return (
    <View style={styles.subView}>
      <SubHeader title="Go to artists" onBack={onBack} />
      <View style={styles.divider} />
      <FlatList
        data={artists}
        keyExtractor={(name) => name}
        renderItem={renderArtistName}
        style={styles.menu}
        contentContainerStyle={[styles.menuContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyMsg}>No artist info available</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Sub-view: Song credits ───────────────────────────────────────────────────
function SongCreditsView({ song, onBack, bottomPad }: { song: Song; onBack: () => void; bottomPad: number }) {
  const rows = useMemo(() => [
    { label: "Title",    value: song.title || "Unknown" },
    { label: "Artist",   value: song.artist || "Unknown Artist" },
    song.album    ? { label: "Album",    value: song.album }           : null,
    song.year     ? { label: "Year",     value: String(song.year) }    : null,
    song.genre    ? { label: "Genre",    value: song.genre }           : null,
    song.language ? { label: "Language", value: song.language }        : null,
    song.duration ? { label: "Duration", value: formatDuration(song.duration) } : null,
  ].filter(Boolean) as { label: string; value: string }[], [song]);
  const renderCredit = useCallback(
    ({ item }: { item: { label: string; value: string } }) => <SongCreditRow row={item} />,
    []
  );

  return (
    <View style={styles.subView}>
      <SubHeader title="Song credits" onBack={onBack} />
      <View style={styles.divider} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.label}
        renderItem={renderCredit}
        style={styles.menu}
        contentContainerStyle={[styles.menuContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Sub-view: Mavrixfy Code ──────────────────────────────────────────────────
function MavrixfyCodeView({ song, onBack }: { song: Song; onBack: () => void }) {
  return (
    <View style={styles.subView}>
      <SubHeader title="Mavrixfy Code" onBack={onBack} />
      <View style={styles.divider} />
      <View style={styles.centered}>
        <View style={styles.codeBox}>
          <Ionicons name="barcode-outline" size={72} color={Colors.primary} />
          <Text style={styles.codeTitle}>{song.title}</Text>
          <Text style={styles.codeId} selectable>{song.id}</Text>
          <Text style={styles.codeHint}>Long-press the ID to copy</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

// ─── Shared sheet wrapper ─────────────────────────────────────────────────────
function SheetWrap({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={styles.sheet}>
        <View style={styles.grabberRow}>
          <View style={styles.grabber} />
        </View>
        <View style={styles.subViewContainer}>
          {children}
        </View>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SongOptionsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    song?: string;
    showDownload?: string;
    canRemove?: string;
    optionContext?: string;
    playlistId?: string;
    playlistSource?: string;
    playlistName?: string;
  }>();
  const { toggleLike, isLiked, addToQueue, playNext } = usePlayerActions();
  const { user } = useAuth();
  const [subView, setSubView] = useState<SubView>("main");

  const song = useMemo(() => parseSongParam(params.song), [params.song]);
  const showDownload = params.showDownload !== "0";
  const canShowDownload =
    showDownload &&
    Boolean(song) &&
    !isYouTubeBackedSong(song);
  const canRemove = params.canRemove === "1";
  const optionContext = Array.isArray(params.optionContext) ? params.optionContext[0] : params.optionContext;
  const playlistIdParam = Array.isArray(params.playlistId) ? params.playlistId[0] : params.playlistId;
  const playlistSourceParam = Array.isArray(params.playlistSource) ? params.playlistSource[0] : params.playlistSource;
  const playlistNameParam = Array.isArray(params.playlistName) ? params.playlistName[0] : params.playlistName;
  const isPlaylistContext = optionContext === "playlist" && Boolean(playlistIdParam);
  const userId = user?.id ?? null;

  // Recompute liked on every render so toggling reflects immediately
  const liked = song ? isLiked(song.id) : false;

  const bottomPad = Math.max(insets.bottom + 8, 20);
  const androidSheetSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS === "android")
        .runOnJS(true)
        .onEnd((event) => {
          const isDownwardSwipe =
            event.translationY > 80 ||
            (event.translationY > 40 && event.velocityY > 500);
          const isMostlyVertical = Math.abs(event.translationY) > Math.abs(event.translationX) * 1.5;
          if (isDownwardSwipe && isMostlyVertical) {
            safeGoBack();
          }
        }),
    []
  );

  const closeThen = useCallback((action: () => void | Promise<void>) => {
    safeGoBack();
    setTimeout(() => void action(), 180);
  }, []);

  const handleShare = useCallback(async () => {
    if (!song) return;
    await Share.share({
      title: song.title,
      message: `${song.title} - ${song.artist || "Unknown Artist"}`,
      url: song.audioUrl || undefined,
    });
  }, [song]);

  const handleGoToAlbum = useCallback(() => {
    if (!song) return;
    const query = [song.album, song.artist].filter(Boolean).join(" ");
    if (!query) {
      showGlobalToast("Album info not available");
      return;
    }
    safeGoBack();
    setTimeout(() => {
      router.push({ pathname: "/(tabs)/search", params: { q: query } });
    }, 180);
  }, [song]);

  const handleRemoveFromPlaylist = useCallback(async () => {
    if (!song || !playlistIdParam) {
      safeGoBack();
      return;
    }

    try {
      let removed = true;
      if (playlistSourceParam === "firestore") {
        removed = await removeSongFromFirestorePlaylist(playlistIdParam, song.id);
      } else {
        await removeSongFromPlaylist(playlistIdParam, song.id);
      }

      if (!removed) {
        showGlobalToast("Could not remove from playlist");
        return;
      }

      DeviceEventEmitter.emit("PlaylistSongRemoved", {
        playlistId: playlistIdParam,
        songId: song.id,
      });
      showGlobalToast(
        playlistNameParam ? `Removed from ${playlistNameParam}` : "Removed from playlist"
      );
      safeGoBack();
    } catch {
      showGlobalToast("Could not remove from playlist");
    }
  }, [playlistIdParam, playlistNameParam, playlistSourceParam, song]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!song) {
    return (
      <SheetWrap>
        <View style={styles.centered}>
          <Text style={styles.emptyMsg}>Song unavailable</Text>
          <Pressable style={styles.closeButton} onPress={safeGoBack}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </SheetWrap>
    );
  }

  // ── Sub-views ────────────────────────────────────────────────────────────
  if (subView === "add-to-playlist") {
    return (
      <SheetWrap>
        <AddToPlaylistView song={song} onBack={() => setSubView("main")} bottomPad={bottomPad} userId={userId} />
      </SheetWrap>
    );
  }
  if (subView === "go-to-artists") {
    return (
      <SheetWrap>
        <GoToArtistsView song={song} onBack={() => setSubView("main")} bottomPad={bottomPad} />
      </SheetWrap>
    );
  }
  if (subView === "song-credits") {
    return (
      <SheetWrap>
        <SongCreditsView song={song} onBack={() => setSubView("main")} bottomPad={bottomPad} />
      </SheetWrap>
    );
  }
  if (subView === "mavrixfy-code") {
    return (
      <SheetWrap>
        <MavrixfyCodeView song={song} onBack={() => setSubView("main")} />
      </SheetWrap>
    );
  }

  // ── Main menu ────────────────────────────────────────────────────────────
  const menuItems: SongOptionMenuItem[] = [
    {
      label: "Share",
      icon: "share-outline",
      onPress: () => closeThen(handleShare),
    },
    {
      label: "Add to playlist",
      icon: "add-circle-outline",
      chevron: true,
      onPress: () => setSubView("add-to-playlist"),
    },
    {
      label: liked ? "Remove from Liked Songs" : "Add to Liked Songs",
      icon: liked ? "heart-dislike-outline" : "heart-outline",
      onPress: () => closeThen(() => toggleLike(song)),
    },
    {
      label: "Play next",
      icon: "play-skip-forward-outline",
      onPress: () => closeThen(() => {
        playNext(song);
        showGlobalToast("Will play next");
      }),
    },
    {
      label: "Add to Queue",
      icon: "list-outline",
      onPress: () => closeThen(() => {
        addToQueue(song);
        showGlobalToast("Added to queue");
      }),
    },
    {
      label: "Go to album",
      icon: "disc-outline",
      onPress: handleGoToAlbum,
    },
    {
      label: "Go to artists",
      icon: "person-outline",
      chevron: true,
      onPress: () => setSubView("go-to-artists"),
    },
    {
      label: "Go to artists concerts",
      icon: "ticket-outline",
      chevron: true,
      onPress: () => showGlobalToast("Concerts are not available yet"),
    },
    {
      label: "View song credits",
      icon: "musical-notes-outline",
      chevron: true,
      onPress: () => setSubView("song-credits"),
    },
    {
      label: "Show Mavrixfy Code",
      icon: "barcode-outline",
      chevron: true,
      onPress: () => setSubView("mavrixfy-code"),
    },
  ];

  // "Remove from playlist" only shown when opened from a playlist context
  if (canRemove) {
    menuItems.splice(2, 0, {
      label: isPlaylistContext ? "Remove from this playlist" : "Remove from playlist",
      icon: "remove-circle-outline",
      onPress: isPlaylistContext ? () => void handleRemoveFromPlaylist() : safeGoBack,
    });
  }

  return (
    <View style={styles.root}>
      <View style={styles.sheet}>
        {/* Grabber + song header */}
        <GestureDetector gesture={androidSheetSwipeGesture}>
          <View style={styles.headerContent}>
            <View style={styles.grabber} />
            <View style={styles.songHeader}>
              {song.coverUrl ? (
                <Image
                  recyclingKey={`options-${song.id}`}
                  source={{ uri: song.coverUrl }}
                  style={styles.artwork}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.artwork, styles.artworkFallback]}>
                  <Ionicons name="musical-note" size={22} color="#AFAFAF" />
                </View>
              )}
              <View style={styles.songText}>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={styles.songSubtitle} numberOfLines={1}>
                  {song.artist || "Unknown Artist"}
                  {song.album ? ` • ${song.album}` : ""}
                </Text>
              </View>
            </View>
          </View>
        </GestureDetector>

        <View style={styles.divider} />

        <FlatList
          data={menuItems}
          keyExtractor={(item) => item.label}
          renderItem={renderMainMenuOption}
          style={styles.menu}
          contentContainerStyle={[styles.menuContent, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          ListHeaderComponent={
            canShowDownload ? (
              <DownloadButton song={song} size={22} showLabel={true} />
            ) : null
          }
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHEET_BACKGROUND,
  },
  sheet: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: SHEET_BACKGROUND,
  },

  // Grabber used by SheetWrap (sub-views)
  grabberRow: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  // Container that fills remaining space after grabber in SheetWrap
  subViewContainer: {
    flex: 1,
    minHeight: 0,
  },

  // Grabber used inline in main header
  headerContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: HANDLE_COLOR,
  },
  songHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  artwork: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: "#2A2A2A",
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  songText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  songTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  songSubtitle: {
    marginTop: 2,
    color: "#BDBDBD",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  menu: {
    flex: 1,
    minHeight: 0,
  },
  menuContent: {
    paddingTop: 8,
    paddingHorizontal: 18,
  },
  menuRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
  },
  rowPressed: {
    opacity: 0.62,
  },
  menuIcon: {
    width: 32,
    marginRight: 14,
  },
  menuText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },

  // ── Sub-views ──────────────────────────────────────────────────────────────
  subView: {
    flex: 1,
    minHeight: 0,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 4,
  },
  subHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },

  // Add to playlist
  playlistListContent: {
    paddingTop: 6,
    paddingHorizontal: 16,
  },
  playlistFooter: {
    width: 1,
  },
  playlistList: {
    flex: 1,
    minHeight: 0,
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  playlistThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 14,
    backgroundColor: "#2A2A2A",
  },
  playlistThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  playlistInfo: {
    flex: 1,
    minWidth: 0,
  },
  playlistName: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  playlistCount: {
    color: "#888",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  // Go to artists
  artistIcon: {
    width: 32,
    marginRight: 14,
    alignItems: "center",
  },

  // Song credits
  creditRow: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  creditLabel: {
    color: "#888",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  creditValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  // Mavrixfy Code
  codeBox: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  codeTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  codeId: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    letterSpacing: 0.4,
  },
  codeHint: {
    color: "#666",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  // Centered / empty states
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyMsg: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  emptyHint: {
    color: "#888",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  closeButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  closeButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
