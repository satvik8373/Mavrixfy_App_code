import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { fetch } from "expo/fetch";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getBestImageUrl, JioSaavnImage } from "@/lib/musicData";
import { getRecentlyPlayed, RecentlyPlayedItem } from "@/lib/storage";
import { getApiUrl } from "@/lib/query-client";
import { getPublicPlaylists, FirestorePlaylist, firestorePlaylistToLocalSongs } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { useScreenTracking } from "@/hooks/useScreenTracking";

interface JioSaavnPlaylistResult {
  id: string;
  name: string;
  image: JioSaavnImage[];
  songCount: number;
}

interface CategoryData {
  title: string;
  query: string;
  results: JioSaavnPlaylistResult[];
}

const CATEGORIES: { title: string; query: string }[] = [
  { title: "Trending Now", query: "top 50" },
  { title: "Bollywood Hits", query: "bollywood" },
  { title: "Romantic", query: "romantic" },
  { title: "Punjabi", query: "punjabi" },
  { title: "Party Anthems", query: "party" },
  { title: "Workout", query: "workout" },
  { title: "Devotional", query: "devotional" },
  { title: "90s Retro", query: "90s" },
  { title: "Tamil Hits", query: "tamil" },
  { title: "English Pop", query: "english" },
  { title: "Chill Vibes", query: "chill" },
  { title: "Sad Songs", query: "sad" },
  { title: "Hip Hop", query: "hip hop" },
  { title: "Rock", query: "rock" },
  { title: "Classical", query: "classical" },
];

export default function HomeScreen() {
  useScreenTracking("Home");

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedItem[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [publicPlaylists, setPublicPlaylists] = useState<FirestorePlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "music" | "podcasts">("all");
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getFirstName = () => {
    if (!user?.name) return "";
    return user.name.split(" ")[0];
  };

  useFocusEffect(
    useCallback(() => {
      const loadRecent = async () => {
        try {
          const recent = await getRecentlyPlayed();
          setRecentlyPlayed(recent.slice(0, 6)); // Show only 6 recent items
        } catch { }
      };
      loadRecent();
    }, [])
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        const playlists = await getPublicPlaylists(20);
        setPublicPlaylists(playlists);
      } catch (error) {
        // Silent fail
      }

      try {
        const apiUrl = getApiUrl();

        const results = await Promise.all(
          CATEGORIES.map(async (cat, index) => {
            try {
              await new Promise(resolve => setTimeout(resolve, index * 50));

              const url = `${apiUrl}api/jiosaavn/search/playlists?query=${encodeURIComponent(cat.query)}&limit=20`;

              const res = await fetch(url, {
                headers: {
                  'Accept': 'application/json',
                },
              });

              if (!res.ok) {
                return { ...cat, results: [] };
              }

              const json = await res.json();

              let results = [];
              if (json.success && json.data?.results) {
                results = json.data.results;
              } else if (json.data?.results) {
                results = json.data.results;
              } else if (Array.isArray(json.results)) {
                results = json.results;
              }

              const validPlaylists = results.filter((playlist: JioSaavnPlaylistResult) => {
                return playlist.songCount && playlist.songCount > 0;
              });

              return { ...cat, results: validPlaylists };
            } catch (error) {
              return { ...cat, results: [] };
            }
          })
        );

        const validCategories = results.filter(cat => cat.results.length >= 5);
        setCategories(validCategories);
      } catch (error) {
        // Silent fail
      }

      setLoading(false);
    };

    loadData();
  }, []);

  // Use memoization for heavy filter calculations to prevent re-running on every render
  // IMPORTANT: These must be called before any conditional returns to follow Rules of Hooks
  const featuredPlaylists = React.useMemo(() => {
    return categories
      .filter((cat) => cat.results.length > 0)
      .slice(0, 7)
      .map((cat) => ({
        id: cat.results[0].id,
        name: cat.results[0].name,
        imageUrl: getBestImageUrl(cat.results[0].image),
        type: "jiosaavn" as const,
      }));
  }, [categories]);

  const biggestHits = React.useMemo(() => {
    return categories.find((cat) => cat.results.length >= 8)?.results.slice(0, 8) ||
      categories.find((cat) => cat.results.length > 0)?.results || [];
  }, [categories]);

  // Section data structure for the main vertical FlatList to enable complete virtualization
  const sections = React.useMemo(() => {
    const data = [];

    // 1. Featured Grid (Liked Songs + first 5 featured playlists to fit 2 columns nicely)
    data.push({ id: 'featured', type: 'featured' });

    // 2. Public Playlists
    if (publicPlaylists.length > 0) {
      data.push({ id: 'public-playlists', type: 'public-playlists' });
    }

    // 3. Biggest Hits
    if (biggestHits.length >= 5) {
      data.push({ id: 'biggest-hits', type: 'biggest-hits' });
    }

    // 4. Recents
    if (recentlyPlayed.length > 0) {
      data.push({ id: 'recents', type: 'recents' });
    }

    // 5. Other Categories
    const otherCategories = categories.slice(1).filter(cat => cat.results.length >= 5);
    otherCategories.forEach((cat) => {
      data.push({ id: `category-${cat.title}`, type: 'category', data: cat });
    });

    return data;
  }, [categories, publicPlaylists, biggestHits, recentlyPlayed]);

  // Render horizontal items functions - must be before conditional returns
  const renderPublicPlaylist = useCallback(({ item: playlist }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [styles.playlistCard, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/playlist/[id]",
          params: { id: playlist.id, firestore: "true" },
        })
      }
    >
      <Image
        source={{ uri: playlist.imageUrl || undefined }}
        style={styles.playlistImage}
        contentFit="cover"
        transition={200}
      />
      <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
      <Text style={styles.playlistCreator} numberOfLines={1}>
        By {playlist.createdBy?.fullName || "Unknown"}
      </Text>
    </Pressable>
  ), []);

  const renderBigHit = useCallback(({ item: playlist }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [styles.bigHitCard, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/playlist/[id]",
          params: { id: playlist.id, jiosaavn: "true" },
        })
      }
    >
      <Image
        source={{ uri: getBestImageUrl(playlist.image) }}
        style={styles.bigHitImage}
        contentFit="cover"
        transition={200}
      />
      <Text style={styles.bigHitName} numberOfLines={2}>{playlist.name}</Text>
    </Pressable>
  ), []);

  const renderRecent = useCallback(({ item }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [styles.recentCard, pressed && styles.cardPressed]}
      onPress={() => {
        if (item.type === "jiosaavn-playlist") {
          router.push({
            pathname: "/playlist/[id]",
            params: { id: item.id, jiosaavn: "true" },
          });
        } else if (item.type === "playlist") {
          router.push({
            pathname: "/playlist/[id]",
            params: { id: item.id },
          });
        }
      }}
    >
      <Image
        source={{ uri: item.imageUrl }}
        style={styles.recentImage}
        contentFit="cover"
        transition={200}
      />
    </Pressable>
  ), []);

  const renderCategoryPlaylist = useCallback(({ item: playlist }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [styles.playlistCard, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/playlist/[id]",
          params: { id: playlist.id, jiosaavn: "true" },
        })
      }
    >
      <Image
        source={{ uri: getBestImageUrl(playlist.image) }}
        style={styles.playlistImage}
        contentFit="cover"
        transition={200}
      />
      <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
    </Pressable>
  ), []);

  // Use ListHeaderComponent for Header to avoid it scrolling separately
  const renderHeader = useCallback(() => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Pressable onPress={() => setShowProfileDropdown(true)}>
          {isAuthenticated && user?.picture ? (
            <Image
              source={{ uri: user.picture }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={16} color={Colors.black} />
            </View>
          )}
        </Pressable>

        <View style={styles.filterPills}>
          <Pressable
            style={[styles.pill, selectedFilter === "all" && styles.pillActive]}
            onPress={() => setSelectedFilter("all")}
          >
            <Text style={[styles.pillText, selectedFilter === "all" && styles.pillTextActive]}>
              All
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, selectedFilter === "music" && styles.pillActive]}
            onPress={() => setSelectedFilter("music")}
          >
            <Text style={[styles.pillText, selectedFilter === "music" && styles.pillTextActive]}>
              Music
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, selectedFilter === "podcasts" && styles.pillActive]}
            onPress={() => setSelectedFilter("podcasts")}
          >
            <Text style={[styles.pillText, selectedFilter === "podcasts" && styles.pillTextActive]}>
              Podcasts
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  ), [isAuthenticated, user?.picture, selectedFilter]);

  const renderSection = useCallback(({ item: section }: { item: any }) => {
    switch (section.type) {
      case 'featured':
        // Safe slice to Ensure even grid 
        const gridPlaylists = featuredPlaylists.slice(0, 5);
        return (
          <View style={styles.featuredGrid}>
            <Pressable
              style={({ pressed }) => [styles.featuredCard, styles.likedSongsCard, pressed && styles.cardPressed]}
              onPress={() => router.push("/(tabs)/liked-songs")}
            >
              <View style={styles.likedSongsIcon}>
                <Ionicons name="heart" size={24} color={Colors.text} />
              </View>
              <Text style={styles.featuredCardTitle}>Liked Songs</Text>
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.subtext} style={styles.featuredCardMenu} />
            </Pressable>

            {gridPlaylists.map((playlist) => (
              <Pressable
                key={playlist.id}
                style={({ pressed }) => [styles.featuredCard, pressed && styles.cardPressed]}
                onPress={() =>
                  router.push({
                    pathname: "/playlist/[id]",
                    params: { id: playlist.id, [playlist.type]: "true" },
                  })
                }
              >
                <Image
                  source={{ uri: playlist.imageUrl }}
                  style={styles.featuredCardImage}
                  contentFit="cover"
                />
                <Text style={styles.featuredCardTitle} numberOfLines={2}>
                  {playlist.name}
                </Text>
              </Pressable>
            ))}
          </View>
        );

      case 'public-playlists':
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Public Playlists</Text>
            <FlatList
              data={publicPlaylists}
              renderItem={renderPublicPlaylist}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              initialNumToRender={3}
              maxToRenderPerBatch={4}
              windowSize={5}
            />
          </View>
        );

      case 'biggest-hits':
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's biggest hits</Text>
              <Pressable>
                <Text style={styles.showAllText}>Show all</Text>
              </Pressable>
            </View>
            <FlatList
              data={biggestHits.slice(0, 10)}
              renderItem={renderBigHit}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              initialNumToRender={3}
              maxToRenderPerBatch={4}
              windowSize={5}
              decelerationRate="fast"
              snapToInterval={176} // 160 width + 16 margin
            />
          </View>
        );

      case 'recents':
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recents</Text>
              <Pressable>
                <Text style={styles.showAllText}>Show all</Text>
              </Pressable>
            </View>
            <FlatList
              data={recentlyPlayed}
              renderItem={renderRecent}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              initialNumToRender={3}
              maxToRenderPerBatch={4}
              windowSize={5}
            />
          </View>
        );

      case 'category':
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.data.title}</Text>
              <Pressable>
                <Text style={styles.showAllText}>Show all</Text>
              </Pressable>
            </View>
            <FlatList
              data={section.data.results.slice(0, 15)}
              renderItem={renderCategoryPlaylist}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              initialNumToRender={4}
              maxToRenderPerBatch={5}
              windowSize={5}
            />
          </View>
        );

      default:
        return null;
    }
  }, [featuredPlaylists, publicPlaylists, biggestHits, recentlyPlayed]);

  // Check loading state after all hooks are defined
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#0a0a0a", "#121212", "#1a1a1a"]}
      style={[styles.container, { paddingTop: topInset }]}
    >
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />
      <ProfileDropdown
        visible={showProfileDropdown}
        onClose={() => setShowProfileDropdown(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  filterPills: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  pillActive: {
    backgroundColor: Colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  pillTextActive: {
    color: Colors.black,
  },
  featuredGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
  },
  featuredCard: {
    width: "48%" as any,
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 6,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  likedSongsCard: {
    backgroundColor: "#5038a0",
  },
  likedSongsIcon: {
    width: 64,
    height: 64,
    backgroundColor: "#5038a0",
    justifyContent: "center",
    alignItems: "center",
  },
  featuredCardImage: {
    width: 64,
    height: 64,
  },
  featuredCardTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    paddingHorizontal: 10,
    letterSpacing: -0.2,
  },
  featuredCardMenu: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  cardPressed: {
    opacity: 0.7,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  showAllText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.subtext,
  },
  horizontalList: {
    paddingLeft: 16,
    paddingRight: 8,
  },
  bigHitCard: {
    width: 160,
    marginRight: 16,
  },
  bigHitImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  bigHitName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    marginTop: 8,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  recentCard: {
    width: 160,
    marginRight: 16,
  },
  recentImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  playlistCard: {
    width: 160,
    marginRight: 16,
  },
  playlistImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  playlistName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginTop: 8,
    letterSpacing: -0.2,
  },
  playlistCreator: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    marginTop: 4,
  },
});
