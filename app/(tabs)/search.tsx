import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { genres, convertJioSaavnSong, getBestImageUrl, Song } from "@/lib/musicData";
import { getApiUrl } from "@/lib/query-client";
import SongRow from "@/components/SongRow";

interface PlaylistResult {
  id: string;
  name: string;
  image: Array<{ quality: string; url: string }>;
  songCount: number;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [songResults, setSongResults] = useState<Song[]>([]);
  const [playlistResults, setPlaylistResults] = useState<PlaylistResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSongResults([]);
      setPlaylistResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const apiUrl = getApiUrl();

    try {
      const [songsRes, playlistsRes] = await Promise.all([
        fetch(`${apiUrl}api/jiosaavn/search/songs?query=${encodeURIComponent(searchQuery)}&limit=20`),
        fetch(`${apiUrl}api/jiosaavn/search/playlists?query=${encodeURIComponent(searchQuery)}&limit=10`),
      ]);

      const songsData = await songsRes.json();
      const playlistsData = await playlistsRes.json();

      if (songsData.success && songsData.data?.results) {
        setSongResults(songsData.data.results.map(convertJioSaavnSong));
      } else {
        setSongResults([]);
      }

      if (playlistsData.success && playlistsData.data?.results) {
        setPlaylistResults(playlistsData.data.results);
      } else {
        setPlaylistResults([]);
      }
    } catch {
      setSongResults([]);
      setPlaylistResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChangeText = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    if (text.length < 2) {
      setSongResults([]);
      setPlaylistResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    debounceTimer.current = setTimeout(() => {
      performSearch(text);
    }, 500);
  }, [performSearch]);

  const handleGenrePress = useCallback((genreName: string) => {
    setQuery(genreName);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    setIsLoading(true);
    performSearch(genreName);
  }, [performSearch]);

  const handleClear = useCallback(() => {
    setQuery("");
    setSongResults([]);
    setPlaylistResults([]);
    setIsLoading(false);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const hasResults = songResults.length > 0 || playlistResults.length > 0;
  const showBrowse = query.length < 2;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <Text style={styles.header}>Search</Text>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Colors.background} />
        <TextInput
          style={styles.input}
          placeholder="Songs, artists, or playlists"
          placeholderTextColor={Colors.inactive}
          value={query}
          onChangeText={handleChangeText}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={handleClear}>
            <Ionicons name="close-circle" size={20} color={Colors.inactive} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {showBrowse && (
          <>
            <Text style={styles.sectionTitle}>Browse All</Text>
            <View style={styles.genreGrid}>
              {genres.map((genre) => (
                <Pressable
                  key={genre.id}
                  style={[styles.genreCard, { backgroundColor: genre.color }]}
                  onPress={() => handleGenrePress(genre.name)}
                >
                  <Text style={styles.genreName}>{genre.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {!showBrowse && isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        {!showBrowse && !isLoading && !hasResults && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={Colors.inactive} />
            <Text style={styles.emptyText}>No results found</Text>
          </View>
        )}

        {!isLoading && songResults.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Songs</Text>
            {songResults.map((song) => (
              <SongRow key={song.id} song={song} queue={songResults} />
            ))}
          </>
        )}

        {!isLoading && playlistResults.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Playlists</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playlistScroll}>
              {playlistResults.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  style={styles.playlistCard}
                  onPress={() =>
                    router.push({
                      pathname: "/playlist/[id]",
                      params: { id: playlist.id, jiosaavn: "true" },
                    })
                  }
                >
                  <Image
                    source={{ uri: getBestImageUrl(playlist.image) }}
                    style={styles.playlistCover}
                    contentFit="cover"
                  />
                  <Text style={styles.playlistName} numberOfLines={2}>
                    {playlist.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
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
  header: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.text,
    marginHorizontal: 16,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    color: Colors.background,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    padding: 0,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 8,
  },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
  },
  genreCard: {
    width: "45%",
    height: 100,
    borderRadius: 8,
    margin: "2.5%",
    padding: 16,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  genreName: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  playlistScroll: {
    paddingLeft: 16,
    marginBottom: 16,
  },
  playlistCard: {
    marginRight: 12,
    width: 130,
  },
  playlistCover: {
    width: 130,
    height: 130,
    borderRadius: 6,
  },
  playlistName: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 6,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
