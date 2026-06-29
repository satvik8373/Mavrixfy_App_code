/**
 * Download Manager — public API used by UI and playback.
 *
 * This is the single entry point for all download operations.
 * It enforces entitlement, device, territory, and storage rules before
 * delegating to the queue.
 */

import { getBestAudioUrlWithQuality, Song } from "@/lib/musicData";
import {
  DownloadItem,
  DownloadPreferences,
  DownloadEntitlement,
  StorageSummary,
  DownloadStatus,
} from "@/types/downloads";
import {
  loadAllDownloads,
  loadDownload,
  saveDownload,
  removeDownload,
  patchDownload,
} from "@/lib/downloads/downloadStore";
import {
  enqueueDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  retryDownload,
  onQueueEvent,
} from "@/lib/downloads/downloadQueue";
import {
  getDownloadEntitlement,
  getTrackRights,
  isTerritoryAllowed,
} from "@/lib/downloads/entitlement";
import {
  registerDevice,
  getRegisteredDevices,
  writeLicenseCompleted,
  writeLicenseFailed,
  refreshLicenses,
} from "@/lib/downloads/licenseSync";
import {
  deleteTrackFiles,
  deleteAllTrackFiles,
  trackFileExists,
  getTrackFileSize,
  getTrackFileUri,
} from "@/lib/downloads/storagePolicy";
import {
  removeCollectionRef,
  addCollectionRef,
} from "@/lib/downloads/trackReferences";
import { logger } from "@/lib/logger";
import { isYouTubeBackedSong } from "@/lib/downloads/sourceGuards";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DownloadResult =
  | { ok: true }
  | { ok: false; reason: string };

type DownloadableSongSource = Song & {
  url?: unknown;
  uri?: unknown;
  streamUrl?: unknown;
};

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveDownloadAudioUrl(song: Song, quality: DownloadPreferences["quality"]): string {
  const source = song as DownloadableSongSource;
  return (
    getBestAudioUrlWithQuality(song.downloadUrl, quality) ||
    firstString(source.audioUrl, source.streamUrl, source.uri, source.url)
  );
}

// ─── Re-export event subscription ────────────────────────────────────────────

export { onQueueEvent };

// ─── Download a song ─────────────────────────────────────────────────────────

/**
 * Queue a song for download.
 *
 * Enforces:
 * - Entitlement (premium required)
 * - Device registration and device limit
 * - Song cap (MAX_OFFLINE_SONGS)
 * - Track rights (offlineAllowed, territory)
 * - Storage safety
 * - Duplicate detection (idempotent)
 */
export async function downloadSong(
  song: Song,
  uid: string,
  prefs: DownloadPreferences,
  options?: {
    collectionId?: string;
    userCountry?: string | null;
  }
): Promise<DownloadResult> {
  try {
    if (isYouTubeBackedSong(song)) {
      return { ok: false, reason: "YouTube songs are streaming only and cannot be downloaded." };
    }

    const audioUrl = resolveDownloadAudioUrl(song, prefs.quality);
    if (!audioUrl) {
      return { ok: false, reason: "No downloadable audio URL found for this song." };
    }

    // 1. Check entitlement.
    const entitlement = await getDownloadEntitlement(uid);
    if (!entitlement.canDownload) {
      return { ok: false, reason: entitlement.blockedReason ?? "Downloads not available" };
    }

    // 2. Register device and check device limit.
    const devices = await getRegisteredDevices(uid);
    const deviceId = await registerDevice(uid);
    const isRegistered = devices.some((d) => d.deviceId === deviceId);
    if (!isRegistered && devices.length >= entitlement.maxDevices) {
      return {
        ok: false,
        reason: `Device limit reached (${entitlement.maxDevices} devices). Remove a device to continue.`,
      };
    }

    // 3. Check song cap.
    const allDownloads = await loadAllDownloads();
    const completedCount = allDownloads.filter(
      (d) => d.status === "completed"
    ).length;
    if (completedCount >= entitlement.maxOfflineSongs) {
      return {
        ok: false,
        reason: `Offline song limit reached (${entitlement.maxOfflineSongs.toLocaleString()} songs).`,
      };
    }

    // 4. Check track rights.
    const rights = await getTrackRights(song.id);
    if (!rights.offlineAllowed) {
      return { ok: false, reason: "This track is not available for offline playback." };
    }
    if (!rights.downloadable) {
      return { ok: false, reason: "This track cannot be downloaded." };
    }
    if (!isTerritoryAllowed(rights.territoryRights, options?.userCountry ?? null)) {
      return { ok: false, reason: "This track is not available in your region." };
    }

    // 5. Idempotency — if already downloaded or in progress, just add the ref.
    const existing = await loadDownload(song.id);
    if (existing) {
      if (existing.status === "completed") {
        if (options?.collectionId) {
          await addCollectionRef(song.id, options.collectionId);
        }
        return { ok: true };
      }
      if (
        existing.status === "downloading" ||
        existing.status === "queued" ||
        existing.status === "waiting_for_wifi" ||
        existing.status === "waiting_for_charging"
      ) {
        if (options?.collectionId) {
          await addCollectionRef(song.id, options.collectionId);
        }
        return { ok: true };
      }
    }

    // 6. Build the download item.
    const item: DownloadItem = {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      coverUrl: song.coverUrl,
      audioUrl,
      duration: song.duration,
      status: "queued",
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      quality: prefs.quality,
      localPath: null,
      collectionRefs: options?.collectionId ? [options.collectionId] : [],
      retryCount: 0,
      failedAt: null,
      failureReason: null,
      queuedAt: new Date().toISOString(),
      completedAt: null,
      licenseExpiresAt: null,
    };

    // 7. Enqueue.
    await enqueueDownload(item, prefs);

    return { ok: true };
  } catch (err: any) {
    logger.error("[DownloadManager] downloadSong failed", err);
    return { ok: false, reason: err?.message ?? "Unexpected error" };
  }
}

/**
 * Download all songs in a playlist or album.
 * Skips songs that are already downloaded or in progress.
 */
export async function downloadCollection(
  songs: Song[],
  collectionId: string,
  uid: string,
  prefs: DownloadPreferences,
  options?: { userCountry?: string | null }
): Promise<{ queued: number; skipped: number; failed: number }> {
  const results = await Promise.all(songs.map(async (song) => {
    if (isYouTubeBackedSong(song)) {
      return "skipped" as const;
    }

    const result = await downloadSong(song, uid, prefs, {
      collectionId,
      userCountry: options?.userCountry,
    });
    if (result.ok) {
      const item = await loadDownload(song.id);
      if (item?.status === "completed") {
        return "skipped" as const;
      }
      return "queued" as const;
    }
    return "failed" as const;
  }));

  return {
    queued: results.filter((result) => result === "queued").length,
    skipped: results.filter((result) => result === "skipped").length,
    failed: results.filter((result) => result === "failed").length,
  };
}

// ─── Playback handoff ─────────────────────────────────────────────────────────

/**
 * Returns the local file URI for a song if it is fully downloaded and the
 * file exists on disk. Returns null otherwise (caller should stream).
 *
 * IMPORTANT: We always recompute the path from songId using getTrackFileUri()
 * rather than trusting the stored localPath. On iOS the app container path
 * changes on reinstall/update, making stored absolute paths stale.
 */
export async function getLocalPlaybackUrl(songId: string): Promise<string | null> {
  try {
    const item = await loadDownload(songId);
    if (!item || item.status !== "completed") return null;

    // Always recompute from songId — never trust the stored absolute path
    const exists = await trackFileExists(songId);
    if (!exists) return null;

    return getTrackFileUri(songId);
  } catch {
    return null;
  }
}

// ─── Queue management ─────────────────────────────────────────────────────────

export async function pauseSongDownload(songId: string): Promise<void> {
  await pauseDownload(songId);
}

export async function resumeSongDownload(
  songId: string,
  prefs: DownloadPreferences
): Promise<void> {
  await resumeDownload(songId, prefs);
}

export async function retrySongDownload(
  songId: string,
  prefs: DownloadPreferences
): Promise<void> {
  await retryDownload(songId, prefs);
}

/**
 * Remove a song download.
 * If a collectionId is provided, only removes that reference.
 * Bytes are deleted only when no references remain.
 */
export async function removeSongDownload(
  songId: string,
  collectionId?: string
): Promise<void> {
  try {
    if (collectionId) {
      const noRefs = await removeCollectionRef(songId, collectionId);
      if (!noRefs) return; // other collections still reference this track
    }

    await Promise.all([
      cancelDownload(songId),
      deleteTrackFiles(songId),
      removeDownload(songId),
    ]);
  } catch (err) {
    logger.error("[DownloadManager] removeSongDownload failed", err);
  }
}

/** Remove all downloads and delete all local files. */
export async function removeAllDownloads(): Promise<void> {
  try {
    await loadAllDownloads().then((all) =>
      Promise.all(all.map((item) => cancelDownload(item.songId))).then(() =>
        Promise.all([
          deleteAllTrackFiles(),
          // Clear the store after queued jobs have stopped touching these entries.
          Promise.all(all.map((item) => removeDownload(item.songId))),
        ])
      )
    );
  } catch (err) {
    logger.error("[DownloadManager] removeAllDownloads failed", err);
  }
}

// ─── License sync ─────────────────────────────────────────────────────────────

/**
 * Sync licenses with Firestore. Revokes local playback for any tracks whose
 * licenses have expired or been revoked server-side.
 */
export async function syncLicenses(uid: string): Promise<void> {
  try {
    const revokedIds = await refreshLicenses(uid);

    await Promise.all([...revokedIds].map((songId) => patchDownload(songId, {
        status: "revoked",
        licenseExpiresAt: null,
      })));
  } catch (err) {
    logger.error("[DownloadManager] syncLicenses failed", err);
  }
}

/** Write a completed license event after a successful download. */
export async function onDownloadCompleted(
  uid: string,
  songId: string,
  rightsVersion: number
): Promise<void> {
  await writeLicenseCompleted(uid, songId, rightsVersion);
}

/** Write a failed license event after a download failure. */
export async function onDownloadFailed(
  uid: string,
  songId: string,
  failureCode: string
): Promise<void> {
  await writeLicenseFailed(uid, songId, failureCode);
}

// ─── Storage summary ──────────────────────────────────────────────────────────

export async function getStorageSummary(): Promise<StorageSummary> {
  try {
    const all = await loadAllDownloads();
    let totalBytes = 0;
    let completed = 0;
    let pending = 0;
    let failed = 0;

    const completedSizes = await Promise.all(all.map(async (item) => {
      if (item.status === "completed") {
        return { status: "completed" as const, size: await getTrackFileSize(item.songId) };
      }
      if (
        item.status === "queued" ||
        item.status === "downloading" ||
        item.status === "paused" ||
        item.status === "waiting_for_wifi" ||
        item.status === "waiting_for_charging"
      ) {
        return { status: "pending" as const, size: 0 };
      }
      if (item.status === "failed") {
        return { status: "failed" as const, size: 0 };
      }
      return { status: "other" as const, size: 0 };
    }));

    for (const item of completedSizes) {
      if (item.status === "completed") {
        completed++;
        totalBytes += item.size;
      } else if (item.status === "pending") {
        pending++;
      } else if (item.status === "failed") {
        failed++;
      }
    }

    return {
      totalDownloadedBytes: totalBytes,
      // Count only active library entries (completed + pending + failed).
      // Excludes terminal/bookkeeping statuses like "deleted", "expired",
      // "revoked" that fall into the "other" bucket — those should not inflate
      // the user-visible track count or break the sum
      // completedTracks + pendingTracks + failedTracks.
      totalDownloadedTracks: completed + pending + failed,
      completedTracks: completed,
      pendingTracks: pending,
      failedTracks: failed,
    };
  } catch {
    return {
      totalDownloadedBytes: 0,
      totalDownloadedTracks: 0,
      completedTracks: 0,
      pendingTracks: 0,
      failedTracks: 0,
    };
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getAllDownloads(): Promise<DownloadItem[]> {
  return loadAllDownloads();
}

export async function getSongDownload(songId: string): Promise<DownloadItem | null> {
  return loadDownload(songId);
}

export async function isDownloaded(songId: string): Promise<boolean> {
  const item = await loadDownload(songId);
  return item?.status === "completed";
}
