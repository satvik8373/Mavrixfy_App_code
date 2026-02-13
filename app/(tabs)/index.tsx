import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { fetch } from "expo/fetch";
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
  { title: "Trending Now", query: "trending now 2026" },
  { title: "Bollywood", query: "bollywood hits" },
  { title: "Romantic", query: "romantic songs" },
  { title: "Punjabi", query: "punjabi hits" },
  { title: "Party", query: "party songs 2026" },
  { title: "Workout", query: "workout songs 2026" },
  { title: "Devotional", query: "devotional songs 2026" },
  { title: "Retro Hits", query: "90s hits" },
  { title: "Regional", query: "tamil hits 2026" },
  { title: "International", query: "english songs 2026" },
];

export default function HomeScreen() {
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
          setRecentlyPlayed(recent.slice(0, 10));
        } catch {}
      };
      loadRecent();
    }, [])
  );

  useEffect(() => {
    const loadData = async () => {
      console.log("🔍 Starting data load...");
      
      // Load Firebase playlists
      try {
        console.log("📦 Fetching public playlists from Firebase...");
        const playlists = await getPublicPlaylists(15);
        console.log(`✅ Loaded ${playlists.length} public playlists`);
        setPublicPlaylists(playlists);
      } catch (error) {
        console.error("❌ Error loading public playlists:", error);
      }

      // Load JioSaavn data
      try {
        const apiUrl = getApiUrl();
        console.log("🎵 API URL:", apiUrl);
        console.log("📦 Fetching JioSaavn playlists...");
        
        const results = await Promise.all(
          CATEGORIES.map(async (cat) => {
            try {
              const url = `${apiUrl}api/jiosaavn/search/playlists?query=${encodeURIComponent(cat.query)}&limit=10`;
              console.log(`🔍 Fetching ${cat.title}:`, url);
              
              const res = await fetch(url);
              console.log(`📡 ${cat.title} response status:`, res.status);
              
              const json = await res.json();
              
              if (json.success && json.data?.results) {
                console.log(`✅ ${cat.title}: ${json.data.results.length} playlists`);
                return { ...cat, results: json.data.results };
              }
              console.log(`⚠️ ${cat.title}: No results`);
              return { ...cat, results: [] };
            } catch (error) {
              console.error(`❌ Error fetching ${cat.title}:`, error);
              return { ...cat, results: [] };
            }
          })
        );
        setCategories(results);
        console.log("✅ All categories loaded");
      } catch (error) {
        console.error("❌ Error loading JioSaavn data:", error);
      }

      setLoading(false);
      console.log("✅ Data load complete");
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Get featured playlists (mix of public and JioSaavn)
  const featuredPlaylists = [
    ...publicPlaylists.slice(0, 3).map(p => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      type: "firestore" as const,
    })),
    ...categories.flatMap(cat => 
      cat.results.slice(0, 2).map(p => ({
        id: p.id,
        name: p.name,
        imageUrl: getBestImageUrl(p.image),
        type: "jiosaavn" as const,
      }))
    ),
  ].slice(0, 6);

  // Get "Today's biggest hits" - first category with results
  const biggestHits = categories.find(cat => cat.results.length > 0)?.results.slice(0, 5) || [];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Avatar and Filters */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {/* Profile Avatar */}
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

        {/* Profile Dropdown */}
        <ProfileDropdown
          visible={showProfileDropdown}
          onClose={() => setShowProfileDropdown(false)}
        />

        {/* Featured Grid (2 columns) */}
        <View style={styles.featuredGrid}>
          {/* Liked Songs Card */}
          <Pressable
            style={({ pressed }) => [
              styles.featuredCard,
              styles.likedSongsCard,
              pressed && styles.cardPressed,
            ]}
            onPress={() => router.push("/liked-songs")}
          >
            <View style={styles.likedSongsIcon}>
              <Ionicons name="heart" size={24} color={Colors.text} />
            </View>
            <Text style={styles.featuredCardTitle}>Liked Songs</Text>
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.subtext} style={styles.featuredCardMenu} />
          </Pressable>

          {/* Featured Playlists */}
          {featuredPlaylists.map((playlist) => (
            <Pressable
              key={playlist.id}
              style={({ pressed }) => [
                styles.featuredCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() =>
                router.push({
                  pathname: "/playlist/[id]",
                  params: { 
                    id: playlist.id, 
                    [playlist.type]: "true" 
                  },
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

        {/* Today's Biggest Hits */}
        {biggestHits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's biggest hits</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              decelerationRate="fast"
              snapToInterval={180}
            >
              {biggestHits.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  style={({ pressed }) => [
                    styles.bigHitCard,
                    pressed && styles.cardPressed,
                  ]}
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
                  />
                  <Text style={styles.bigHitName} numberOfLines={2}>
                    {playlist.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recents */}
        {recentlyPlayed.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recents</Text>
              <Pressable onPress={() => {}}>
                <Text style={styles.showAllText}>Show all</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {recentlyPlayed.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.recentCard,
                    pressed && styles.cardPressed,
                  ]}
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
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Other Categories */}
        {categories.slice(1).map((cat) =>
          cat.results.length > 0 ? (
            <View key={cat.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{cat.title}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              >
                {cat.results.map((playlist) => (
                  <Pressable
                    key={playlist.id}
                    style={({ pressed }) => [
                      styles.playlistCard,
                      pressed && styles.cardPressed,
                    ]}
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
                    />
                    <Text style={styles.playlistName} numberOfLines={1}>
                      {playlist.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null
        )}

        {/* Community Playlists */}
        {publicPlaylists.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Community Playlists</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {publicPlaylists.slice(3).map((playlist) => (
                <Pressable
                  key={playlist.id}
                  style={({ pressed }) => [
                    styles.playlistCard,
                    pressed && styles.cardPressed,
                  ]}
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
                  />
                  <Text style={styles.playlistName} numberOfLines={1}>
                    {playlist.name}
                  </Text>
                  <Text style={styles.playlistCreator} numberOfLines={1}>
                    By {playlist.createdBy?.fullName || "Unknown"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
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
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  likedSongsCard: {
    backgroundColor: "rgba(80, 56, 160, 0.5)",
  },
  likedSongsIcon: {
    width: 60,
    height: 60,
    backgroundColor: "rgba(80, 56, 160, 1)",
    justifyContent: "center",
    alignItems: "center",
  },
  featuredCardImage: {
    width: 60,
    height: 60,
  },
  featuredCardTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    paddingHorizontal: 8,
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
    marginRight: 12,
  },
  bigHitImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  bigHitName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    marginTop: 8,
    lineHeight: 16,
  },
  recentCard: {
    width: 120,
    marginRight: 12,
  },
  recentImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  playlistCard: {
    width: 140,
    marginRight: 12,
  },
  playlistImage: {
    width: 140,
    height: 140,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  playlistName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    marginTop: 6,
  },
  playlistCreator: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.subtext,
    marginTop: 2,
  },
});
