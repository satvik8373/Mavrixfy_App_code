import React, { createContext, useContext, useState, ReactNode, useMemo } from "react";
import { Song } from "@/lib/musicData";

/**
 * Lightweight context for player state only
 * Separating state from actions reduces re-renders
 */

interface PlayerStateValue {
  currentSong: Song | null;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  positionMillis: number;
  isShuffled: boolean;
  repeatMode: "off" | "all" | "one";
  isLoading: boolean;
  albumColor: string;
  textColor: string;
}

const PlayerStateContext = createContext<PlayerStateValue | null>(null);

export function PlayerStateProvider({ 
  children,
  value 
}: { 
  children: ReactNode;
  value: PlayerStateValue;
}) {
  // Memoize to prevent unnecessary re-renders
  const memoizedValue = useMemo(() => value, [
    value.currentSong?.id,
    value.queue.length,
    value.queueIndex,
    value.isPlaying,
    value.progress,
    value.duration,
    value.positionMillis,
    value.isShuffled,
    value.repeatMode,
    value.isLoading,
    value.albumColor,
    value.textColor,
  ]);

  return (
    <PlayerStateContext.Provider value={memoizedValue}>
      {children}
    </PlayerStateContext.Provider>
  );
}

export function usePlayerState() {
  const ctx = useContext(PlayerStateContext);
  if (!ctx) throw new Error("usePlayerState must be used within PlayerStateProvider");
  return ctx;
}
