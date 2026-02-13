import React, { useEffect } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
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

export default function MiniPlayer({ bottomOffset }: MiniPlayerProps) {
  const { 
    currentSong, 
    isPlaying, 
    togglePlay, 
    progress, 
    isLoading,
    albumColor,
    textColor,
    setAlbumColor,
    setTextColor,
  } = usePlayer();

  // Extract and store color when song changes
  useEffect(() => {
    if (currentSong?.coverUrl) {
      extractDominantColor(currentSong.coverUrl).then((colors) => {
        setAlbumColor(colors.primary);
        setTextColor(colors.text);
      });
    }
  }, [currentSong?.id]);

  if (!currentSong) return null;

  const handlePress = () => {
    router.push("/player");
  };

  const handleTogglePlay = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    togglePlay();
  };

  const handleQueuePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/queue");
  };

  return (
    <View
      style={[styles.wrapper, { bottom: bottomOffset ?? (Platform.OS === "web" ? 84 : 58) }]}
    >
      {/* Floating Container with Dynamic Color */}
      <View style={[styles.floatingContainer, { backgroundColor: albumColor }]}>
        <Pressable style={styles.container} onPress={handlePress}>
          <View style={styles.leftSection}>
            <Image source={{ uri: currentSong.coverUrl }} style={styles.cover} contentFit="cover" />
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
            <Pressable onPress={handleTogglePlay} hitSlop={12} style={styles.playBtn}>
              {isLoading ? (
                <View style={styles.loadingDot} />
              ) : (
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={24} 
                  color={Colors.black}
                />
              )}
            </Pressable>

            <Pressable onPress={handleQueuePress} hitSlop={12} style={styles.iconBtn}>
              <Ionicons name="list" size={20} color={textColor} />
            </Pressable>
          </View>
        </Pressable>

        {/* Progress bar at bottom of floating container */}
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: textColor }]} />
        </View>
      </View>
    </View>
  );
}

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
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  progressBarContainer: {
    position: "absolute",
    bottom: 1,
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
  },
  progressFill: {
    height: 2,
    borderRadius: 2,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    paddingBottom: 6,
    height: 56,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  cover: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  info: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  artist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.text,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.black,
  },
});
