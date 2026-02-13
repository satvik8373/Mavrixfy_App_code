import React from "react";
import { View, Text, Pressable, StyleSheet, Platform, Alert } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { Song, formatDuration } from "@/lib/musicData";
import { usePlayer } from "@/contexts/PlayerContext";

interface Props {
  song: Song;
  index?: number;
  queue?: Song[];
  showCover?: boolean;
  onRemove?: () => void;
}

export default function SongRow({ song, index, queue, showCover = true, onRemove }: Props) {
  const { playSong, currentSong, isPlaying, toggleLike, isLiked, addToQueue, playNext } = usePlayer();

  const isActive = currentSong?.id === song.id;
  const liked = isLiked(song.id);

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSong(song, queue || [song]);
  };

  const handleLongPress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Queue Options", "What would you like to do?", [
      { text: "Play Next", onPress: () => playNext(song) },
      { text: "Add to Queue", onPress: () => addToQueue(song) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleLike = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLike(song);
  };

  const handleRemove = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRemove?.();
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      {index !== undefined && (
        <Text style={[styles.index, isActive && styles.activeText]}>
          {isActive && isPlaying ? (
            <Ionicons name="musical-notes" size={14} color={Colors.primary} />
          ) : (
            index + 1
          )}
        </Text>
      )}
      {showCover && (
        <Image source={{ uri: song.coverUrl }} style={styles.cover} contentFit="cover" />
      )}
      <View style={styles.info}>
        <Text style={[styles.title, isActive && styles.activeText]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
      </View>
      <Pressable onPress={handleLike} hitSlop={10} style={styles.likeBtn}>
        <Ionicons
          name={liked ? "heart" : "heart-outline"}
          size={20}
          color={liked ? Colors.primary : Colors.subtext}
        />
      </Pressable>
      {onRemove ? (
        <Pressable onPress={handleRemove} hitSlop={10} style={styles.removeBtn}>
          <Ionicons name="trash" size={18} color={Colors.subtext} />
        </Pressable>
      ) : (
        <Text style={styles.duration}>{formatDuration(song.duration)}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  index: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    width: 28,
    textAlign: "center",
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 8,
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
  likeBtn: {
    padding: 6,
  },
  removeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  duration: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginLeft: 4,
    width: 36,
    textAlign: "right",
  },
});
