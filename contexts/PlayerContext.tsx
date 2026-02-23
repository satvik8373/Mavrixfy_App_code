import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode, useEffect } from "react";
import { Platform } from "react-native";
import { Song } from "@/lib/musicData";
import * as Storage from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { getLikedSongsFromFirestore, addLikedSongToFirestore, removeLikedSongFromFirestore } from "@/lib/firestore";

// Conditionally import TrackPlayer only for native platforms
let TrackPlayer: any = null;
let State: any = null;
let Event: any = null;
let usePlaybackState: any = null;
let useProgress: any = null;
let RepeatMode: any = null;
let setupPlayer: any = null;

// Only import TrackPlayer on native platforms (not web or Expo Go)
if (Platform.OS !== 'web') {
  try {
    const trackPlayerModule = require("react-native-track-player");
    TrackPlayer = trackPlayerModule.default;
    State = trackPlayerModule.State;
    Event = trackPlayerModule.Event;
    usePlaybackState = trackPlayerModule.usePlaybackState;
    useProgress = trackPlayerModule.useProgress;
    RepeatMode = trackPlayerModule.RepeatMode;
    
    const trackPlayerLib = require("@/lib/trackPlayer");
    setupPlayer = trackPlayerLib.setupPlayer;
  } catch (error) {
    console.warn('TrackPlayer not available:', error);
  }
}

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

function songToTrack(song: Song): any {
  const audioUrl = song.audioUrl?.trim() || '';
  
  return {
    id: song.id,
    url: audioUrl,
    title: song.title,
    artist: song.artist,
    artwork: song.coverUrl,
    duration: song.duration || 0,
  };
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  
  // Get auth context properly
  const { user: authUser } = useAuth();

  // Use TrackPlayer hooks only if available
  const playbackState = (usePlaybackState && TrackPlayer) ? usePlaybackState() : { state: null };
  const progressData = (useProgress && TrackPlayer) ? useProgress() : { position: 0, duration: 0 };
  const { position, duration: trackDuration } = progressData;

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [likedSongIds, setLikedSongIds] = useState<string[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [albumColor, setAlbumColor] = useState("#282828");
  const [textColor, setTextColor] = useState("#FFFFFF");

  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  const originalQueueRef = useRef<Song[]>([]);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  const isPlaying = State && playbackState.state === State.Playing;
  const progress = trackDuration > 0 ? position / trackDuration : 0;
  const positionMillis = position * 1000;
  const duration = trackDuration * 1000;

  useEffect(() => {
    let mounted = true;
    
    const setup = async () => {
      if (!TrackPlayer || !setupPlayer) {
        if (mounted) {
          setIsPlayerReady(false);
        }
        return;
      }
      
      try {
        await setupPlayer();
        if (mounted) {
          setIsPlayerReady(true);
        }
      } catch (error) {
        if (mounted) {
          setIsPlayerReady(false);
        }
      }
    };
    
    setup();

    return () => {
      mounted = false;
      if (TrackPlayer) {
        TrackPlayer.reset().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    
    const loadLikedSongs = async () => {
      try {
        if (authUser?.id) {
          const firestoreSongs = await getLikedSongsFromFirestore(authUser.id);
          if (!mounted) return;
          
          const localData = await Storage.getLikedSongsData();
          
          if (localData.length > 0 && firestoreSongs.length === 0) {
            for (const song of localData) {
              if (!mounted) return;
              try {
                await addLikedSongToFirestore(authUser.id, song);
              } catch (err) {
                // Silent fail
              }
            }
            if (!mounted) return;
            const updatedSongs = await getLikedSongsFromFirestore(authUser.id);
            if (mounted) {
              setLikedSongs(updatedSongs);
              setLikedSongIds(updatedSongs.map(s => s.id));
            }
          } else if (firestoreSongs.length > 0) {
            if (mounted) {
              setLikedSongs(firestoreSongs);
              setLikedSongIds(firestoreSongs.map(s => s.id));
            }
          } else {
            if (mounted) {
              setLikedSongs([]);
              setLikedSongIds([]);
            }
          }
        } else {
          const ids = await Storage.getLikedSongIds();
          const data = await Storage.getLikedSongsData();
          if (mounted) {
            setLikedSongIds(ids);
            setLikedSongs(data);
          }
        }
      } catch (error) {
        if (mounted) {
          try {
            const ids = await Storage.getLikedSongIds();
            const data = await Storage.getLikedSongsData();
            setLikedSongIds(ids);
            setLikedSongs(data);
          } catch (e) {
            // Silent fail
          }
        }
      }
    };
    
    loadLikedSongs();

    return () => {
      mounted = false;
    };
  }, [authUser?.id]);

  useEffect(() => {
    if (!TrackPlayer || !Event) return;
    
    const subscription = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      try {
        const cr = repeatModeRef.current;
        if (cr === "all") {
          await TrackPlayer.skip(0);
          await TrackPlayer.play();
        }
      } catch (error) {
        // Silent fail
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const loadAndPlaySong = useCallback(async (song: Song, newQueue?: Song[], newIndex?: number) => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      
      setIsLoading(true);
      setCurrentSong(song);
      
      if (newQueue !== undefined) { 
        setQueue(newQueue); 
        queueRef.current = newQueue; 
        originalQueueRef.current = newQueue;
      }
      if (newIndex !== undefined) { 
        setQueueIndex(newIndex); 
        queueIndexRef.current = newIndex; 
      }

      Storage.addRecentlyPlayed({
        id: song.id,
        name: song.title,
        imageUrl: song.coverUrl,
        type: "song",
        data: song,
      });

      if (!song.audioUrl) { 
        setIsLoading(false); 
        return; 
      }

      await TrackPlayer.reset();
      
      const validSongs = (newQueue || [song]).filter(s => s.audioUrl && s.audioUrl.trim() !== '');
      
      if (validSongs.length === 0) {
        setIsLoading(false);
        return;
      }
      
      const tracks = validSongs.map(songToTrack);
      await TrackPlayer.add(tracks);
      
      const validIndex = validSongs.findIndex(s => s.id === song.id);
      await TrackPlayer.skip(validIndex >= 0 ? validIndex : 0);
      await TrackPlayer.play();
      
      if (RepeatMode) {
        const repeatMap = {
          "off": RepeatMode.Off,
          "all": RepeatMode.Queue,
          "one": RepeatMode.Track,
        };
        await TrackPlayer.setRepeatMode(repeatMap[repeatModeRef.current]);
      }
      
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
    }
  }, [isPlayerReady]);

  const playSong = useCallback((song: Song, newQueue?: Song[]) => {
    const q = newQueue || [song];
    const idx = q.findIndex(s => s.id === song.id);
    loadAndPlaySong(song, q, idx >= 0 ? idx : 0);
  }, [loadAndPlaySong]);

  const togglePlay = useCallback(async () => {
    try {
      if (!isPlayerReady || !TrackPlayer || !State) {
        return;
      }
      const state = await TrackPlayer.getPlaybackState();
      if (state.state === State.Playing) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const nextSong = useCallback(async () => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      const cq = queueRef.current;
      const ci = queueIndexRef.current;
      if (cq.length === 0) return;
      
      let ni = ci + 1;
      if (ni >= cq.length) {
        if (repeatModeRef.current === "all") ni = 0; 
        else return;
      }
      
      await TrackPlayer.skipToNext();
      setQueueIndex(ni);
      queueIndexRef.current = ni;
      setCurrentSong(cq[ni]);
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const prevSong = useCallback(async () => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      const cq = queueRef.current;
      const ci = queueIndexRef.current;
      if (cq.length === 0) return;
      
      if (position > 3) {
        await TrackPlayer.seekTo(0);
        return;
      }
      
      let pi = ci - 1;
      if (pi < 0) pi = cq.length - 1;
      
      await TrackPlayer.skipToPrevious();
      setQueueIndex(pi);
      queueIndexRef.current = pi;
      setCurrentSong(cq[pi]);
    } catch (error) {
      // Silent fail
    }
  }, [position, isPlayerReady]);

  const seekTo = useCallback(async (p: number) => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      if (!trackDuration) return;
      const posSeconds = p * trackDuration;
      await TrackPlayer.seekTo(posSeconds);
    } catch (error) {
      // Silent fail
    }
  }, [trackDuration, isPlayerReady]);

  const toggleShuffle = useCallback(() => {
    if (!isPlayerReady || !TrackPlayer) {
      return;
    }
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
        
        TrackPlayer.reset().then(() => {
          const validSongs = shuffled.filter(s => s.audioUrl && s.audioUrl.trim() !== '');
          TrackPlayer.add(validSongs.map(songToTrack)).then(() => {
            TrackPlayer.skip(0);
            TrackPlayer.play();
          }).catch(() => {});
        }).catch(() => {});
      } else {
        const orig = originalQueueRef.current;
        const cs = queueRef.current[queueIndexRef.current];
        const origIdx = orig.findIndex(s => s.id === cs?.id);
        setQueue(orig);
        queueRef.current = orig;
        setQueueIndex(origIdx >= 0 ? origIdx : 0);
        queueIndexRef.current = origIdx >= 0 ? origIdx : 0;
        
        TrackPlayer.reset().then(() => {
          const validSongs = orig.filter(s => s.audioUrl && s.audioUrl.trim() !== '');
          TrackPlayer.add(validSongs.map(songToTrack)).then(() => {
            const validIdx = validSongs.findIndex(s => s.id === cs?.id);
            TrackPlayer.skip(validIdx >= 0 ? validIdx : 0);
            TrackPlayer.play();
          }).catch(() => {});
        }).catch(() => {});
      }
      return next;
    });
  }, [isPlayerReady]);

  const toggleRepeat = useCallback(async () => {
    if (!isPlayerReady || !TrackPlayer || !RepeatMode) {
      return;
    }
    setRepeatMode(prev => {
      const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
      repeatModeRef.current = next;
      
      const repeatMap = {
        "off": RepeatMode.Off,
        "all": RepeatMode.Queue,
        "one": RepeatMode.Track,
      };
      TrackPlayer.setRepeatMode(repeatMap[next]).catch(() => {});
      
      return next;
    });
  }, [isPlayerReady]);

  const toggleLike = useCallback(async (song: Song) => {
    const isCurrentlyLiked = likedSongIds.includes(song.id);
    
    if (isCurrentlyLiked) {
      setLikedSongIds(prev => prev.filter(id => id !== song.id));
      setLikedSongs(prev => prev.filter(s => s.id !== song.id));
      await Storage.removeLikedSong(song.id);
      if (authUser?.id) {
        await removeLikedSongFromFirestore(authUser.id, song.id);
      }
    } else {
      setLikedSongIds(prev => [song.id, ...prev]);
      setLikedSongs(prev => [song, ...prev]);
      await Storage.addLikedSong(song);
      if (authUser?.id) {
        await addLikedSongToFirestore(authUser.id, song);
      }
    }
  }, [likedSongIds, authUser]);

  const isLiked = useCallback((songId: string) => likedSongIds.includes(songId), [likedSongIds]);

  const addToQueue = useCallback(async (song: Song) => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      if (!song.audioUrl || song.audioUrl.trim() === '') {
        return;
      }
      
      setQueue(prev => {
        const next = [...prev, song];
        queueRef.current = next;
        return next;
      });
      await TrackPlayer.add(songToTrack(song));
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const playNext = useCallback(async (song: Song) => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      if (!song.audioUrl || song.audioUrl.trim() === '') {
        return;
      }
      
      setQueue(prev => {
        const ci = queueIndexRef.current;
        const next = [...prev];
        next.splice(ci + 1, 0, song);
        queueRef.current = next;
        return next;
      });
      const ci = queueIndexRef.current;
      await TrackPlayer.add(songToTrack(song), ci + 1);
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const removeFromQueue = useCallback(async (index: number) => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
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
      await TrackPlayer.remove(index);
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

  const clearQueue = useCallback(async () => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      const cs = currentSong;
      if (cs) {
        setQueue([cs]);
        queueRef.current = [cs];
        setQueueIndex(0);
        queueIndexRef.current = 0;
        await TrackPlayer.reset();
        await TrackPlayer.add(songToTrack(cs));
      }
    } catch (error) {
      // Silent fail
    }
  }, [currentSong, isPlayerReady]);

  const shuffleQueue = useCallback(async () => {
    try {
      if (!isPlayerReady || !TrackPlayer) {
        return;
      }
      const ci = queueIndexRef.current;
      const upcoming = queueRef.current.slice(ci + 1);
      for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
      }
      const newQ = [...queueRef.current.slice(0, ci + 1), ...upcoming];
      setQueue(newQ);
      queueRef.current = newQ;
      
      await TrackPlayer.reset();
      
      const validSongs = newQ.filter(s => s.audioUrl && s.audioUrl.trim() !== '');
      await TrackPlayer.add(validSongs.map(songToTrack));
      
      const currentSongId = newQ[ci]?.id;
      const validIndex = validSongs.findIndex(s => s.id === currentSongId);
      await TrackPlayer.skip(validIndex >= 0 ? validIndex : 0);
      await TrackPlayer.play();
    } catch (error) {
      // Silent fail
    }
  }, [isPlayerReady]);

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
