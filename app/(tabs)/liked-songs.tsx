import React, { useRef, useCallback, memo, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import SongRow from "@/components/SongRow";
import { Song } from "@/lib/musicData";

// Optimized play button for liked songs
const LikedSongsPlayButton = memo(({ 
  isPlaying, 
  onPress 
}: { 
  isPlaying: boolean; 
  onPress: () => void;
}) => {
  return (
    <Pressable style={styles.playButton} onPress={onPress}>
      <Ionicons 
        name={isPlaying ? "pause" : "play"} 
        size={28} 
        color={Colors.black}
        style={!isPlaying ? { marginLeft: 2 } : undefined}
      />
    </Pressable>
  );
}, (prevProps, nextProps) => {
  return prevProps.isPlaying === nextProps.isPlaying;
});

LikedSongsPlayButton.displayName = "LikedSongsPlayButton";

export default function LikedSongsScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // Safely get player context with error handling
  let playerContext;
  try {
    playerContext = usePlayer();
  } catch (error) {
    console.error("Error accessing PlayerContext:", error);
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.inactive} />
          <Text style={styles.emptyText}>Unable to load player</Text>
          <Text style={styles.emptySubtext}>Please restart the app</Text>
        </View>
      </View>
    );
  }

  const { playSong, likedSongs, currentSong, isPlaying, togglePlay, queue } = playerContext;

  // Ensure songs is always an array with valid data
  const songs = useMemo(() => {
    if (!likedSongs || !Array.isArray(likedSongs)) return [];
    return likedSongs.filter(song => song && song.id && song.title);
  }, [likedSongs]);

  // Log for debugging
  useEffect(() => {
    console.log("Liked songs count:", songs.length);
  }, [songs.length]);

  // Memoize isPlayingFromLikedSongs to prevent recalculation on every render
  const isPlayingFromLikedSongs = useMemo(() => {
    if (!currentSong || !currentSong.id || songs.length === 0) return false;
    return songs.some(s => s && s.id === currentSong.id) && 
           queue.length > 0 &&
           queue.every(q => q && songs.some(s => s && s.id === q.id));
  }, [currentSong?.id, songs.length, queue.length]);

  const totalDuration = useMemo(() => {
    return songs.reduce((acc, s) => acc + (s?.duration || 0), 0);
  }, [songs]);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const durationText = totalHours > 0
    ? `${totalHours} hr ${remainingMinutes} min`
    : `${totalMinutes} min`;

  const handleShufflePlay = useCallback(() => {
    try {
      if (songs.length === 0) return;
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      if (isPlayingFromLikedSongs && isPlaying) {
        togglePlay();
      } else {
        const shuffled = [...songs];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        playSong(shuffled[0], shuffled);
      }
    } catch (error) {
      console.error("Error in handleShufflePlay:", error);
    }
  }, [songs, isPlayingFromLikedSongs, isPlaying, togglePlay, playSong]);

  // Animated header opacity
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      {/* Animated Header */}
      <Animated.View style={[styles.fixedHeader, { paddingTop: topInset, opacity: headerOpacity }]}>
        <LinearGradient
          colors={["#5b4a9e", "#4a3a8e"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerContent}>
          <Pressable onPress={safeGoBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Liked Songs</Text>
          <Pressable hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
          </Pressable>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Hero Section */}
        <LinearGradient
          colors={["#5b4a9e", "#4a3a8e", "#3a2a7e", Colors.background]}
          locations={[0, 0.3, 0.6, 1]}
          style={[styles.heroGradient, { paddingTop: topInset + 50 }]}
        >
          <View style={styles.heroContent}>
            {/* Large Heart Icon */}
            <LinearGradient
              colors={["#5b4a9e", "#7c3aed", "#3b82f6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.largeHeartContainer}
            >
              <Ionicons name="heart" size={80} color={Colors.text} />
            </LinearGradient>

            {/* Title */}
            <Text style={styles.playlistTitle}>Liked Songs</Text>
            
            {/* Meta Info */}
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {songs.length} {songs.length === 1 ? "song" : "songs"}
              </Text>
              {totalDuration > 0 && (
                <>
                  <Text style={styles.metaDot}> • </Text>
                  <Text style={styles.metaText}>{durationText}</Text>
                </>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <View style={styles.actionsRow}>
            <LikedSongsPlayButton 
              isPlaying={isPlayingFromLikedSongs && isPlaying}
              onPress={handleShufflePlay}
            />

            <Pressable style={styles.shuffleIconButton} onPress={handleShufflePlay}>
              <Ionicons name="shuffle" size={24} color={Colors.subtext} />
            </Pressable>

            <Pressable style={styles.iconButton} hitSlop={10}>
              <Ionicons name="ellipsis-horizontal" size={24} color={Colors.subtext} />
            </Pressable>
          </View>
        </View>

        {/* Songs List or Empty State */}
        {songs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={64} color={Colors.inactive} />
            <Text style={styles.emptyText}>Songs you like will appear here</Text>
            <Text style={styles.emptySubtext}>
              Save songs by tapping the heart icon.
            </Text>
          </View>
        ) : (
          <View style={styles.songsContainer}>
            {songs.map((song, index) => (
              <SongRow 
                key={song.id} 
                song={song} 
                queue={songs} 
                index={index} 
              />
            ))}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fixedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingBottom: 12,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  heroGradient: {
    paddingBottom: 24,
  },
  heroContent: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  largeHeartContainer: {
    width: 232,
    height: 232,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 16,
  },
  playlistTitle: {
    color: Colors.text,
    fontSize: 40,
    fontFamily: "Inter_900Black",
    marginBottom: 16,
    textAlign: "center",
    letterSpacing: -1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  metaDot: {
    color: Colors.subtext,
    fontSize: 13,
  },
  actionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: Colors.background,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.text,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  shuffleIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  songsContainer: {
    backgroundColor: Colors.background,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySubtext: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
