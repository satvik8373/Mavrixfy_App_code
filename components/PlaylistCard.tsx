import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { Playlist } from "@/lib/musicData";
import { PingPongScroll } from "./PingPongScroll";
import { useDebounceNavigation } from "@/hooks/useDebounceNavigation";

interface Props {
  playlist: Playlist;
  size?: "small" | "large";
  onPress?: () => void;
}

const PlaylistCard = memo(function PlaylistCard({ playlist, size = "large", onPress }: Props) {
  const { navigate } = useDebounceNavigation();

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      navigate({ pathname: "/playlist/[id]", params: { id: playlist.id } });
    }
  };

  if (size === "small") {
    return (
      <Pressable
        style={({ pressed }) => [styles.smallContainer, pressed && styles.pressed]}
        onPress={handlePress}
      >
        <Image 
          source={{ uri: playlist.coverUrl }} 
          style={styles.smallCover} 
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="normal"
          recyclingKey={playlist.id}
        />
        <View style={styles.smallInfo}>
          <Text style={styles.smallName} numberOfLines={1}>
            {playlist.name}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <Image 
        source={{ uri: playlist.coverUrl }} 
        style={styles.cover} 
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="normal"
        recyclingKey={playlist.id}
      />
      <Text style={styles.name} numberOfLines={2}>
        {playlist.name}
      </Text>
      {playlist.description && (
        <Text style={styles.description} numberOfLines={2}>
          {playlist.description}
        </Text>
      )}
    </Pressable>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.playlist.id === nextProps.playlist.id &&
    prevProps.size === nextProps.size
  );
});

export default PlaylistCard;

const styles = StyleSheet.create({
  container: {
    width: 160,
    marginRight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  cover: {
    width: 160,
    height: 160,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: Colors.surfaceLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  name: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  description: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    lineHeight: 16,
  },
  smallContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 6,
    overflow: "hidden",
    height: 64,
    flex: 1,
    margin: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  smallCover: {
    width: 64,
    height: 64,
  },
  smallInfo: {
    flex: 1,
    paddingHorizontal: 10,
  },
  smallName: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
});
