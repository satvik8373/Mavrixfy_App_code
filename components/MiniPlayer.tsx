import React, { useEffect, useMemo, memo, useCallback } from "react";
import { View, Pressable, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { usePlayer } from "@/contexts/PlayerContext";
import { PingPongScroll } from "./PingPongScroll";
import { extractDominantColor } from "@/lib/colorExtractor";

interface MiniPlayerProps {
  bottomOffset?: number;
}

// Memoized play button to prevent flickering
const PlayButton = memo(({ isPlaying, onPress }: { 
  isPlaying: boolean; 
  onPress: () => void;
}) => {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.playBtn}>
      <Ionicons 
        name={isPlaying ? "pause" : "play"} 
        size={18} 
        color={Colors.black}
        style={!isPlaying ? { marginLeft: 1 } : undefined}
      />
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // Only re-render if isPlaying actually changed
  return prevProps.isPlaying === nextProps.isPlaying;
});

PlayButton.displayName = "PlayButton";

function MiniPlayer({ bottomOffset }: MiniPlayerProps) {
  let playerContext;
  try {
    playerContext = usePlayer();
  } catch (error) {
    return null;
  }

  const { 
    currentSong, 
    isPlaying, 
    togglePlay, 
    progress,
    albumColor,
    textColor,
    setAlbumColor,
    setTextColor,
  } = playerContext;

  const handleTogglePlay = useCallback(() => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      togglePlay();
    } catch (error) {
      // Silent fail
    }
  }, [togglePlay]);

  const progressWidth = useMemo(() => {
    const width = Math.max(0, Math.min(100, progress * 100));
    return isNaN(width) ? 0 : width;
  }, [progress]);

  useEffect(() => {
    if (currentSong?.coverUrl) {
      extractDominantColor(currentSong.coverUrl).then((colors) => {
        setAlbumColor(colors.primary);
        setTextColor(colors.text);
      }).catch(() => {});
    }
  }, [currentSong?.id]);

  if (!currentSong) return null;

  return (
    <View
      style={[styles.wrapper, { bottom: bottomOffset ?? (Platform.OS === "web" ? 84 : 68) }]}
      pointerEvents="box-none"
    >
      <View style={[styles.floatingContainer, { backgroundColor: albumColor }]}>
        <Pressable style={styles.container} onPress={() => router.push("/player")}>
          <View style={styles.leftSection}>
            <Image 
              source={{ uri: currentSong.coverUrl }} 
              style={styles.cover} 
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
            />
            <View style={styles.info}>
              <PingPongScroll
                text={currentSong.title}
                style={[styles.title, { color: textColor }]}
                velocity={15}
              />
              <PingPongScroll
                text={currentSong.artist}
                style={[styles.artist, { color: textColor, opacity: 0.7 }]}
                velocity={12}
              />
            </View>
          </View>
          
          <View style={styles.controls}>
            <PlayButton 
              isPlaying={isPlaying} 
              onPress={handleTogglePlay}
            />

            <Pressable onPress={() => router.push("/queue")} hitSlop={12} style={styles.iconBtn}>
              <Ionicons name="list" size={18} color={textColor} />
            </Pressable>
          </View>
        </Pressable>

        {/* Progress bar */}
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${progressWidth}%`, 
                backgroundColor: textColor 
              }
            ]} 
          />
        </View>
      </View>
    </View>
  );
}

export default memo(MiniPlayer, (prevProps, nextProps) => {
  // Only re-render if bottomOffset changes
  return prevProps.bottomOffset === nextProps.bottomOffset;
});

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 8,
    right: 8,
    zIndex: 999,
  },
  floatingContainer: {
    borderRadius: 8,
    overflow: "hidden",
    elevation: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  progressBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  progressFill: {
    height: 2,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 6,
    paddingBottom: 8,
    height: 56,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: Colors.surfaceLight,
  },
  info: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  artist: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.text,
    justifyContent: "center",
    alignItems: "center",
  },
});
