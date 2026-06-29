/**
 * Download Queue — concurrency-limited, race-condition-free download engine.
 *
 * Design:
 * - MAX_CONCURRENT downloads run at once (default 2). Others wait in a pending list.
 * - A per-song mutex (startingSet) prevents two concurrent calls for the same song
 *   from both passing the "already running" guard.
 * - Progress callbacks update the in-memory store only (no AsyncStorage read per tick).
 * - When a slot frees up, the next pending song is automatically started.
 */

import {
  createDownloadResumable,
  DownloadResumable,
} from "expo-file-system/legacy";
import {
  DownloadItem,
  DownloadStatus,
  DownloadPreferences,
} from "@/types/downloads";
import {
  saveDownload,
  loadDownload,
  updateDownloadMemory,
} from "@/lib/downloads/downloadStore";
import {
  ensureTrackDir,
  getTrackFileUri,
  hasSufficientStorage,
} from "@/lib/downloads/storagePolicy";
import { getAudioUrlByQuality } from "@/lib/downloads/audioQuality";
import { logger } from "@/lib/logger";

// ─── Concurrency config ───────────────────────────────────────────────────────

const MAX_CONCURRENT = 2;

// ─── Event emitter ────────────────────────────────────────────────────────────

type QueueEventType = "progress" | "status" | "completed" | "failed";
type QueueListener = (songId: string, item: DownloadItem) => void;

const listeners = new Map<QueueEventType, Set<QueueListener>>();

export function onQueueEvent(event: QueueEventType, fn: QueueListener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

function emit(event: QueueEventType, songId: string, item: DownloadItem) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(songId, item); } catch { /* ignore */ }
  });
}

// ─── Queue state ──────────────────────────────────────────────────────────────

/** Songs actively downloading right now. */
const activeHandles = new Map<string, DownloadResumable>();

/** Songs waiting for a free slot. */
const pendingQueue: string[] = [];

/** Guards against two concurrent startDownload calls for the same songId. */
const startingSet = new Set<string>();
const lastProgressPersistAt = new Map<string, number>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PROGRESS_PERSIST_INTERVAL_MS = 1500;

// ─── Slot management ──────────────────────────────────────────────────────────

function activeCount(): number {
  return activeHandles.size;
}

/** Called when a download finishes (success, fail, or cancel) to free its slot. */
function releaseSlot(songId: string) {
  activeHandles.delete(songId);
  startingSet.delete(songId);
  lastProgressPersistAt.delete(songId);
  drainQueue();
}

function clearRetryTimer(songId: string): void {
  const timer = retryTimers.get(songId);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(songId);
  }
}

/** Start the next pending song if a slot is free. */
function drainQueue() {
  while (activeCount() < MAX_CONCURRENT && pendingQueue.length > 0) {
    const next = pendingQueue.shift()!;
    // Fire and forget — errors are handled inside executeDownload
    executeDownload(next).catch(() => {});
  }
}

// ─── Status helper ────────────────────────────────────────────────────────────

async function updateStatus(
  songId: string,
  status: DownloadStatus,
  extra?: Partial<DownloadItem>
): Promise<DownloadItem | null> {
  const item = await loadDownload(songId);
  if (!item) return null;
  const updated: DownloadItem = { ...item, status, ...extra };
  await saveDownload(updated);
  emit("status", songId, updated);
  return updated;
}

// ─── Core download execution ──────────────────────────────────────────────────

async function executeDownload(songId: string): Promise<void> {
  // Double-check guard — prevents re-entry if somehow called twice
  if (activeHandles.has(songId)) return;

  const item = await loadDownload(songId);
  if (!item) return;

  // If it was cancelled while waiting in the pending queue, skip it
  if (item.status === "deleted" || item.status === "completed") return;

  await ensureTrackDir(songId);
  const destUri = getTrackFileUri(songId);

  await updateStatus(songId, "downloading");

  // Select audio URL based on quality preference
  const audioUrl = getAudioUrlByQuality(item.audioUrl, item.quality);
  if (!audioUrl) {
    await updateStatus(songId, "failed", {
      failureReason: "No downloadable audio URL found",
      failedAt: new Date().toISOString(),
    });
    releaseSlot(songId);
    return;
  }

  const handle = createDownloadResumable(
    audioUrl,
    destUri,
    {},
    (progress) => {
      // Progress callback: update cache only — no AsyncStorage read per tick
      const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
      const pct =
        totalBytesExpectedToWrite > 0
          ? Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
          : 0;

      // Read from cache synchronously (no await needed — cache is always current)
      loadDownload(songId).then((current) => {
        if (!current || current.status !== "downloading") return;
        const patched: DownloadItem = {
          ...current,
          progress: pct,
          bytesDownloaded: totalBytesWritten,
          totalBytes: totalBytesExpectedToWrite,
        };
        updateDownloadMemory(patched);
        emit("progress", songId, patched);

        const now = Date.now();
        const lastPersistedAt = lastProgressPersistAt.get(songId) ?? 0;
        if (now - lastPersistedAt >= PROGRESS_PERSIST_INTERVAL_MS || pct >= 100) {
          lastProgressPersistAt.set(songId, now);
          void saveDownload(patched);
        }
      });
    }
  );

  activeHandles.set(songId, handle);

  try {
    const result = await handle.downloadAsync();

    if (!result) {
      // Paused / cancelled by user
      await updateStatus(songId, "paused");
      releaseSlot(songId);
      return;
    }

    const [completedItem, fileSystem] = await Promise.all([
      updateStatus(songId, "completed", {
        progress: 100,
        localPath: result.uri,          // kept for reference but not used for playback
        totalBytes: result.headers?.["Content-Length"]
          ? parseInt(result.headers["Content-Length"], 10)
          : (result as any).totalBytesExpectedToWrite ?? 0,
        bytesDownloaded: (result as any).totalBytesWritten ?? 0,
        completedAt: new Date().toISOString(),
        failureReason: null,
        failedAt: null,
      }),
      import("expo-file-system/legacy"),
    ]);

    // Verify the file actually has content — a 0-byte file means the URL was
    // expired or the download silently failed (common with JioSaavn stream URLs)
    const info = await fileSystem.getInfoAsync(result.uri);
    const fileSize = (info as any).size ?? 0;
    if (!info.exists || fileSize < 1024) {
      // File is empty or missing — mark as failed so it can be retried
      logger.warn("[DownloadQueue] Downloaded file is empty or too small", { songId, fileSize });
      const { deleteAsync } = await import("expo-file-system/legacy");
      await Promise.all([
        deleteAsync(result.uri, { idempotent: true }).catch(() => {}),
        updateStatus(songId, "failed", {
          failureReason: "Downloaded file was empty — stream URL may have expired",
          failedAt: new Date().toISOString(),
        }),
      ]);
      releaseSlot(songId);
      return;
    }

    if (completedItem) emit("completed", songId, completedItem);
    releaseSlot(songId);

  } catch (err: any) {
    const wasCancelled =
      err?.code === "ERR_TASK_CANCELLED" ||
      err?.message?.includes("cancel") ||
      err?.message?.includes("cancelled");

    if (wasCancelled) {
      await updateStatus(songId, "paused");
      releaseSlot(songId);
      return;
    }

    logger.error("[DownloadQueue] download failed", { songId, error: err?.message });

    const current = await loadDownload(songId);
    const retryCount = (current?.retryCount ?? 0) + 1;
    const MAX_RETRIES = 3;

    releaseSlot(songId); // free the slot before retry delay

    if (retryCount <= MAX_RETRIES) {
      await updateStatus(songId, "queued", {
        retryCount,
        failureReason: err?.message ?? "Unknown error",
        failedAt: new Date().toISOString(),
      });
      // Delays for attempts 1, 2, 3 → 2s, 5s, 10s (exponential backoff).
      const delays = [2000, 5000, 10000];
      clearRetryTimer(songId);
      const retryTimer = setTimeout(async () => {
        retryTimers.delete(songId);
        const latest = await loadDownload(songId);
        if (!latest || latest.status !== "queued") return;
        // Re-add to pending queue for the next available slot
        if (!pendingQueue.includes(songId) && !activeHandles.has(songId)) {
          pendingQueue.push(songId);
          drainQueue();
        }
      }, delays[retryCount - 1] ?? 10000);
      retryTimers.set(songId, retryTimer);
    } else {
      const failedItem = await updateStatus(songId, "failed", {
        retryCount,
        failureReason: err?.message ?? "Download failed after retries",
        failedAt: new Date().toISOString(),
      });
      if (failedItem) emit("failed", songId, failedItem);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueDownload(
  item: DownloadItem,
  _prefs: DownloadPreferences
): Promise<void> {
  const songId = item.songId;
  clearRetryTimer(songId);

  // Idempotency: skip if already active or pending
  if (activeHandles.has(songId) || pendingQueue.includes(songId) || startingSet.has(songId)) {
    return;
  }

  await saveDownload({ ...item, status: "queued" });
  emit("status", songId, { ...item, status: "queued" });

  const hasSpace = await hasSufficientStorage();
  if (!hasSpace) {
    await updateStatus(songId, "paused", { failureReason: "Insufficient storage" });
    return;
  }

  if (activeCount() < MAX_CONCURRENT) {
    startingSet.add(songId);
    executeDownload(songId).catch(() => {}).finally(() => startingSet.delete(songId));
  } else {
    // Queue it — will start when a slot opens
    pendingQueue.push(songId);
    await updateStatus(songId, "queued");
  }
}

async function startDownload(songId: string): Promise<void> {
  clearRetryTimer(songId);
  if (activeHandles.has(songId) || startingSet.has(songId)) return;

  if (activeCount() < MAX_CONCURRENT) {
    startingSet.add(songId);
    executeDownload(songId).catch(() => {}).finally(() => startingSet.delete(songId));
  } else {
    if (!pendingQueue.includes(songId)) {
      pendingQueue.push(songId);
    }
    await updateStatus(songId, "queued");
  }
}

export async function pauseDownload(songId: string): Promise<void> {
  clearRetryTimer(songId);
  // Remove from pending queue if waiting
  const pendingIdx = pendingQueue.indexOf(songId);
  if (pendingIdx !== -1) pendingQueue.splice(pendingIdx, 1);

  const handle = activeHandles.get(songId);
  if (handle) {
    try { await handle.pauseAsync(); } catch { /* ignore */ }
    // releaseSlot called inside executeDownload catch block
  }
  await updateStatus(songId, "paused");
}

export async function resumeDownload(
  songId: string,
  _prefs: DownloadPreferences
): Promise<void> {
  const item = await loadDownload(songId);
  if (!item) return;
  clearRetryTimer(songId);
  if (item.status !== "paused" && item.status !== "queued" && item.status !== "failed") return;
  if (activeHandles.has(songId) || startingSet.has(songId)) return;

  const hasSpace = await hasSufficientStorage();
  if (!hasSpace) {
    await updateStatus(songId, "paused", { failureReason: "Insufficient storage" });
    return;
  }

  await startDownload(songId);
}

export async function cancelDownload(songId: string): Promise<void> {
  clearRetryTimer(songId);
  // Remove from pending queue
  const pendingIdx = pendingQueue.indexOf(songId);
  if (pendingIdx !== -1) pendingQueue.splice(pendingIdx, 1);

  const handle = activeHandles.get(songId);
  if (handle) {
    try { await handle.cancelAsync(); } catch { /* ignore */ }
    releaseSlot(songId);
  }
  await updateStatus(songId, "deleted");
}

export async function retryDownload(
  songId: string,
  prefs: DownloadPreferences
): Promise<void> {
  clearRetryTimer(songId);
  await updateStatus(songId, "queued", {
    retryCount: 0,
    failureReason: null,
    failedAt: null,
  });
  await resumeDownload(songId, prefs);
}

/** How many downloads are currently active (for debug/UI). */
function getActiveDownloadCount(): number {
  return activeHandles.size;
}

/** How many downloads are waiting for a slot (for debug/UI). */
function getPendingQueueLength(): number {
  return pendingQueue.length;
}
