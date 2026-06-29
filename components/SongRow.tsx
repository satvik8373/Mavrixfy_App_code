import React, { memo, useCallback, useEffect, useRef } from "react";
import * as Animated from "@/lib/nativeAnimated";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle } from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { Song } from "@/lib/musicData";
import { triggerImpact } from "@/lib/haptics";
import { usePlayerRow } from "@/contexts/PlayerContext";
import EqualizerBars from "@/components/EqualizerBars";
import { showGlobalToast } from "@/app/_layout";
import DownloadButton from "@/components/DownloadButton";
import { logger } from "@/lib/logger";
import { isYouTubeBackedSong } from "@/lib/downloads/sourceGuards";

interface Props {
  song: Song;
  index?: number;
  queue?: Song[];
  queueKey?: string;
  showCover?: boolean;
  /** Show the download button. Defaults to true. */
  showDownload?: boolean;
  optionContext?: "playlist";
  playlistId?: string;
  playlistSource?: "local" | "firestore";
  playlistName?: string;
  onRemove?: () => void;
  onSongPress?: (song: Song) => void;
  horizontalPadding?: number;
}

const SWIPE_ACTION_WIDTH = 184;
const SWIPE_COMMIT_DISTANCE = 82;
const SWIPE_SOFT_LIMIT = 214;

function QueueSwipeAction({
  dragX,
}: {
  dragX: Animated.AnimatedInterpolation<number>;
}) {
  const actionOpacity = dragX.interpolate({
    inputRange: [0, 10, 42],
    outputRange: [0, 0.58, 1],
    extrapolate: "clamp",
  });

  const commitOpacity = dragX.interpolate({
    inputRange: [SWIPE_COMMIT_DISTANCE - 18, SWIPE_COMMIT_DISTANCE, SWIPE_SOFT_LIMIT],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  const contentTranslateX = dragX.interpolate({
    inputRange: [0, SWIPE_COMMIT_DISTANCE],
    outputRange: [-22, 0],
    extrapolate: "clamp",
  });

  const contentScale = dragX.interpolate({
    inputRange: [0, SWIPE_COMMIT_DISTANCE, SWIPE_SOFT_LIMIT],
    outputRange: [0.82, 1, 1.08],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.queueAction, { opacity: actionOpacity }]}
    >
      <View style={styles.queueActionBase} />
      <Animated.View style={[styles.queueActionCommit, { opacity: commitOpacity }]} />
      <Animated.View
        style={[
          styles.queueActionContent,
          { transform: [{ translateX: contentTranslateX }, { scale: contentScale }] },
        ]}
      >
        <View style={styles.queueActionGlyph}>
          <Ionicons name="list" size={38} color="#FFFFFF" />
          <View style={styles.queueActionPlusBadge}>
            <Ionicons name="add" size={15} color="#FFFFFF" />
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const SongRow = memo(function SongRow({
  song,
  index: _index,
  queue,
  queueKey: _queueKey,
  showCover = true,
  showDownload = true,
  optionContext,
  playlistId,
  playlistSource,
  playlistName,
  onRemove,
  onSongPress,
  horizontalPadding,
}: Props) {
  const { playSong, currentSongId, isPlaying, addToQueue } = usePlayerRow();
  const queueCommittedRef = useRef(false);
  const didSwipeRef = useRef(false);
  const swipeableRef = useRef<Swipeable | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionOpenLockRef = useRef(false);
  const optionOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimers = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (optionOpenTimerRef.current) {
      clearTimeout(optionOpenTimerRef.current);
      optionOpenTimerRef.current = null;
    }
  }, []);

  // Close swipeable on unmount — prevents stuck-open state when navigating back
  useEffect(() => {
    const swipeable = swipeableRef.current;
    return () => {
      clearPendingTimers();
      swipeable?.close();
    };
  }, [clearPendingTimers]);

  const resetSwipeStateSoon = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => {
      didSwipeRef.current = false;
      queueCommittedRef.current = false;
      resetTimerRef.current = null;
    }, 80);
  }, []);

  const handleSwipeAddToQueue = useCallback(() => {
    if (queueCommittedRef.current || onRemove) return;
    queueCommittedRef.current = true;
    didSwipeRef.current = true;
    void triggerImpact(ImpactFeedbackStyle.Medium);
    addToQueue(song);
    showGlobalToast("Added to queue");
    requestAnimationFrame(() => {
      swipeableRef.current?.close();
      resetSwipeStateSoon();
    });
  }, [addToQueue, onRemove, resetSwipeStateSoon, song]);

  const handleSwipeOpen = useCallback((direction: "left" | "right") => {
    if (direction === "left") {
      handleSwipeAddToQueue();
    }
  }, [handleSwipeAddToQueue]);

  const handleSwipeClose = useCallback(() => {
    queueCommittedRef.current = false;
    resetSwipeStateSoon();
  }, [resetSwipeStateSoon]);

  const renderLeftActions = useCallback((
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => (
    <QueueSwipeAction dragX={dragX} />
  ), []);

  if (!song || !song.id || !song.title) return null;

  const isActive = currentSongId === song.id;
  const canShowDownloadForSong = showDownload && !isYouTubeBackedSong(song);

  const handlePress = () => {
    if (didSwipeRef.current) return;
    void triggerImpact(ImpactFeedbackStyle.Light);
    onSongPress?.(song);
    playSong(song, queue || [song]);
  };

  const handleLongPress = () => {
    void triggerImpact(ImpactFeedbackStyle.Medium);
    openSongOptions();
  };

  const handleRemove = () => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    onRemove?.();
  };

  const handleMorePress = () => {
    void triggerImpact(ImpactFeedbackStyle.Light);
    openSongOptions();
  };

  const openSongOptions = () => {
    if (optionOpenLockRef.current) return;

    optionOpenLockRef.current = true;
    didSwipeRef.current = false;
    queueCommittedRef.current = false;
    swipeableRef.current?.close();

    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (optionOpenTimerRef.current) {
      clearTimeout(optionOpenTimerRef.current);
    }

    const canRemoveFromPlaylist = optionContext === "playlist" && Boolean(playlistId);

    try {
      router.push({
        pathname: "/song-options",
        params: {
          song: JSON.stringify({
            id: song.id,
            title: song.title,
            artist: song.artist,
            album: song.album || "",
            duration: song.duration || 0,
            coverUrl: song.coverUrl || "",
            audioUrl: song.audioUrl || "",
            downloadUrl: song.downloadUrl,
            source: song.source,
            youtubeVideoId: song.youtubeVideoId,
            youtubeVisualVideoId: song.youtubeVisualVideoId,
          }),
          showDownload: canShowDownloadForSong && !onRemove && !canRemoveFromPlaylist ? "1" : "0",
          canRemove: onRemove || canRemoveFromPlaylist ? "1" : "0",
          optionContext: optionContext ?? "",
          playlistId: playlistId ?? "",
          playlistSource: playlistSource ?? "",
          playlistName: playlistName ?? "",
        },
      });
    } catch (error) {
      logger.error("[SongRow] Failed to open song options:", error);
    }

    optionOpenTimerRef.current = setTimeout(() => {
      optionOpenLockRef.current = false;
      optionOpenTimerRef.current = null;
    }, 650);
  };

  return (
    <View style={styles.swipeWrap}>
      <Swipeable
        ref={swipeableRef}
        enabled={!onRemove}
        friction={1.6}
        leftThreshold={SWIPE_COMMIT_DISTANCE}
        dragOffsetFromLeftEdge={Platform.OS === "ios" ? 28 : 8}
        failOffsetY={[-10, 10]}
        overshootLeft
        overshootFriction={8}
        useNativeAnimations
        animationOptions={{ bounciness: 0, speed: 32 }}
        enableTrackpadTwoFingerGesture
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={handleSwipeOpen}
        onSwipeableClose={handleSwipeClose}
        containerStyle={styles.swipeableContainer}
        childrenContainerStyle={styles.rowLayer}
      >
        <Pressable
          style={({ pressed }) => [
            styles.container,
            horizontalPadding !== undefined && { paddingHorizontal: horizontalPadding },
            pressed && styles.pressed,
          ]}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          {isActive ? (
            <View style={styles.playingIndicator}>
              <EqualizerBars isPlaying={isPlaying} size={3} />
            </View>
          ) : null}

            {showCover && song.coverUrl && (
              <Image
                recyclingKey={song.id}
                source={{ uri: song.coverUrl }}
                style={styles.cover}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="normal"
                placeholder={{ blurhash: 'L5H2EC=PM+yV+^$gM_e-4Wo0WB%M' }}
                transition={100}
              />
            )}

            <View style={styles.info}>
              <Text style={[styles.title, isActive && styles.activeText]} numberOfLines={1}>
                {song.title || "Unknown Title"}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {song.artist || "Unknown Artist"}
              </Text>
            </View>

            {/* Remove / duration */}
            {onRemove ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  handleRemove();
                }}
                hitSlop={10}
                style={styles.removeBtn}
              >
                <Ionicons name="trash" size={18} color={Colors.subtext} />
              </Pressable>
            ) : null}

            {/* Download button */}
            {canShowDownloadForSong && !onRemove ? (
              <View
                onTouchStart={(e) => e.stopPropagation()}
                style={styles.downloadBtnWrapper}
              >
                <DownloadButton
                  song={song}
                  size={20}
                  color={Colors.subtext}
                />
              </View>
            ) : null}

            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                handleMorePress();
              }}
              hitSlop={10}
              style={styles.moreBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.subtext} />
            </Pressable>
        </Pressable>
      </Swipeable>

    </View>
  );
}, (prevProps, nextProps) => {
  // Optimized comparison - skip queue array comparison for better performance
  // Queue changes are detected via queueKey instead
  return (
    prevProps.song.id === nextProps.song.id &&
    prevProps.song.title === nextProps.song.title &&
    prevProps.song.artist === nextProps.song.artist &&
    prevProps.song.coverUrl === nextProps.song.coverUrl &&
    prevProps.index === nextProps.index &&
    prevProps.showCover === nextProps.showCover &&
    prevProps.showDownload === nextProps.showDownload &&
    prevProps.optionContext === nextProps.optionContext &&
    prevProps.playlistId === nextProps.playlistId &&
    prevProps.playlistSource === nextProps.playlistSource &&
    prevProps.playlistName === nextProps.playlistName &&
    prevProps.horizontalPadding === nextProps.horizontalPadding &&
    prevProps.onSongPress === nextProps.onSongPress &&
    Boolean(prevProps.onRemove) === Boolean(nextProps.onRemove) &&
    prevProps.queueKey === nextProps.queueKey
  );
});

export default SongRow;

const styles = StyleSheet.create({
  swipeWrap: {
    position: "relative",
    width: "100%",
    backgroundColor: Colors.background,
  },
  rowLayer: {
    width: "100%",
  },
  swipeableContainer: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: Colors.background,
  },
  queueAction: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  queueActionBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#565656",
  },
  queueActionCommit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1DB954",
  },
  queueActionContent: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  queueActionGlyph: {
    width: 58,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  queueActionPlusBadge: {
    position: "absolute",
    left: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.64)",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    paddingVertical: 10,
    paddingHorizontal: 18,
    width: "100%",
    backgroundColor: Colors.background,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  playingIndicator: {
    width: 18,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 14,
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  title: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  activeText: {
    color: Colors.primary,
  },
  artist: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  removeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  downloadBtnWrapper: {
    marginLeft: 2,
    marginRight: 2,
  },
  moreBtn: {
    width: 32,
    height: 32,
    marginLeft: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
});
