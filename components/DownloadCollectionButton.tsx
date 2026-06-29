/**
 * DownloadCollectionButton — downloads all songs in a playlist/collection.
 *
 * Before download: shows alert with song count + estimated size, confirm to start.
 * While downloading: shows progress (X/total), tap → pause-all option.
 * All done: green filled icon, tap → confirm remove all.
 */

import React, { useCallback, useMemo } from "react";
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  Alert,
} from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Song } from "@/lib/musicData";
import { useDownloadsSafe } from "@/contexts/DownloadContext";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { formatBytes } from "@/lib/downloads/storagePolicy";
import { canDownloadSongSource } from "@/lib/downloads/sourceGuards";

// Average compressed audio file size per minute at high quality (~1.5 MB/min)
const AVG_BYTES_PER_SECOND = 25_000; // ~200 kbps

function estimateCollectionSize(songs: Song[]): number {
  const totalSeconds = songs.reduce((acc, s) => acc + (s.duration ?? 0), 0);
  return totalSeconds * AVG_BYTES_PER_SECOND;
}

// ─── Circular progress ring (shared with DownloadButton) ─────────────────────

interface CircleProgressProps {
  size: number;
  progress: number; // 0–100
  strokeWidth?: number;
}

function CircleProgress({ size, progress, strokeWidth = 2.5 }: CircleProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, progress));
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const center = size / 2;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={center} cy={center} r={radius}
        stroke="rgba(38,225,154,0.18)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <G rotation="-90" origin={`${center}, ${center}`}>
        <Circle
          cx={center} cy={center} r={radius}
          stroke={Colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

interface Props {
  songs: Song[];
  collectionId: string;
  /** Playlist/collection name */
  collectionName?: string;
  /** Playlist/collection cover image URL */
  collectionImage?: string;
  collectionType?: "playlist" | "album";
  /** Label shown next to the icon in full mode. Defaults to "Download All" */
  label?: string;
  style?: object;
  /** Compact mode — icon only, no label */
  compact?: boolean;
}

export default function DownloadCollectionButton({
  songs,
  collectionId,
  collectionName,
  collectionImage,
  collectionType = "playlist",
  label = "Download All",
  style,
  compact = false,
}: Props) {
  const ctx = useDownloadsSafe();
  const downloadableSongs = useMemo(
    () => songs.filter(canDownloadSongSource),
    [songs]
  );
  const skippedYouTubeCount = songs.length - downloadableSongs.length;

  // Derive per-collection download state from the store
  const { completed, downloading, queued, total } = useMemo(() => {
    if (!ctx || downloadableSongs.length === 0) {
      return { completed: 0, downloading: 0, queued: 0, failed: 0, total: 0 };
    }
    let c = 0, d = 0, q = 0, f = 0;
    for (const song of downloadableSongs) {
      const item = ctx.getDownload(song.id);
      if (!item) continue;
      if (item.status === "completed") c++;
      else if (item.status === "downloading") d++;
      else if (
        item.status === "queued" ||
        item.status === "waiting_for_wifi" ||
        item.status === "waiting_for_charging"
      ) q++;
      else if (item.status === "failed") f++;
    }
    return { completed: c, downloading: d, queued: q, failed: f, total: downloadableSongs.length };
  }, [ctx, downloadableSongs]);

  const allDone = total > 0 && completed === total;
  const isActive = downloading > 0 || queued > 0;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handlePress = useCallback(() => {
    if (!ctx) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);

    // ── All downloaded → confirm remove ──────────────────────────────────────
    if (allDone) {
      Alert.alert(
        "Remove Downloads",
        `Remove all ${total} downloaded songs from this collection?\n\nThis will free up storage on your device.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove All",
            style: "destructive",
            onPress: async () => {
              await Promise.all(downloadableSongs.map((song) => ctx.removeDownload(song.id, collectionId)));
            },
          },
        ]
      );
      return;
    }

    // ── Actively downloading → pause all or show status ───────────────────────
    if (isActive) {
      const inProgressCount = downloading + queued;
      Alert.alert(
        "Downloading",
        `${completed} of ${total} songs downloaded.\n${inProgressCount} in progress.`,
        [
          { text: "Keep Downloading", style: "cancel" },
          {
            text: "Pause All",
            onPress: async () => {
              const pauseableSongs = downloadableSongs.filter((song) => {
                const item = ctx.getDownload(song.id);
                return (
                  item?.status === "downloading" ||
                  item?.status === "queued" ||
                  item?.status === "waiting_for_wifi" ||
                  item?.status === "waiting_for_charging"
                );
              });
              await Promise.all(pauseableSongs.map((song) => ctx.pauseDownload(song.id)));
            },
          },
        ]
      );
      return;
    }

    // ── Not started / paused → show confirm alert with size estimate ──────────
    const songsToDownload = downloadableSongs.filter((s) => {
      const item = ctx.getDownload(s.id);
      return !item || item.status === "failed" || item.status === "paused" || item.status === "deleted";
    });

    const estimatedBytes = estimateCollectionSize(songsToDownload);
    const sizeLabel = formatBytes(estimatedBytes);
    const songWord = songsToDownload.length === 1 ? "song" : "songs";
    const skippedNote =
      skippedYouTubeCount > 0
        ? `\n\n${skippedYouTubeCount} YouTube ${skippedYouTubeCount === 1 ? "song is" : "songs are"} streaming only and will be skipped.`
        : "";

    Alert.alert(
      "Download Collection",
      `Download ${songsToDownload.length} ${songWord} for offline playback?${skippedNote}\n\nEstimated size: ~${sizeLabel}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Download",
          onPress: async () => {
            // Save collection metadata before downloading
            if (collectionName || collectionImage) {
              const { saveCollectionMetadata } = await import("@/lib/downloads/collectionMetadata");
              await saveCollectionMetadata(collectionId, {
                name: collectionName || "Playlist",
                imageUrl: collectionImage || "",
                type: collectionType,
                songCount: songsToDownload.length,
              });
            }
            
            const result = await ctx.downloadCollection(songsToDownload, collectionId);
            if (result.queued === 0 && result.failed > 0) {
              Alert.alert("Download Failed", "Could not queue songs for download.");
            }
          },
        },
      ]
    );
  }, [
    ctx,
    allDone,
    isActive,
    downloadableSongs,
    collectionId,
    collectionImage,
    collectionName,
    collectionType,
    skippedYouTubeCount,
    total,
    completed,
    downloading,
    queued,
  ]);

  if (!ctx || downloadableSongs.length === 0) return null;

  // ─── Icon / label state ────────────────────────────────────────────────────

  const iconName: any = allDone
    ? "arrow-down-circle"
    : isActive
    ? "pause-circle"
    : "arrow-down-circle-outline";

  const iconColor = allDone
    ? Colors.primary
    : isActive
    ? Colors.primary
    : Colors.subtext;

  // ─── Compact mode (icon only) ──────────────────────────────────────────────

  if (compact) {
    const ringSize = 26;
    const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const pauseBarH = ringSize * 0.28;
    const pauseBarW = ringSize * 0.1;
    const gap = ringSize * 0.08;

    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.compactBtn, pressed && styles.pressed, style]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={
          allDone ? "Remove all downloads" :
          isActive ? `Downloading — ${completed} of ${total}. Tap to pause.` :
          "Download all songs"
        }
        accessibilityRole="button"
      >
        {isActive && !allDone ? (
          // Circular ring showing collection-level progress + pause icon
          <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center" }}>
            <CircleProgress size={ringSize} progress={completedPct} strokeWidth={2.2} />
            {/* Pause bars */}
            <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
              <View style={[styles.pauseBar, { width: pauseBarW, height: pauseBarH, marginRight: gap }]} />
              <View style={[styles.pauseBar, { width: pauseBarW, height: pauseBarH }]} />
            </View>
            {/* X/total count below */}
            <Text style={styles.compactCount}>{completed}/{total}</Text>
          </View>
        ) : (
          <Ionicons name={iconName} size={22} color={iconColor} />
        )}
      </Pressable>
    );
  }

  // ─── Full mode (icon + label) ──────────────────────────────────────────────

  const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const ringSize = 20;
  const pauseBarH = ringSize * 0.3;
  const pauseBarW = ringSize * 0.11;
  const gap = ringSize * 0.09;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, style]}
      accessibilityLabel={allDone ? "Remove all downloads" : label}
      accessibilityRole="button"
    >
      {isActive && !allDone ? (
        <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center", marginRight: 6 }}>
          <CircleProgress size={ringSize} progress={completedPct} strokeWidth={2} />
          <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
            <View style={[styles.pauseBar, { width: pauseBarW, height: pauseBarH, marginRight: gap }]} />
            <View style={[styles.pauseBar, { width: pauseBarW, height: pauseBarH }]} />
          </View>
        </View>
      ) : (
        <Ionicons name={iconName} size={18} color={iconColor} style={{ marginRight: 6 }} />
      )}
      <Text style={[styles.label, allDone && styles.labelDone, isActive && styles.labelActive]}>
        {allDone
          ? "Downloaded"
          : isActive
          ? `${completed}/${total} · Pause`
          : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  pressed: { opacity: 0.65 },
  label: {
    color: Colors.subtext,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  labelDone: {
    color: Colors.primary,
  },
  labelActive: {
    color: Colors.primary,
  },
  compactBtn: {
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  ringCenter: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  pauseBar: {
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  compactCount: {
    color: Colors.primary,
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
    position: "absolute",
    bottom: -10,
  },
});
