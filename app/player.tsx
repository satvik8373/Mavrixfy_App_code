import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { usePlayer } from "@/contexts/PlayerContext";
import { formatDuration } from "@/lib/musicData";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ART_SIZE = Math.min(SCREEN_WIDTH - 48, 400);

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
  } = usePlayer();

  const [isSeeking, setIsSeeking] = useState(false);

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
          <Pressable onPress={() => router.back()} style={styles.backBtnEmpty}>
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
      colors={["#1a1a2e", "#16213e", "#0f3460", Colors.background]}
      locations={[0, 0.3, 0.6, 1]}
      style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset + 8 }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
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
        <Animated.View entering={FadeInDown.duration(400).springify()}>
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
            <Text style={styles.songTitle} numberOfLines={1}>{currentSong.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{currentSong.artist}</Text>
          </View>
          <Pressable
            onPress={() => { haptic(); toggleLike(currentSong); }}
            hitSlop={10}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={26}
              color={liked ? Colors.primary : Colors.subtext}
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
          <Pressable
            onPress={() => { haptic(); togglePlay(); }}
            style={styles.playButton}
          >
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
    borderRadius: 8,
  },
  albumArtShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
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
    backgroundColor: Colors.text,
    borderRadius: 2,
  },
  progressDot: {
    position: "absolute",
    top: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.text,
    marginLeft: -6,
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
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.text,
    alignItems: "center",
    justifyContent: "center",
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
