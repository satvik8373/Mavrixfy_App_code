import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { FlatList } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { formatDuration, Song } from "@/lib/musicData";

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { queue, queueIndex, currentSong, playSong, removeFromQueue, clearQueue } = usePlayer();

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const handleSongPress = (song: any, index: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSong(song, queue);
  };

  const handleRemove = (index: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeFromQueue(index);
  };

  const handleClearQueue = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    clearQueue();
  };

  const upNext = queue.slice(queueIndex + 1);

  // Memoized render item
  const renderItem = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <Pressable
        style={styles.songRow}
        onPress={() => handleSongPress(item, queueIndex + 1 + index)}
      >
        <Image
          source={{ uri: item.coverUrl }}
          style={styles.songImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
        />
        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.songArtist} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>
        <Pressable
          onPress={() => handleRemove(queueIndex + 1 + index)}
          hitSlop={10}
          style={styles.removeBtn}
        >
          <Ionicons name="close-circle" size={24} color={Colors.subtext} />
        </Pressable>
      </Pressable>
    ),
    [queueIndex, handleSongPress, handleRemove]
  );

  const keyExtractor = useCallback((item: Song) => item.id, []);

  // Header component
  const ListHeaderComponent = useCallback(
    () => (
      <>
        {/* Now Playing */}
        {currentSong && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Now Playing</Text>
            <Pressable
              style={styles.songRow}
              onPress={() => router.push("/player")}
            >
              <Image
                source={{ uri: currentSong.coverUrl }}
                style={styles.songImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>
                  {currentSong.title}
                </Text>
                <Text style={styles.songArtist} numberOfLines={1}>
                  {currentSong.artist}
                </Text>
              </View>
              <Ionicons name="musical-notes" size={20} color={Colors.primary} />
            </Pressable>
          </View>
        )}

        {/* Up Next Header */}
        {upNext.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Up Next ({upNext.length})</Text>
          </View>
        )}
      </>
    ),
    [currentSong, upNext.length]
  );

  // Empty component
  const ListEmptyComponent = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Ionicons name="list-outline" size={64} color={Colors.inactive} />
        <Text style={styles.emptyText}>Queue is empty</Text>
        <Text style={styles.emptySubtext}>
          Add songs to your queue to see them here
        </Text>
      </View>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#2a2a2a", "#1a1a1a", Colors.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.gradientHeader, { paddingTop: topInset }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={safeGoBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Queue</Text>
          <Pressable onPress={handleClearQueue} hitSlop={10}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <FlatList
        data={upNext}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        getItemLayout={(data, index) => ({
          length: 64,
          offset: 64 * index,
          index,
        })}
        overScrollMode="never"
        bounces={true}
      />
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
  clearText: {
    color: Colors.primary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  songImage: {
    width: 48,
    height: 48,
    borderRadius: 4,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  songArtist: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  emptyState: {
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
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
