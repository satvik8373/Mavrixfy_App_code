import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { usePlayer } from "@/contexts/PlayerContext";
import { useAuth } from "@/contexts/AuthContext";
import { getUserPlaylists, createUserPlaylist, deleteUserPlaylist, UserPlaylist } from "@/lib/storage";
import {
  getUserFirestorePlaylists,
  createFirestorePlaylist,
  deleteFirestorePlaylist,
  FirestorePlaylist,
} from "@/lib/firestore";

type Filter = "playlists" | "liked";

type DisplayPlaylist = UserPlaylist & { isFirestore?: boolean };

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("playlists");
  const { likedSongIds } = usePlayer();
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<DisplayPlaylist[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const loadPlaylists = useCallback(async () => {
    try {
      let allPlaylists: DisplayPlaylist[] = [];

      if (user && user.id) {
        // User is authenticated - load from both Firestore and AsyncStorage
        const [firestorePlaylists, localPlaylists] = await Promise.all([
          getUserFirestorePlaylists(user.id),
          getUserPlaylists(),
        ]);

        // Convert Firestore playlists to display format
        const convertedFirestore: DisplayPlaylist[] = firestorePlaylists.map((fp) => ({
          id: fp.id,
          name: fp.name,
          description: fp.description,
          coverUrl: fp.imageUrl,
          songs: [], // We don't need the actual songs in the list view
          createdAt: new Date(fp.createdAt).getTime(),
          updatedAt: new Date(fp.updatedAt).getTime(),
          isFirestore: true,
        }));

        // Find local-only playlists (ones that don't exist in Firestore)
        const firestoreIds = new Set(firestorePlaylists.map((fp) => fp.id));
        const localOnlyPlaylists = localPlaylists.filter((p) => !firestoreIds.has(p.id));

        // Merge: Firestore playlists first, then local-only playlists
        allPlaylists = [...convertedFirestore, ...localOnlyPlaylists];
      } else {
        // Guest user or not authenticated - load from AsyncStorage only
        const localPlaylists = await getUserPlaylists();
        allPlaylists = localPlaylists;
      }

      setPlaylists(allPlaylists);
    } catch (error) {
      console.error("Error loading playlists:", error);
      // Fallback to AsyncStorage on error
      const localPlaylists = await getUserPlaylists();
      setPlaylists(localPlaylists);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadPlaylists();
    }, [loadPlaylists])
  );

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;

    try {
      if (user && user.id) {
        // Create in Firestore for authenticated users
        const firestoreId = await createFirestorePlaylist(
          name,
          user.id,
          user.name,
          user.picture,
          false
        );

        if (firestoreId) {
          // Also create in AsyncStorage as fallback/cache
          await createUserPlaylist(name);
        }
      } else {
        // Create only in AsyncStorage for guests
        await createUserPlaylist(name);
      }

      setNewPlaylistName("");
      setShowCreateModal(false);
      loadPlaylists();
    } catch (error) {
      console.error("Error creating playlist:", error);
      Alert.alert("Error", "Failed to create playlist. Please try again.");
    }
  };

  const handleDeletePlaylist = (playlist: DisplayPlaylist) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Playlist", `Are you sure you want to delete "${playlist.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (playlist.isFirestore) {
              // Delete from Firestore
              await deleteFirestorePlaylist(playlist.id);
            } else {
              // Delete from AsyncStorage
              await deleteUserPlaylist(playlist.id);
            }
            loadPlaylists();
          } catch (error) {
            console.error("Error deleting playlist:", error);
            Alert.alert("Error", "Failed to delete playlist. Please try again.");
          }
        },
      },
    ]);
  };

  const handleAddPress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCreateModal(true);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Your Library</Text>
        <Pressable onPress={handleAddPress} hitSlop={10}>
          <Ionicons name="add" size={28} color={Colors.text} />
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Pressable
          style={[styles.filterChip, filter === "playlists" && styles.filterActive]}
          onPress={() => setFilter("playlists")}
        >
          <Text style={[styles.filterText, filter === "playlists" && styles.filterTextActive]}>
            Playlists
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterChip, filter === "liked" && styles.filterActive]}
          onPress={() => setFilter("liked")}
        >
          <Text style={[styles.filterText, filter === "liked" && styles.filterTextActive]}>
            Liked Songs
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ pressed }) => [styles.likedCard, pressed && styles.pressed]}
          onPress={() => router.push("/liked-songs")}
        >
          <LinearGradient
            colors={["#5b4a9e", "#3b82f6", "#7c3aed"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.likedGradient}
          >
            <Ionicons name="heart" size={24} color={Colors.text} />
          </LinearGradient>
          <View style={styles.likedInfo}>
            <Text style={styles.likedTitle}>Liked Songs</Text>
            <Text style={styles.likedCount}>{likedSongIds.length} songs</Text>
          </View>
        </Pressable>

        {filter === "playlists" && (
          <>
            {playlists.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="musical-notes-outline" size={48} color={Colors.inactive} />
                <Text style={styles.emptyText}>Create your first playlist</Text>
                <Pressable
                  style={styles.emptyButton}
                  onPress={handleAddPress}
                >
                  <Text style={styles.emptyButtonText}>Create Playlist</Text>
                </Pressable>
              </View>
            ) : (
              playlists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  style={({ pressed }) => [styles.playlistRow, pressed && styles.pressed]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (playlist.isFirestore) {
                      router.push({
                        pathname: "/playlist/[id]",
                        params: { id: playlist.id, firestore: "true" },
                      });
                    } else {
                      router.push({ pathname: "/playlist/[id]", params: { id: playlist.id } });
                    }
                  }}
                  onLongPress={() => handleDeletePlaylist(playlist)}
                >
                  {playlist.coverUrl ? (
                    <Image source={{ uri: playlist.coverUrl }} style={styles.playlistCover} contentFit="cover" />
                  ) : (
                    <View style={[styles.playlistCover, styles.playlistCoverPlaceholder]}>
                      <Ionicons name="musical-notes" size={24} color={Colors.inactive} />
                    </View>
                  )}
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
                    <Text style={styles.playlistMeta} numberOfLines={1}>
                      Playlist · {playlist.songs.length} songs
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {filter === "liked" && (
          <Pressable
            style={({ pressed }) => [styles.likedCard, pressed && styles.pressed]}
            onPress={() => router.push("/liked-songs")}
          >
            <LinearGradient
              colors={["#5b4a9e", "#3b82f6", "#7c3aed"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.likedGradient}
            >
              <Ionicons name="heart" size={24} color={Colors.text} />
            </LinearGradient>
            <View style={styles.likedInfo}>
              <Text style={styles.likedTitle}>Liked Songs</Text>
              <Text style={styles.likedCount}>{likedSongIds.length} songs</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCreateModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>New Playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor={Colors.inactive}
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              autoFocus
              selectionColor={Colors.primary}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => {
                  setNewPlaylistName("");
                  setShowCreateModal(false);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalCreate, !newPlaylistName.trim() && styles.modalCreateDisabled]}
                onPress={handleCreatePlaylist}
              >
                <Text style={styles.modalCreateText}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  header: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  filters: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  filterActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  filterTextActive: {
    color: Colors.black,
    fontFamily: "Inter_600SemiBold",
  },
  scrollView: {
    flex: 1,
  },
  likedCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  likedGradient: {
    width: 56,
    height: 56,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  likedInfo: {
    flex: 1,
  },
  likedTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  likedCount: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  playlistCover: {
    width: 56,
    height: 56,
    borderRadius: 4,
    marginRight: 12,
  },
  playlistCoverPlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  playlistMeta: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.primary,
  },
  emptyButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancel: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  modalCancelText: {
    color: Colors.subtext,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  modalCreate: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  modalCreateDisabled: {
    opacity: 0.5,
  },
  modalCreateText: {
    color: Colors.black,
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
