import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { usePlayer } from "@/contexts/PlayerContext";
import { formatDuration } from "@/lib/musicData";
import SongRow from "@/components/SongRow";

export default function LikedSongsScreen() {
  const insets = useSafeAreaInsets();
  const { playSong, likedSongs } = usePlayer();

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const songs = likedSongs;

  const totalDuration = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const durationText = totalHours > 0
    ? `${totalHours} hr ${remainingMinutes} min`
    : `${totalMinutes} min`;

  const handleShufflePlay = () => {
    if (songs.length === 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...songs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playSong(shuffled[0], shuffled);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#5b4a9e", "#3b3085", Colors.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.gradientHeader, { paddingTop: topInset }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Liked Songs</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.heroSection}>
          <View style={styles.heartIconContainer}>
            <Ionicons name="heart" size={48} color={Colors.text} />
          </View>
          <Text style={styles.heroTitle}>Liked Songs</Text>
          <Text style={styles.heroMeta}>
            {songs.length} songs · {durationText}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.shuffleButton} onPress={handleShufflePlay}>
            <Ionicons name="shuffle" size={24} color={Colors.black} />
            <Text style={styles.shuffleText}>Shuffle Play</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {songs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={48} color={Colors.inactive} />
            <Text style={styles.emptyText}>No liked songs yet</Text>
            <Text style={styles.emptySubtext}>Tap the heart icon on any song to save it</Text>
          </View>
        ) : (
          songs.map((song) => (
            <SongRow key={song.id} song={song} queue={songs} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradientHeader: {
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 20,
  },
  heartIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  heroMeta: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  shuffleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 8,
  },
  shuffleText: {
    color: Colors.black,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  scrollView: {
    flex: 1,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
