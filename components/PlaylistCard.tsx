import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { Playlist } from "@/lib/musicData";

interface Props {
  playlist: Playlist;
  size?: "small" | "large";
  onPress?: () => void;
}

export default function PlaylistCard({ playlist, size = "large", onPress }: Props) {
  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.push({ pathname: "/playlist/[id]", params: { id: playlist.id } });
    }
  };

  if (size === "small") {
    return (
      <Pressable
        style={({ pressed }) => [styles.smallContainer, pressed && styles.pressed]}
        onPress={handlePress}
      >
        <Image source={{ uri: playlist.coverUrl }} style={styles.smallCover} contentFit="cover" />
        <Text style={styles.smallName} numberOfLines={2}>{playlist.name}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <Image source={{ uri: playlist.coverUrl }} style={styles.cover} contentFit="cover" />
      <Text style={styles.name} numberOfLines={1}>{playlist.name}</Text>
      {playlist.description && (
        <Text style={styles.description} numberOfLines={1}>{playlist.description}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 150,
    marginRight: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  cover: {
    width: 150,
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
  },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  description: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  smallContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 4,
    overflow: "hidden",
    height: 56,
    flex: 1,
    margin: 4,
  },
  smallCover: {
    width: 56,
    height: 56,
  },
  smallName: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    paddingHorizontal: 8,
  },
});
