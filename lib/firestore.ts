import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  orderBy,
  limit as firestoreLimit,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { Song } from "./musicData";

export interface FirestorePlaylist {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  isPublic: boolean;
  featured: boolean;
  songs: FirestoreSong[];
  createdBy: {
    id: string;
    uid: string;
    fullName: string;
    imageUrl: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreSong {
  id: string;
  title: string;
  artist: string;
  albumId: string | null;
  imageUrl: string;
  audioUrl: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

function songToFirestore(song: Song): FirestoreSong {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    albumId: null,
    imageUrl: song.coverUrl,
    audioUrl: song.audioUrl,
    duration: song.duration,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function firestoreSongToSong(fs: FirestoreSong): Song {
  return {
    id: fs.id,
    title: fs.title,
    artist: fs.artist,
    coverUrl: fs.imageUrl,
    audioUrl: fs.audioUrl,
    duration: fs.duration,
    album: "",
  };
}

function convertPlaylistDoc(docSnap: any): FirestorePlaylist {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: data.name || "",
    description: data.description || "",
    imageUrl: data.imageUrl || "",
    isPublic: data.isPublic ?? false,
    featured: data.featured ?? false,
    songs: data.songs || [],
    createdBy: data.createdBy || { id: "", uid: "", fullName: "Unknown", imageUrl: "" },
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || "",
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || "",
  };
}

export async function getPublicPlaylists(maxResults = 20): Promise<FirestorePlaylist[]> {
  try {
    const q = query(
      collection(db, "playlists"),
      where("isPublic", "==", true),
      firestoreLimit(maxResults)
    );
    const snap = await getDocs(q);
    return snap.docs.map(convertPlaylistDoc);
  } catch (error) {
    if (__DEV__) console.error("Error fetching public playlists:", error);
    return [];
  }
}

export async function getFeaturedPlaylists(maxResults = 10): Promise<FirestorePlaylist[]> {
  try {
    const q = query(
      collection(db, "playlists"),
      where("featured", "==", true),
      firestoreLimit(maxResults)
    );
    const snap = await getDocs(q);
    return snap.docs.map(convertPlaylistDoc);
  } catch (error) {
    if (__DEV__) console.error("Error fetching featured playlists:", error);
    return [];
  }
}

export async function getUserFirestorePlaylists(userId: string): Promise<FirestorePlaylist[]> {
  try {
    const q = query(
      collection(db, "playlists"),
      where("createdBy.uid", "==", userId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(convertPlaylistDoc);
  } catch (error) {
    if (__DEV__) console.error("Error fetching user playlists:", error);
    return [];
  }
}

export async function getPlaylistById(playlistId: string): Promise<FirestorePlaylist | null> {
  try {
    const docSnap = await getDoc(doc(db, "playlists", playlistId));
    if (!docSnap.exists()) return null;
    return convertPlaylistDoc(docSnap);
  } catch (error) {
    if (__DEV__) console.error("Error fetching playlist:", error);
    return null;
  }
}

export async function createFirestorePlaylist(
  name: string,
  userId: string,
  userName: string,
  userImage: string = "",
  isPublic: boolean = false
): Promise<string | null> {
  try {
    const docRef = await addDoc(collection(db, "playlists"), {
      name,
      description: "",
      imageUrl: "",
      isPublic,
      featured: false,
      songs: [],
      createdBy: {
        id: userId,
        uid: userId,
        fullName: userName,
        imageUrl: userImage,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    if (__DEV__) console.error("Error creating playlist:", error);
    return null;
  }
}

export async function deleteFirestorePlaylist(playlistId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, "playlists", playlistId));
    return true;
  } catch (error) {
    if (__DEV__) console.error("Error deleting playlist:", error);
    return false;
  }
}

export async function addSongToFirestorePlaylist(playlistId: string, song: Song): Promise<boolean> {
  try {
    const playlistRef = doc(db, "playlists", playlistId);
    const fsSong = songToFirestore(song);
    await updateDoc(playlistRef, {
      songs: arrayUnion(fsSong),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    if (__DEV__) console.error("Error adding song to playlist:", error);
    return false;
  }
}

export async function removeSongFromFirestorePlaylist(playlistId: string, songId: string): Promise<boolean> {
  try {
    const playlistRef = doc(db, "playlists", playlistId);
    const playlistSnap = await getDoc(playlistRef);
    if (!playlistSnap.exists()) return false;
    const data = playlistSnap.data();
    const updatedSongs = (data.songs || []).filter((s: any) => s.id !== songId);
    await updateDoc(playlistRef, {
      songs: updatedSongs,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    if (__DEV__) console.error("Error removing song:", error);
    return false;
  }
}

export async function getLikedSongsFromFirestore(userId: string): Promise<Song[]> {
  try {
    if (__DEV__) console.log(`📡 Fetching liked songs from Firestore path: likedSongs/${userId}`);
    const docSnap = await getDoc(doc(db, "likedSongs", userId));
    
    if (!docSnap.exists()) {
      if (__DEV__) console.log("📭 No liked songs document found (this is normal for new users)");
      return [];
    }
    
    const data = docSnap.data();
    const songs: any[] = data.songs || [];
    if (__DEV__) console.log(`✅ Successfully fetched ${songs.length} liked songs from Firestore`);
    
    return songs.map((s) => ({
      id: s.id || s._id || "",
      title: s.title || "",
      artist: s.artist || "",
      coverUrl: s.imageUrl || s.coverUrl || "",
      audioUrl: s.audioUrl || "",
      duration: s.duration || 0,
      album: s.album || "",
    }));
  } catch (error: any) {
    if (__DEV__) {
      console.error("❌ Error fetching liked songs from Firestore:", error);
      console.error("Error code:", error?.code);
      console.error("Error message:", error?.message);
    }
    return [];
  }
}

export async function addLikedSongToFirestore(userId: string, song: Song): Promise<boolean> {
  try {
    if (__DEV__) console.log(`📡 Adding song to Firestore: likedSongs/${userId}`);
    const docRef = doc(db, "likedSongs", userId);
    const fsSong = songToFirestore(song);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      if (__DEV__) console.log("📝 Creating new liked songs document");
      await setDoc(docRef, { songs: [fsSong], updatedAt: serverTimestamp() });
    } else {
      if (__DEV__) console.log("📝 Updating existing liked songs document");
      await updateDoc(docRef, {
        songs: arrayUnion(fsSong),
        updatedAt: serverTimestamp(),
      });
    }
    if (__DEV__) console.log(`✅ Successfully added "${song.title}" to Firestore`);
    return true;
  } catch (error: any) {
    if (__DEV__) {
      console.error(`❌ Error adding liked song to Firestore:`, error);
      console.error("Error code:", error?.code);
      console.error("Error message:", error?.message);
    }
    return false;
  }
}

export async function removeLikedSongFromFirestore(userId: string, songId: string): Promise<boolean> {
  try {
    if (__DEV__) console.log(`📡 Removing song from Firestore: likedSongs/${userId}`);
    const docRef = doc(db, "likedSongs", userId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      if (__DEV__) console.log("⚠️ No liked songs document found");
      return false;
    }
    const data = docSnap.data();
    const updatedSongs = (data.songs || []).filter((s: any) => s.id !== songId);
    await updateDoc(docRef, {
      songs: updatedSongs,
      updatedAt: serverTimestamp(),
    });
    if (__DEV__) console.log(`✅ Successfully removed song from Firestore`);
    return true;
  } catch (error: any) {
    if (__DEV__) {
      console.error("❌ Error removing liked song from Firestore:", error);
      console.error("Error code:", error?.code);
      console.error("Error message:", error?.message);
    }
    return false;
  }
}

export async function getUserProfile(userId: string): Promise<{ fullName: string; imageUrl: string; email: string } | null> {
  try {
    const docSnap = await getDoc(doc(db, "users", userId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
      fullName: data.fullName || data.displayName || "",
      imageUrl: data.imageUrl || data.photoURL || "",
      email: data.email || "",
    };
  } catch (error) {
    if (__DEV__) console.error("Error fetching user profile:", error);
    return null;
  }
}

export function firestorePlaylistToLocalSongs(playlist: FirestorePlaylist): Song[] {
  return playlist.songs.map(firestoreSongToSong);
}
