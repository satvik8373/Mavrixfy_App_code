import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import {
  Song,
  formatDuration,
  convertJioSaavnSong,
  JioSaavnSong,
  getBestImageUrl,
} from "@/lib/musicData";
import { usePlayer } from "@/contexts/PlayerContext";
import { getUserPlaylists, UserPlaylist } from "@/lib/storage";
import { getApiUrl } from "@/lib/query-client";
import { getPlaylistById, firestorePlaylistToLocalSongs } from "@/lib/firestore";
import SongRow from "@/components/SongRow";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function PlaylistScreen() {
  const { id, jiosaavn, firestore } = useLocalSearchParams<{ id: string; jiosaavn?: string; firestore?: string }>();
  const insets = useSafeAreaInsets();
  const { playSong } = usePlayer();

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [loading, setLoading] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistCover, setPlaylistCover] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    if (firestore === "true") {
      setLoading(true);
      getPlaylistById(id)
        .then((playlist) => {
          if (playlist) {
            setPlaylistName(playlist.name);
            setPlaylistDescription(playlist.description || `${playlist.songs.length} songs`);
            setPlaylistCover(playlist.imageUrl);
            setSongs(firestorePlaylistToLocalSongs(playlist));
          } else {
            setNotFound(true);
          }
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false));
    } else if (jiosaavn === "true") {
      setLoading(true);
      const apiUrl = getApiUrl();
      fetch(`${apiUrl}api/jiosaavn/playlists?id=${id}`)
        .then((res) => res.json())
        .then((json: any) => {
          if (json.success && json.data) {
            const data = json.data;
            setPlaylistName(data.name || "");
            setPlaylistCover(
              Array.isArray(data.image) ? getBestImageUrl(data.image) : data.image || ""
            );
            setPlaylistDescription(`${data.songCount || 0} songs`);
            const converted = (data.songs || []).map((s: JioSaavnSong) =>
              convertJioSaavnSong(s)
            );
            setSongs(converted);
          } else {
            setNotFound(true);
          }
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false));
    } else {
      getUserPlaylists().then((playlists: UserPlaylist[]) => {
        const found = playlists.find((p) => p.id === id);
        if (found) {
          setPlaylistName(found.name);
          setPlaylistDescription(found.description);
          setPlaylistCover(found.coverUrl);
          setSongs(found.songs);
        } else {
          setNotFound(true);
        }
      });
    }
  }, [id, jiosaavn, firestore]);

  const totalDuration = useMemo(() => {
    return songs.reduce((acc, s) => acc + s.duration, 0);
  }, [songs]);

  const totalMinutes = Math.floor(totalDuration / 60);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Playlist not found</Text>
        </View>
      </View>
    );
  }

  const handlePlayAll = () => {
    if (songs.length === 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playSong(songs[0], songs);
  };

  const handleShufflePlay = () => {
    if (songs.length === 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#333333", Colors.background]}
          style={[styles.headerGradient, { paddingTop: topInset }]}
        >
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>

          <View style={styles.coverContainer}>
            {playlistCover ? (
              <Image
                source={{ uri: playlistCover }}
                style={styles.cover}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]}>
                <Ionicons name="musical-notes" size={64} color={Colors.subtext} />
              </View>
            )}
          </View>

          <Text style={styles.playlistName}>{playlistName}</Text>
          {playlistDescription ? (
            <Text style={styles.playlistDesc}>{playlistDescription}</Text>
          ) : null}
          <Text style={styles.playlistMeta}>
            {songs.length} songs · {totalMinutes} min
          </Text>
        </LinearGradient>

        <View style={styles.actionRow}>
          <Pressable onPress={handleShufflePlay} style={styles.shuffleBtn}>
            <Ionicons name="shuffle" size={20} color={Colors.text} />
          </Pressable>
          <Pressable onPress={handlePlayAll} style={styles.playAllBtn}>
            <Ionicons name="play" size={24} color={Colors.black} />
          </Pressable>
        </View>

        {songs.map((song, i) => (
          <SongRow key={song.id} song={song} index={i} queue={songs} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    alignItems: "center",
  },
  backButton: {
    alignSelf: "flex-start",
    padding: 8,
    marginBottom: 8,
  },
  coverContainer: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  cover: {
    width: Math.min(SCREEN_WIDTH * 0.55, 240),
    height: Math.min(SCREEN_WIDTH * 0.55, 240),
    borderRadius: 8,
  },
  coverPlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistName: {
    color: Colors.text,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 16,
    textAlign: "center",
  },
  playlistDesc: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    textAlign: "center",
  },
  playlistMeta: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  shuffleBtn: {
    padding: 10,
  },
  playAllBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
