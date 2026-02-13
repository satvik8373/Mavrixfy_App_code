import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Audio, AVPlaybackStatus } from "expo-av";
import { Song, formatDuration } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";

interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  positionMillis: number;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  likedSongIds: string[];
  likedSongs: Song[];
  isLoading: boolean;
  albumColor: string;
  textColor: string;
}

interface PlayerContextValue extends PlayerState {
  playSong: (song: Song, queue?: Song[]) => void;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  seekTo: (progress: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (song: Song) => void;
  isLiked: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setAlbumColor: (color: string) => void;
  setTextColor: (color: string) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  let authUser: { id: string } | null = null;
  try {
    const authCtx = useAuth();
    authUser = authCtx.user;
  } catch {}

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [positionMillis, setPositionMillis] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [likedSongIds, setLikedSongIds] = useState<string[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [albumColor, setAlbumColor] = useState("#282828");
  const [textColor, setTextColor] = useState("#FFFFFF");

  const soundRef = useRef<Audio.Sound | null>(null);
  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const originalQueueRef = useRef<Song[]>([]);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  useEffect(() => {
    const setup = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch {}

      if (authUser?.id) {
        try {
          console.log("🔐 Loading liked songs for authenticated user:", authUser.id);
          const firestoreSongs = await getLikedSongsFromFirestore(authUser.id);
          console.log(`✅ Loaded ${firestoreSongs.length} liked songs from Firestore`);
          
          // Get local liked songs
          const localIds = await Storage.getLikedSongIds();
          const localData = await Storage.getLikedSongsData();
          
          // Sync local songs to Firestore if user just logged in
          if (localData.length > 0) {
            console.log(`🔄 Syncing ${localData.length} local liked songs to Firestore...`);
            for (const song of localData) {
              if (!firestoreSongs.find(s => s.id === song.id)) {
                try {
                  await addLikedSongToFirestore(authUser.id, song);
                  console.log(`✅ Synced song: ${song.title}`);
                } catch (err) {
                  console.error(`❌ Failed to sync song: ${song.title}`, err);
                }
              }
            }
            // Reload from Firestore after sync
            const updatedSongs = await getLikedSongsFromFirestore(authUser.id);
            setLikedSongs(updatedSongs);
            setLikedSongIds(updatedSongs.map(s => s.id));
          } else {
            setLikedSongs(firestoreSongs);
            setLikedSongIds(firestoreSongs.map(s => s.id));
          }
        } catch (error) {
          console.error("❌ Error loading liked songs from Firestore:", error);
          console.log("⚠️ Falling back to local storage");
          const ids = await Storage.getLikedSongIds();
          const data = await Storage.getLikedSongsData();
          setLikedSongIds(ids);
          setLikedSongs(data);
        }
      } else {
        console.log("👤 Loading liked songs from local storage (guest mode)");
        const ids = await Storage.getLikedSongIds();
        const data = await Storage.getLikedSongsData();
        console.log(`✅ Loaded ${data.length} liked songs from local storage`);
        setLikedSongIds(ids);
        setLikedSongs(data);
      }
    };
    setup();
    return () => { if (soundRef.current) soundRef.current.unloadAsync(); };
  }, [authUser?.id]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPositionMillis(status.positionMillis);
    if (status.durationMillis) {
      setDuration(status.durationMillis);
      setProgress(status.positionMillis / status.durationMillis);
    }
    setIsPlaying(status.isPlaying);
    setIsLoading(status.isBuffering);
    if (status.didJustFinish) handleSongFinished();
  }, []);

  const handleSongFinished = useCallback(() => {
    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    const cr = repeatModeRef.current;
    if (cr === "one") { soundRef.current?.replayAsync(); return; }
    let ni = ci + 1;
    if (ni >= cq.length) {
      if (cr === "all") ni = 0;
      else { setIsPlaying(false); setProgress(0); setPositionMillis(0); return; }
    }
    const ns = cq[ni];
    if (ns) loadAndPlaySong(ns, undefined, ni);
  }, []);

  const loadAndPlaySong = useCallback(async (song: Song, newQueue?: Song[], newIndex?: number) => {
    try {
      setIsLoading(true);
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
      setCurrentSong(song);
      setProgress(0);
      setPositionMillis(0);
      if (newQueue !== undefined) { setQueue(newQueue); queueRef.current = newQueue; originalQueueRef.current = newQueue; }
      if (newIndex !== undefined) { setQueueIndex(newIndex); queueIndexRef.current = newIndex; }

      Storage.addRecentlyPlayed({
        id: song.id,
        name: song.title,
        imageUrl: song.coverUrl,
        type: "song",
        data: song,
      });

      if (!song.audioUrl) { setIsLoading(false); return; }
      const { sound } = await Audio.Sound.createAsync(
        { uri: song.audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
      setIsPlaying(true);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading audio:", error);
      setIsLoading(false);
    }
  }, [onPlaybackStatusUpdate]);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    const q = newQueue || [song];
    const idx = q.findIndex(s => s.id === song.id);
    loadAndPlaySong(song, q, idx >= 0 ? idx : 0);
  }, [loadAndPlaySong]);

  const togglePlay = useCallback(async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  }, []);

  const nextSong = useCallback(() => {
    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;
    let ni = ci + 1;
    if (ni >= cq.length) {
      if (repeatModeRef.current === "all") ni = 0; else return;
    }
    const ns = cq[ni];
    if (ns) loadAndPlaySong(ns, undefined, ni);
  }, [loadAndPlaySong]);

  const prevSong = useCallback(async () => {
    const cq = queueRef.current;
    const ci = queueIndexRef.current;
    if (cq.length === 0) return;
    if (positionMillis > 3000) {
      await soundRef.current?.setPositionAsync(0);
      return;
    }
    let pi = ci - 1;
    if (pi < 0) pi = cq.length - 1;
    const ps = cq[pi];
    if (ps) loadAndPlaySong(ps, undefined, pi);
  }, [positionMillis, loadAndPlaySong]);

  const seekTo = useCallback(async (p: number) => {
    if (!soundRef.current || !duration) return;
    const posMs = Math.floor(p * duration);
    await soundRef.current.setPositionAsync(posMs);
    setProgress(p);
    setPositionMillis(posMs);
  }, [duration]);

  const toggleShuffle = useCallback(() => {
    setIsShuffled(prev => {
      const next = !prev;
      if (next) {
        const cq = [...queueRef.current];
        const ci = queueIndexRef.current;
        const currentSongItem = cq[ci];
        const rest = cq.filter((_, i) => i !== ci);
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        const shuffled = [currentSongItem, ...rest];
        setQueue(shuffled);
        queueRef.current = shuffled;
        setQueueIndex(0);
        queueIndexRef.current = 0;
      } else {
        const orig = originalQueueRef.current;
        const cs = queueRef.current[queueIndexRef.current];
        const origIdx = orig.findIndex(s => s.id === cs?.id);
        setQueue(orig);
        queueRef.current = orig;
        setQueueIndex(origIdx >= 0 ? origIdx : 0);
        queueIndexRef.current = origIdx >= 0 ? origIdx : 0;
      }
      return next;
    });
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
      repeatModeRef.current = next;
      return next;
    });
  }, []);

  const toggleLike = useCallback(async (song: Song) => {
    const isCurrentlyLiked = likedSongIds.includes(song.id);
    if (isCurrentlyLiked) {
      // Unlike song
      setLikedSongIds(prev => prev.filter(id => id !== song.id));
      setLikedSongs(prev => prev.filter(s => s.id !== song.id));
      await Storage.removeLikedSong(song.id);
      if (authUser?.id) {
        try {
          await removeLikedSongFromFirestore(authUser.id, song.id);
          console.log(`✅ Removed "${song.title}" from Firestore`);
        } catch (error) {
          console.error(`❌ Failed to remove "${song.title}" from Firestore:`, error);
        }
      }
    } else {
      // Like song
      setLikedSongIds(prev => [song.id, ...prev]);
      setLikedSongs(prev => [song, ...prev]);
      await Storage.addLikedSong(song);
      if (authUser?.id) {
        try {
          await addLikedSongToFirestore(authUser.id, song);
          console.log(`✅ Added "${song.title}" to Firestore`);
        } catch (error) {
          console.error(`❌ Failed to add "${song.title}" to Firestore:`, error);
        }
      }
    }
  }, [likedSongIds, authUser?.id]);

  const isLiked = useCallback((songId: string) => likedSongIds.includes(songId), [likedSongIds]);

  const addToQueue = useCallback((song: Song) => {
    setQueue(prev => {
      const next = [...prev, song];
      queueRef.current = next;
      return next;
    });
  }, []);

  const playNext = useCallback((song: Song) => {
    setQueue(prev => {
      const ci = queueIndexRef.current;
      const next = [...prev];
      next.splice(ci + 1, 0, song);
      queueRef.current = next;
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index);
      queueRef.current = next;
      if (index < queueIndexRef.current) {
        const ni = queueIndexRef.current - 1;
        setQueueIndex(ni);
        queueIndexRef.current = ni;
      }
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    const cs = currentSong;
    if (cs) {
      setQueue([cs]);
      queueRef.current = [cs];
      setQueueIndex(0);
      queueIndexRef.current = 0;
    }
  }, [currentSong]);

  const shuffleQueue = useCallback(() => {
    const ci = queueIndexRef.current;
    const upcoming = queueRef.current.slice(ci + 1);
    for (let i = upcoming.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }
    const newQ = [...queueRef.current.slice(0, ci + 1), ...upcoming];
    setQueue(newQ);
    queueRef.current = newQ;
  }, []);

  const value = useMemo(() => ({
    currentSong, queue, queueIndex, isPlaying, progress, duration, positionMillis,
    isShuffled, repeatMode, likedSongIds, likedSongs, isLoading, albumColor, textColor,
    playSong, togglePlay, nextSong, prevSong, seekTo, toggleShuffle, toggleRepeat,
    toggleLike, isLiked, addToQueue, playNext, removeFromQueue, clearQueue, shuffleQueue,
    setAlbumColor, setTextColor,
  }), [currentSong, queue, queueIndex, isPlaying, progress, duration, positionMillis,
    isShuffled, repeatMode, likedSongIds, likedSongs, isLoading, albumColor, textColor, playSong, togglePlay, nextSong,
    prevSong, seekTo, toggleShuffle, toggleRepeat, toggleLike, isLiked, addToQueue,
    playNext, removeFromQueue, clearQueue, shuffleQueue]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
