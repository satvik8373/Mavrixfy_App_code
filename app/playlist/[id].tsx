import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  ActivityIndicator,
  Easing,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  Alert,
  DeviceEventEmitter,
  useWindowDimensions
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import {
  Song,
  convertJioSaavnSong,
  formatDuration,
  getBestImageUrl,
  JioSaavnSong,
} from "@/lib/musicData";

import { usePlayerActions } from "@/contexts/PlayerContext";
import { usePlaybackNowPlaying, usePlaybackPlayState } from "@/lib/playbackEngine";
import { getUserPlaylists, updateUserPlaylist, deleteUserPlaylist, UserPlaylist } from "@/lib/storage";
import { firestorePlaylistToLocalSongs, getPlaylistById, updateFirestorePlaylist, deleteFirestorePlaylist } from "@/lib/firestore";
import { getCachedHomePublicPlaylists } from "@/lib/homeCache";
import { sortedCopy } from "@/lib/arrayUtils";
import SongRow from "@/components/SongRow";
import SongRowSkeleton from "@/components/SongRowSkeleton";
import { getJioSaavnAlbumDetails, getJioSaavnPlaylistDetails } from "@/lib/jioSaavnService";
import {
  getYouTubeMusicPlaylist,
  getYouTubeMusicAlbum,
  convertYouTubeMusicTrack,
  getBestYouTubeThumbnailUrl,
  normalizeYouTubeArtworkUrl,
} from "@/lib/youtubeMusicService";
import { useAuth } from "@/contexts/AuthContext";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import DownloadCollectionButton from "@/components/DownloadCollectionButton";
import OfflineBanner from "@/components/OfflineBanner";
import { useNetwork } from "@/contexts/NetworkContext";

const subscribeToPlaylistSongRemoved = (
  listener: (event: { playlistId?: string; songId?: string }) => void
) => {
  const subscription = DeviceEventEmitter.addListener("PlaylistSongRemoved", listener);
  return () => subscription.remove();
};

function pickFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const AUTO_RETRY_ATTEMPTS = 3;
const AUTO_RETRY_DELAY_MS = [350, 900];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PlaylistScreen() {
  return usePlaylistScreenView();
}

function usePlaylistScreenView() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    jiosaavn?: string | string[];
    youtube?: string | string[];
    album?: string | string[];
    link?: string | string[];
    firestore?: string | string[];
    title?: string | string[];
    description?: string | string[];
    cover?: string | string[];
    songCount?: string | string[];
  }>();

  const playlistId       = pickFirstParam(params.id).trim();
  const isAlbumSource    = pickFirstParam(params.album) === "true";
  const isYouTubeSource  = pickFirstParam(params.youtube) === "true";
  const isJioSaavnSource = (pickFirstParam(params.jiosaavn) === "true" || isAlbumSource) && !isYouTubeSource;
  const isFirestoreSource = pickFirstParam(params.firestore) === "true";
  const sourceLink       = pickFirstParam(params.link).trim();
  const initialTitle     = pickFirstParam(params.title).trim();
  const initialCover     = pickFirstParam(params.cover).trim();
  const normalizedInitialCover = isYouTubeSource ? normalizeYouTubeArtworkUrl(initialCover) : initialCover;
  const initialDescription = pickFirstParam(params.description).trim();
  const initialSongCount = Math.max(0, Number(pickFirstParam(params.songCount)) || 0);
  const hasPrefilledHeader = initialTitle.length > 0 || initialCover.length > 0 || initialSongCount > 0;

  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const { currentSong, queue } = usePlaybackNowPlaying();
  const { isPlaying } = usePlaybackPlayState();
  const { playSong, togglePlay } = usePlayerActions();
  const topInset  = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 132 : Math.max(150, insets.bottom + 126);

  const contentContainerStyle = useMemo(() => ({
    paddingBottom: bottomPad
  }), [bottomPad]);

  const scrollIndicatorInsets = useMemo(() => ({
    bottom: bottomPad
  }), [bottomPad]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(true);
  const [playlistName, setPlaylistName] = useState(initialTitle);
  const [playlistCover, setPlaylistCover] = useState(normalizedInitialCover);
  const [playlistDescription, setPlaylistDescription] = useState(
    initialDescription || (initialSongCount > 0 ? `${initialSongCount} songs` : "")
  );
  const [songs, setSongs]       = useState<Song[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [playlistIsPublic, setPlaylistIsPublic] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCover, setEditCover] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Sticky header
  const stickyOpacityRef = useRef<Animated.Value | null>(null);
  if (stickyOpacityRef.current === null) stickyOpacityRef.current = new Animated.Value(0);
  const stickyOpacity = stickyOpacityRef.current;
  const [isStickyVisible, setIsStickyVisible] = useState(false);

  // Bottom sheet animation
  const { height: screenHeight } = useWindowDimensions();
  const modalTranslateYRef = useRef<Animated.Value | null>(null);
  if (modalTranslateYRef.current === null) modalTranslateYRef.current = new Animated.Value(screenHeight);
  const modalTranslateY = modalTranslateYRef.current;
  const modalOpacityRef = useRef<Animated.Value | null>(null);
  if (modalOpacityRef.current === null) modalOpacityRef.current = new Animated.Value(0);
  const modalOpacity = modalOpacityRef.current;

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalDuration = useMemo(() => songs.reduce((a, s) => a + s.duration, 0), [songs]);
  const totalDurationLabel = totalDuration > 0 ? formatDuration(totalDuration) : "";
  const totalMinutes = useMemo(() => Math.max(0, Math.floor(totalDuration / 60)), [totalDuration]);
  const effectiveSongCount = songs.length > 0 ? songs.length : initialSongCount;
  const collectionKind = isAlbumSource ? "Album" : "Playlist";
  const collectionKindLower = isAlbumSource ? "album" : "playlist";
  const downloadCollectionId = isAlbumSource ? `album:${playlistId}` : playlistId;

  const isPlayingFromThisPlaylist = useMemo(() => {
    if (!currentSong || songs.length === 0) return false;
    return songs.some((s) => s.id === currentSong.id) &&
      queue.length === songs.length &&
      queue.every((q, i) => q.id === songs[i]?.id);
  }, [currentSong, queue, songs]);

  const playlistTitleSize = useMemo(() => {
    const len = playlistName.trim().length;
    if (len <= 16) return 34;
    if (len <= 32) return 28;
    if (len <= 48) return 23;
    return 20;
  }, [playlistName]);

  const canRemoveSongsFromPlaylist = !isJioSaavnSource && !isYouTubeSource && (!isFirestoreSource || Boolean(user?.id));
  const playlistRowSource = isFirestoreSource ? "firestore" : "local";

  useEffect(() => {
    return subscribeToPlaylistSongRemoved(
      (event: { playlistId?: string; songId?: string }) => {
        if (event?.playlistId !== playlistId || !event.songId) return;
        setSongs((prev) => prev.filter((song) => song.id !== event.songId));
      }
    );
  }, [playlistId]);

  // ── Normalizers ────────────────────────────────────────────────────────────
  const normalizeLoadedSongs = useCallback((rawSongs: JioSaavnSong[]): Song[] => {
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const song of rawSongs.map(convertJioSaavnSong)) {
      const id = String(song.id || "").trim();
      const title = String(song.title || "").trim();
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...song, id, title, audioUrl: String(song.audioUrl || "").trim() });
    }
    const playable = out.filter((s) => s.audioUrl.length > 0);
    return playable.length > 0 ? playable : out;
  }, []);

  const applyJioPlaylistData = useCallback((data: {
    name?: string; description?: string; songCount?: number;
    image?: { quality: string; url: string }[] | string; songs?: JioSaavnSong[];
  }): number => {
    if (data.name) setPlaylistName(data.name);
    if (data.image) setPlaylistCover(Array.isArray(data.image) ? getBestImageUrl(data.image) : data.image);
    setPlaylistDescription((data.description || "").trim() || `${data.songCount || data.songs?.length || 0} songs`);
    const finalSongs = normalizeLoadedSongs(data.songs || []);
    if (finalSongs.length > 0) setSongs(finalSongs);
    return finalSongs.length;
  }, [normalizeLoadedSongs]);

  const applyFirestorePlaylistData = useCallback((playlist: {
    name?: string; description?: string; imageUrl?: string; songs?: Song[] | unknown[]; isPublic?: boolean;
  }) => {
    const nextSongs = firestorePlaylistToLocalSongs({
      id: playlistId,
      name: playlist.name || initialTitle || "Playlist",
      description: playlist.description || "",
      imageUrl: playlist.imageUrl || "",
      songs: Array.isArray(playlist.songs) ? playlist.songs : [],
      createdBy: { id: "", name: "Community" },
      isPublic: playlist.isPublic ?? false,
    });
    setPlaylistName(playlist.name || initialTitle || "Playlist");
    setPlaylistDescription((playlist.description || "").trim() || `${nextSongs.length || initialSongCount} songs`);
    setPlaylistCover(playlist.imageUrl || normalizedInitialCover || "");
    setPlaylistIsPublic(playlist.isPublic ?? false);
    setSongs(nextSongs);
  }, [initialSongCount, initialTitle, normalizedInitialCover, playlistId]);

  const resetPlaylistLoadState = useCallback(() => {
    setPlaylistName(initialTitle);
    setPlaylistDescription(initialDescription || (initialSongCount > 0 ? `${initialSongCount} songs` : ""));
    setPlaylistCover(normalizedInitialCover);
    setSongs([]);
    setNotFound(false);
    setLoadError("");
    setLoading(true);
  }, [initialDescription, initialSongCount, initialTitle, normalizedInitialCover]);

  const applyLocalPlaylistData = useCallback((playlist: UserPlaylist) => {
    setPlaylistName(playlist.name);
    setPlaylistDescription(playlist.description);
    setPlaylistCover(playlist.coverUrl);
    setSongs(playlist.songs);
  }, []);

  const markPlaylistNotFound = useCallback(() => {
    setNotFound(true);
  }, []);

  const markPlaylistLoadError = useCallback((message: string) => {
    setLoadError(message);
  }, []);

  const finishPlaylistLoad = useCallback(() => {
    setLoading(false);
  }, []);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!playlistId) { markPlaylistNotFound(); return; }

    resetPlaylistLoadState();

    const load = async () => {
      try {
        if (isFirestoreSource) {
          const playlist = await getPlaylistById(playlistId)
            ?? (await getCachedHomePublicPlaylists({ allowStale: true })).find((p) => p.id === playlistId);
          if (!cancelled) {
            if (playlist) applyFirestorePlaylistData(playlist);
            else if (!hasPrefilledHeader) markPlaylistNotFound();
            else markPlaylistLoadError("Playlist tracks could not load right now.");
          }
          return;
        }
        if (isYouTubeSource) {
          const data = isAlbumSource
            ? await getYouTubeMusicAlbum(playlistId)
            : await getYouTubeMusicPlaylist(playlistId);
          if (!cancelled) {
            if (data) {
              setPlaylistName(data.title);
              setPlaylistCover(getBestYouTubeThumbnailUrl(data.thumbnails) || normalizedInitialCover);
              const description = ("description" in data && typeof data.description === "string") ? data.description : `${data.trackCount || data.tracks?.length || 0} tracks`;
              setPlaylistDescription(description);
              const finalSongs = (data.tracks || [])
                .map(convertYouTubeMusicTrack)
                .filter((s): s is Song => s !== null);
              setSongs(finalSongs);
            } else if (!hasPrefilledHeader) {
              markPlaylistNotFound();
            } else {
              markPlaylistLoadError("YouTube Music tracks could not load right now.");
            }
          }
          return;
        }
        if (isJioSaavnSource) {
          const loadJioCollectionAttempt = async (attempt: number): Promise<number> => {
            try {
              const data = isAlbumSource
                ? await getJioSaavnAlbumDetails(playlistId, { link: sourceLink })
                : await getJioSaavnPlaylistDetails(playlistId, { link: sourceLink });
              if (!cancelled) {
                const loadedCount = applyJioPlaylistData(data);
                if (loadedCount > 0) {
                  return loadedCount;
                }
              }
            } catch {
              // Auto-retry below.
            }

            if (!cancelled && attempt < AUTO_RETRY_ATTEMPTS - 1) {
              const retryDelay = AUTO_RETRY_DELAY_MS[Math.min(attempt, AUTO_RETRY_DELAY_MS.length - 1)];
              return delay(retryDelay).then(() => (
                cancelled ? 0 : loadJioCollectionAttempt(attempt + 1)
              ));
            }

            return 0;
          };

          const loadedCount = await loadJioCollectionAttempt(0);
          if (!cancelled && loadedCount === 0) {
            if (!hasPrefilledHeader) markPlaylistNotFound();
            else markPlaylistLoadError("Songs are taking longer than expected to load.");
          }
          return;
        }
        const playlists = await getUserPlaylists();
        if (!cancelled) {
          const found = playlists.find((p) => p.id === playlistId);
          if (found) {
            applyLocalPlaylistData(found);
          } else if (!hasPrefilledHeader) {
            markPlaylistNotFound();
          } else {
            markPlaylistLoadError("Playlist tracks could not load right now.");
          }
        }
      } catch {
        if (cancelled) return;
        if (hasPrefilledHeader) markPlaylistLoadError("Songs could not load right now.");
        else markPlaylistNotFound();
      } finally {
        if (!cancelled) finishPlaylistLoad();
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [
    playlistId, isAlbumSource, isYouTubeSource, sourceLink, isFirestoreSource, isJioSaavnSource,
    applyFirestorePlaylistData, applyJioPlaylistData,
    applyLocalPlaylistData, finishPlaylistLoad,
    hasPrefilledHeader, markPlaylistLoadError, markPlaylistNotFound,
    normalizedInitialCover, resetPlaylistLoadState,
  ]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const shouldShow = y > 260;
    setIsStickyVisible((prev) => {
      if (prev === shouldShow) return prev;
      Animated.timing(stickyOpacity, {
        toValue: shouldShow ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }).start();
      return shouldShow;
    });
  }, [stickyOpacity]);

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlayingFromThisPlaylist) { togglePlay(); return; }
    playSong(songs[0], songs);
  }, [songs, isPlayingFromThisPlaylist, togglePlay, playSong]);

  const handleShufflePlay = useCallback(() => {
    if (!songs.length) return;
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shuffled = sortedCopy(songs, () => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  }, [songs, playSong]);

  // Edit handlers
  const handleOpenEdit = useCallback(() => {
    setEditName(playlistName);
    setEditDescription(playlistDescription);
    setEditCover(playlistCover);
    setEditIsPublic(playlistIsPublic);
    modalOpacity.setValue(0);
    modalTranslateY.setValue(screenHeight);
    setShowEditModal(true);
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
      Animated.spring(modalTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 30,
        stiffness: 360,
        mass: 0.78,
        overshootClamping: true,
      }),
    ]).start();
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [modalOpacity, modalTranslateY, playlistName, playlistDescription, playlistCover, playlistIsPublic, screenHeight]);

  const handlePickImage = useCallback(async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload images.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setEditCover(result.assets[0].uri);
        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image');
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setEditCover('');
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Playlist name cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      // Upload image to Cloudinary if it's a local URI
      let finalImageUrl = editCover;
      if (editCover && (editCover.startsWith('file://') || editCover.startsWith('content://'))) {
        try {
          setIsUploadingImage(true);
          finalImageUrl = await uploadImageToCloudinary(editCover, (progress) => {
            setUploadProgress(progress);
          });
          setIsUploadingImage(false);
          
          if (!finalImageUrl) {
            throw new Error('Failed to upload image');
          }
        } catch {
          setIsUploadingImage(false);
          Alert.alert("Upload Error", "Failed to upload image. Please try again.");
          setIsSaving(false);
          return;
        }
      }

      if (isFirestoreSource && user?.id) {
        await updateFirestorePlaylist(playlistId, {
          name: editName.trim(),
          description: editDescription.trim(),
          imageUrl: finalImageUrl.trim(),
          isPublic: editIsPublic,
        });
      } else {
        await updateUserPlaylist(playlistId, {
          name: editName.trim(),
          description: editDescription.trim(),
          coverUrl: finalImageUrl.trim(),
        });
      }

      setPlaylistName(editName.trim());
      setPlaylistDescription(editDescription.trim());
      setPlaylistCover(finalImageUrl.trim());
      setPlaylistIsPublic(editIsPublic);
      setShowEditModal(false);
      
      // Show success message
      Alert.alert("Success", "Playlist updated successfully");
      
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to update playlist");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  }, [editName, editDescription, editCover, editIsPublic, playlistId, isFirestoreSource, user?.id]);

  const handleDeletePlaylist = useCallback(() => {
    Alert.alert(
      "Delete Playlist",
      `Are you sure you want to delete "${playlistName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (isFirestoreSource && user?.id) {
                await deleteFirestorePlaylist(playlistId);
              } else {
                await deleteUserPlaylist(playlistId);
              }
              if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              safeGoBack();
            } catch {
              Alert.alert("Error", "Failed to delete playlist");
              if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]
    );
  }, [playlistName, playlistId, isFirestoreSource, user?.id]);

  const closeEditModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: screenHeight,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowEditModal(false);
      modalTranslateY.setValue(screenHeight);
    });
  }, [modalOpacity, modalTranslateY, screenHeight]);

  const snapEditModalOpen = useCallback(() => {
    Animated.parallel([
      Animated.spring(modalTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 30,
        stiffness: 360,
        mass: 0.78,
        overshootClamping: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
    ]).start();
  }, [modalOpacity, modalTranslateY]);

  const editModalPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        })
        .onUpdate((event) => {
          if (event.translationY > 0 && Math.abs(event.translationX) < Math.abs(event.translationY)) {
            modalTranslateY.setValue(event.translationY);
            const progress = Math.min(event.translationY / 200, 1);
            modalOpacity.setValue(1 - progress * 0.5);
          }
        })
        .onEnd((event) => {
          if (event.translationY > 120 || event.velocityY > 800) {
            if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            closeEditModal();
            return;
          }
          snapEditModalOpen();
        }),
    [closeEditModal, modalOpacity, modalTranslateY, snapEditModalOpen]
  );

  // Check if user can edit (only local or owned Firestore playlists)
  const canEdit = !isJioSaavnSource && (!isFirestoreSource || user?.id);
  const songsQueueKey = useMemo(() => songs.map((song) => song.id).join("|"), [songs]);
  const renderPlaylistSong = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow
        song={item}
        index={index}
        queue={songs}
        queueKey={songsQueueKey}
        optionContext={canRemoveSongsFromPlaylist ? "playlist" : undefined}
        playlistId={canRemoveSongsFromPlaylist ? playlistId : undefined}
        playlistSource={canRemoveSongsFromPlaylist ? playlistRowSource : undefined}
        playlistName={canRemoveSongsFromPlaylist ? playlistName : undefined}
      />
    ),
    [
      canRemoveSongsFromPlaylist,
      playlistId,
      playlistName,
      playlistRowSource,
      songs,
      songsQueueKey,
    ]
  );
  const playlistSongKeyExtractor = useCallback(
    (item: Song, index: number) => `${item.id}-${index}`,
    []
  );

  // Optimize FlatList item layout for better scrolling performance
  const getItemLayout = useCallback(
    (_data: ArrayLike<Song> | null | undefined, index: number) => ({
      length: 64, // Approximate height of SongRow
      offset: 64 * index,
      index,
    }),
    []
  );

  // ── Error / not-found screens ──────────────────────────────────────────────
  if (loading && !hasPrefilledHeader) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtnSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={safeGoBack} style={styles.backBtnSolo}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.center}>
          <Text style={styles.emptyText}>{collectionKind} not found</Text>
        </View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Slim offline banner — downloaded playlists still work offline */}
      {!isOnline && <OfflineBanner />}
      <FlatList
        data={loadError ? [] : songs}
        keyExtractor={playlistSongKeyExtractor}
        renderItem={renderPlaylistSong}
        getItemLayout={getItemLayout}
        contentContainerStyle={contentContainerStyle}
        scrollIndicatorInsets={scrollIndicatorInsets}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        removeClippedSubviews={true}
        ListHeaderComponent={
          <>
            {/* ── Hero — same pattern as artist page ── */}
            <View style={[styles.hero, { paddingTop: topInset + 8 }]}>
              {playlistCover ? (
                <Image
                  source={{ uri: playlistCover }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  contentPosition={{ left: "50%", top: "28%" }}
                  transition={120}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
                  <Ionicons name="musical-notes" size={72} color="rgba(255,255,255,0.15)" />
                </View>
              )}
              {/* Dark gradient — title readable on any cover */}
              <LinearGradient
                colors={["transparent", "rgba(16,20,26,0.55)", Colors.background]}
                locations={[0.25, 0.65, 1]}
                style={StyleSheet.absoluteFill}
              />
              {/* Back button */}
              <Pressable onPress={safeGoBack} style={[styles.heroBack, { top: topInset + 8 }]}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </Pressable>
              {/* Edit button - only for editable playlists */}
              {canEdit && (
                <Pressable onPress={handleOpenEdit} style={[styles.heroEdit, { top: topInset + 8 }]}>
                  <Ionicons name="create-outline" size={20} color="#fff" />
                </Pressable>
              )}
              {/* Info overlay */}
              <View style={styles.heroInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text
                    numberOfLines={3}
                    style={[styles.heroTitle, { fontSize: playlistTitleSize, flex: 1 }]}
                  >
                    {playlistName}
                  </Text>
                  {isFirestoreSource && (
                    <View style={[styles.visibilityBadge, playlistIsPublic ? styles.visibilityBadgePublic : styles.visibilityBadgePrivate]}>
                      <Ionicons 
                        name={playlistIsPublic ? "globe-outline" : "lock-closed-outline"} 
                        size={12} 
                        color="#fff" 
                      />
                      <Text style={styles.visibilityBadgeText}>
                        {playlistIsPublic ? "Public" : "Private"}
                      </Text>
                    </View>
                  )}
                </View>
                {playlistDescription && !/^\d+\s+songs?$/i.test(playlistDescription) ? (
                  <Text numberOfLines={1} style={styles.heroSub}>{playlistDescription}</Text>
                ) : null}
                <Text style={styles.heroMeta}>
                  {effectiveSongCount > 0 ? `${effectiveSongCount} songs` : ""}
                  {totalMinutes > 0 ? `  ·  ${totalMinutes} min` : ""}
                </Text>
                {/* Action buttons */}
                <View style={styles.heroActions}>
                  <Pressable style={styles.shuffleBtn} onPress={handleShufflePlay} disabled={!songs.length}>
                    <Ionicons name="shuffle" size={17} color={Colors.text} />
                    <Text style={styles.shuffleBtnText}>Shuffle</Text>
                  </Pressable>
                  <Pressable style={styles.playBtn} onPress={handlePlayAll} disabled={!songs.length}>
                    <Ionicons
                      name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
                      size={18}
                      color="#000"
                    />
                    <Text style={styles.playBtnText}>
                      {isPlayingFromThisPlaylist && isPlaying ? "Pause" : "Play All"}
                    </Text>
                  </Pressable>
                  {songs.length > 0 && (
                    <DownloadCollectionButton
                      songs={songs}
                      collectionId={downloadCollectionId}
                      collectionName={playlistName}
                      collectionImage={playlistCover}
                      collectionType={isAlbumSource ? "album" : "playlist"}
                      compact
                    />
                  )}
                </View>
              </View>
            </View>

            {/* ── Tracks header ── */}
            <View style={styles.tracksHeader}>
              <Text style={styles.tracksTitle}>Tracks</Text>
              {totalDurationLabel ? (
                <Text style={styles.tracksMeta}>{effectiveSongCount} · {totalDurationLabel}</Text>
              ) : null}
            </View>

            {loadError ? (
              <View style={styles.inlineWrap}>
                <Ionicons name="cloud-offline-outline" size={28} color={Colors.subtext} />
                <Text style={styles.inlineText}>{loadError}</Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loadError ? null : loading ? (
            <SongRowSkeleton count={Math.max(4, Math.min(initialSongCount || 8, 10))} />
          ) : (
            <View style={styles.inlineWrap}>
              <Text style={styles.inlineText}>No songs available in this {collectionKindLower}.</Text>
            </View>
          )
        }
      />

      {/* ── Sticky header — always mounted, fades in/out ── */}
      <Animated.View
        pointerEvents={isStickyVisible ? "auto" : "none"}
        style={[styles.sticky, { paddingTop: topInset, opacity: stickyOpacity }]}
      >
        <Pressable onPress={safeGoBack} style={styles.stickyBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stickyTitle} numberOfLines={1}>{playlistName}</Text>
        <Pressable style={styles.stickyPlay} onPress={handlePlayAll} disabled={!songs.length}>
          <Ionicons
            name={isPlayingFromThisPlaylist && isPlaying ? "pause" : "play"}
            size={14}
            color="#000"
          />
        </Pressable>
      </Animated.View>

      {/* ── Edit Modal ── */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="none"
        onRequestClose={closeEditModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              StyleSheet.absoluteFill,
              { 
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                opacity: modalOpacity,
              }
            ]}
          >
            <Pressable 
              style={StyleSheet.absoluteFill} 
              onPress={closeEditModal}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.modalBottomSheet,
              {
                transform: [{ translateY: modalTranslateY }],
              },
            ]}
          >
            <GestureDetector gesture={editModalPanGesture}>
              <View style={styles.modalDragHandle}>
                <View style={styles.modalDragIndicator} />
              </View>
            </GestureDetector>

            <ScrollView 
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.modalTitle}>Edit Playlist</Text>

              {/* Compact Cover Image Section */}
              <View style={styles.compactImageSection}>
                {editCover ? (
                  <View style={styles.compactImageContainer}>
                    <Image
                      source={{ uri: editCover }}
                      style={styles.compactImage}
                      contentFit="cover"
                    />
                    <View style={styles.compactImageOverlay}>
                      <Pressable
                        style={styles.compactImageButton}
                        onPress={handlePickImage}
                      >
                        <Ionicons name="camera" size={16} color="#fff" />
                      </Pressable>
                      <Pressable
                        style={[styles.compactImageButton, styles.compactImageButtonDanger]}
                        onPress={handleRemoveImage}
                      >
                        <Ionicons name="trash" size={16} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    style={styles.compactImagePlaceholder}
                    onPress={handlePickImage}
                  >
                    <Ionicons name="image" size={28} color={Colors.subtext} />
                    <Text style={styles.compactImagePlaceholderText}>Add Cover</Text>
                  </Pressable>
                )}

                {/* Playlist Info */}
                <View style={styles.compactInfoSection}>
                  <TextInput
                    style={styles.compactInput}
                    placeholder="Playlist name"
                    placeholderTextColor={Colors.subtext}
                    value={editName}
                    onChangeText={setEditName}
                    maxLength={100}
                  />
                  <TextInput
                    style={[styles.compactInput, styles.compactInputSmall]}
                    placeholder="Description (optional)"
                    placeholderTextColor={Colors.subtext}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    maxLength={150}
                  />
                </View>
              </View>

              {/* Public/Private Toggle - Compact Design */}
              {isFirestoreSource && (
                <View style={styles.compactToggleSection}>
                  <View style={styles.compactToggleHeader}>
                    <Ionicons name="eye-outline" size={18} color={Colors.text} />
                    <Text style={styles.compactToggleLabel}>Visibility</Text>
                  </View>
                  <View style={styles.compactToggleButtons}>
                    <Pressable
                      style={[styles.compactToggleButton, editIsPublic && styles.compactToggleButtonActive]}
                      onPress={() => {
                        setEditIsPublic(true);
                        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Ionicons 
                        name="globe-outline" 
                        size={16} 
                        color={editIsPublic ? "#fff" : Colors.subtext} 
                      />
                      <Text style={[styles.compactToggleButtonText, editIsPublic && styles.compactToggleButtonTextActive]}>
                        Public
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.compactToggleButton, !editIsPublic && styles.compactToggleButtonActive]}
                      onPress={() => {
                        setEditIsPublic(false);
                        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Ionicons 
                        name="lock-closed-outline" 
                        size={16} 
                        color={!editIsPublic ? "#fff" : Colors.subtext} 
                      />
                      <Text style={[styles.compactToggleButtonText, !editIsPublic && styles.compactToggleButtonTextActive]}>
                        Private
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Action Buttons - Compact */}
              <View style={styles.compactActions}>
                <Pressable
                  style={[styles.compactActionButton, styles.compactActionButtonPrimary, (isSaving || isUploadingImage || !editName.trim()) && styles.compactActionButtonDisabled]}
                  onPress={handleSaveEdit}
                  disabled={isSaving || isUploadingImage || !editName.trim()}
                >
                  <LinearGradient
                    colors={isSaving || isUploadingImage || !editName.trim() ? ["#555", "#666"] : [Colors.primary, "#84E655"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.compactActionButtonGradient}
                  >
                    {isSaving || isUploadingImage ? (
                      <View style={styles.compactActionButtonContent}>
                        <ActivityIndicator size="small" color="#000" />
                        {isUploadingImage && (
                          <Text style={[styles.compactActionButtonText, { fontSize: 11 }]}>
                            {uploadProgress}%
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.compactActionButtonText}>Save</Text>
                    )}
                  </LinearGradient>
                </Pressable>

                <Pressable
                  style={[styles.compactActionButton, styles.compactActionButtonSecondary]}
                  onPress={closeEditModal}
                  disabled={isSaving}
                >
                  <Text style={styles.compactActionButtonTextSecondary}>Cancel</Text>
                </Pressable>
              </View>

              {/* Delete Button - Compact */}
              <Pressable
                style={styles.compactDeleteButton}
                onPress={handleDeletePlaylist}
                disabled={isSaving || isUploadingImage}
              >
                <Ionicons name="trash-outline" size={16} color="#FF4444" />
                <Text style={styles.compactDeleteButtonText}>Delete Playlist</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backBtnSolo: { width: 36, height: 36, marginLeft: 12, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.subtext, fontSize: 16, fontFamily: "Inter_500Medium" },

  // Hero
  hero: {
    height: 340,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroFallback: {
    backgroundColor: "#111820",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBack: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEdit: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 5,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    lineHeight: undefined,
  },
  heroSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  heroMeta: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(10,16,24,0.7)",
  },
  shuffleBtnText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  playBtnText: {
    color: "#000",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },

  // Tracks header
  tracksHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  tracksTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  tracksMeta: {
    color: Colors.subtext,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },

  // Inline states
  inlineWrap: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: "center",
    gap: 10,
  },
  inlineText: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },

  // Sticky header
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(16,20,26,0.97)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  stickyBack: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stickyTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  stickyPlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  // Edit Modal - Redesigned Compact & Official
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBottomSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    boxShadow: "none",
  },
  modalDragHandle: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalDragIndicator: {
    width: 36,
    height: 4,
    backgroundColor: Colors.subtext + "50",
    borderRadius: 2,
  },
  modalScrollView: {
    maxHeight: "100%",
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 20,
    textAlign: "center",
  },

  // Compact Image Section
  compactImageSection: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
  },
  compactImageContainer: {
    position: "relative",
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: "hidden",
  },
  compactImage: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.surfaceLight,
  },
  compactImageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 6,
    gap: 6,
  },
  compactImageButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  compactImageButtonDanger: {
    backgroundColor: "rgba(255, 68, 68, 0.3)",
  },
  compactImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  compactImagePlaceholderText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.subtext,
  },

  // Compact Info Section
  compactInfoSection: {
    flex: 1,
    gap: 10,
  },
  compactInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  compactInputSmall: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    paddingVertical: 10,
  },

  // Compact Toggle Section
  compactToggleSection: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  compactToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  compactToggleLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  compactToggleButtons: {
    flexDirection: "row",
    gap: 8,
  },
  compactToggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  compactToggleButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  compactToggleButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.subtext,
  },
  compactToggleButtonTextActive: {
    color: "#000",
  },

  // Compact Actions
  compactActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  compactActionButton: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  compactActionButtonPrimary: {
    flex: 2,
  },
  compactActionButtonSecondary: {
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  compactActionButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  compactActionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactActionButtonText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#000",
  },
  compactActionButtonTextSecondary: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  compactActionButtonDisabled: {
    opacity: 0.5,
  },

  // Compact Delete Button
  compactDeleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.2)",
  },
  compactDeleteButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FF4444",
  },

  // Visibility Badge
  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    flexShrink: 0,
  },
  visibilityBadgePublic: {
    backgroundColor: "rgba(76, 175, 80, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(76, 175, 80, 0.4)",
  },
  visibilityBadgePrivate: {
    backgroundColor: "rgba(158, 158, 158, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(158, 158, 158, 0.4)",
  },
  visibilityBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
