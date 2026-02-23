import React, { useCallback, useState, useEffect, useRef, memo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { formatDuration } from "@/lib/musicData";
import { extractDominantColor } from "@/lib/colorExtractor";
import { PingPongScroll } from "@/components/PingPongScroll";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ART_SIZE = Math.min(SCREEN_WIDTH - 48, 400);

// Optimized play button component
const PlayerPlayButton = memo(({ 
  isPlaying, 
  isLoading, 
  onPress 
}: { 
  isPlaying: boolean; 
  isLoading: boolean; 
  onPress: () => void;
}) => {
  return (
    <Pressable onPress={onPress} style={styles.playButton}>
      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.black} />
      ) : (
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={38}
          color={Colors.black}
          style={!isPlaying ? { marginLeft: 4 } : undefined}
        />
      )}
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // Only re-render if isPlaying or isLoading changed
  return prevProps.isPlaying === nextProps.isPlaying && 
         prevProps.isLoading === nextProps.isLoading;
});

PlayerPlayButton.displayName = "PlayerPlayButton";

// Helper function to adjust color brightness
function adjustColorBrightness(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace("#", "");
  
  // Convert to RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  
  // Adjust brightness
  r = Math.max(0, Math.min(255, r + (r * percent / 100)));
  g = Math.max(0, Math.min(255, g + (g * percent / 100)));
  b = Math.max(0, Math.min(255, b + (b * percent / 100)));
  
  // Convert back to hex
  const rr = Math.round(r).toString(16).padStart(2, "0");
  const gg = Math.round(g).toString(16).padStart(2, "0");
  const bb = Math.round(b).toString(16).padStart(2, "0");
  
  return `#${rr}${gg}${bb}`;
}

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    positionMillis,
    isShuffled,
    repeatMode,
    isLoading,
    togglePlay,
    nextSong,
    prevSong,
    seekTo,
    toggleShuffle,
    toggleRepeat,
    toggleLike,
    isLiked,
    albumColor,
    textColor,
  } = usePlayer();

  const [isSeeking, setIsSeeking] = useState(false);
  const [gradientColors, setGradientColors] = useState<[string, string, string, string, string]>([
    "#0a0a0a",
    "#1a1a2e",
    "#16213e",
    "#0f3460",
    Colors.background,
  ]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Update gradient colors based on album color
  useEffect(() => {
    if (currentSong?.coverUrl && albumColor) {
      // Create gradient from album color to dark background
      const baseColor = albumColor;
      const darkColor = Colors.background;
      setGradientColors([
        baseColor,
        adjustColorBrightness(baseColor, -20),
        adjustColorBrightness(baseColor, -40),
        adjustColorBrightness(baseColor, -60),
        darkColor,
      ] as [string, string, string, string, string]);
    }
  }, [currentSong?.id, albumColor]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [currentSong?.id]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  if (!currentSong) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.emptyState}>
          <Ionicons name="musical-notes-outline" size={64} color={Colors.inactive} />
          <Text style={styles.emptyText}>No song playing</Text>
          <Pressable onPress={safeGoBack} style={styles.backBtnEmpty}>
            <Ionicons name="arrow-down" size={28} color={Colors.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  const currentTimeSec = Math.floor(positionMillis / 1000);
  const totalDurationSec = Math.floor(duration / 1000);
  const liked = isLiked(currentSong.id);

  const handleSeek = (evt: any) => {
    const { locationX } = evt.nativeEvent;
    const barWidth = SCREEN_WIDTH - 48;
    const newProgress = Math.max(0, Math.min(1, locationX / barWidth));
    seekTo(newProgress);
  };

  return (
    <LinearGradient
      colors={gradientColors}
      locations={[0, 0.2, 0.4, 0.6, 1]}
      style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset + 8 }]}
    >
      <View style={styles.header}>
        <Pressable onPress={safeGoBack} hitSlop={12}>
          <Ionicons name="arrow-down" size={28} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerSubtitle}>PLAYING FROM</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentSong.album}
          </Text>
        </View>
        <Pressable hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
        </Pressable>
      </View>

      <View style={styles.artContainer}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <Image
            source={{ uri: currentSong.coverUrl }}
            style={[
              styles.albumArt,
              { width: ART_SIZE, height: ART_SIZE },
              Platform.OS !== "web" && styles.albumArtShadow,
            ]}
            contentFit="cover"
          />
        </Animated.View>
      </View>

      <View style={styles.infoSection}>
        <View style={styles.songInfoRow}>
          <View style={styles.songInfo}>
            <PingPongScroll
              text={currentSong.title}
              style={styles.songTitle}
              velocity={15}
            />
            <PingPongScroll
              text={currentSong.artist}
              style={styles.songArtist}
              velocity={12}
            />
          </View>
          <Pressable
            onPress={() => { haptic(); toggleLike(currentSong); }}
            hitSlop={10}
            style={styles.likeButton}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={28}
              color={liked ? "#1DB954" : Colors.subtext}
            />
          </Pressable>
        </View>

        <View style={styles.progressSection}>
          <Pressable
            onPress={handleSeek}
            onPressIn={() => setIsSeeking(true)}
            onPressOut={() => setIsSeeking(false)}
            style={styles.progressBarTouch}
          >
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              {isSeeking && (
                <View style={[styles.progressDot, { left: `${progress * 100}%` }]} />
              )}
            </View>
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatDuration(currentTimeSec)}</Text>
            <Text style={styles.timeText}>
              {totalDurationSec > 0 ? formatDuration(totalDurationSec) : formatDuration(currentSong.duration)}
            </Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable onPress={() => { haptic(); toggleShuffle(); }}>
            <Ionicons
              name="shuffle"
              size={22}
              color={isShuffled ? Colors.primary : Colors.subtext}
            />
          </Pressable>
          <Pressable onPress={() => { haptic(); prevSong(); }}>
            <Ionicons name="play-skip-back" size={28} color={Colors.text} />
          </Pressable>
          <PlayerPlayButton 
            isPlaying={isPlaying}
            isLoading={isLoading}
            onPress={() => { haptic(); togglePlay(); }}
          />
          <Pressable onPress={() => { haptic(); nextSong(); }}>
            <Ionicons name="play-skip-forward" size={28} color={Colors.text} />
          </Pressable>
          <Pressable onPress={() => { haptic(); toggleRepeat(); }}>
            <Ionicons
              name={repeatMode === "one" ? "repeat" : "repeat"}
              size={22}
              color={repeatMode !== "off" ? Colors.primary : Colors.subtext}
            />
            {repeatMode === "one" && <View style={styles.repeatDot} />}
          </Pressable>
        </View>

        <View style={styles.bottomRow}>
          <Pressable hitSlop={10}>
            <Ionicons name="phone-portrait-outline" size={20} color={Colors.subtext} />
          </Pressable>
          <Pressable hitSlop={10}>
            <Ionicons name="list-outline" size={20} color={Colors.subtext} />
          </Pressable>
          <Pressable hitSlop={10}>
            <Ionicons name="share-outline" size={20} color={Colors.subtext} />
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 16,
  },
  headerSubtitle: {
    color: Colors.subtext,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  artContainer: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingHorizontal: 24,
  },
  albumArt: {
    borderRadius: 16,
  },
  albumArtShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  infoSection: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  songInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  songInfo: {
    flex: 1,
    marginRight: 16,
  },
  songTitle: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  songArtist: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  likeButton: {
    padding: 4,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressBarTouch: {
    paddingVertical: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.inactive,
    borderRadius: 2,
    position: "relative",
  },
  progressFill: {
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  progressDot: {
    position: "absolute",
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    marginLeft: -7,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 5,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  timeText: {
    color: Colors.subtext,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.text,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  repeatDot: {
    position: "absolute",
    bottom: -6,
    alignSelf: "center",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    left: "50%",
    marginLeft: -2,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 18,
    fontFamily: "Inter_500Medium",
  },
  backBtnEmpty: {
    marginTop: 16,
  },
});
