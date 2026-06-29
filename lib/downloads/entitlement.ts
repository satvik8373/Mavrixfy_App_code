/**
 * Download Entitlement — device limit, song cap, and territory rules.
 *
 * Downloads are available to all signed-in users.
 * Only account-disabled / banned users are blocked.
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DownloadEntitlement,
  TrackRights,
  DOWNLOAD_DEVICE_LIMIT,
  MAX_OFFLINE_SONGS,
  LICENSE_GRACE_PERIOD_DAYS,
} from "@/types/downloads";
import { logger } from "@/lib/logger";

// ─── Entitlement ──────────────────────────────────────────────────────────────

function isPermissionDeniedError(err: unknown): boolean {
  const error = err as { code?: unknown; message?: unknown };
  return (
    error?.code === "permission-denied" ||
    (
      typeof error?.message === "string" &&
      error.message.toLowerCase().includes("missing or insufficient permissions")
    )
  );
}

/**
 * Returns the download entitlement for a user.
 * All signed-in users get full download access.
 * Only explicitly disabled / banned accounts are blocked.
 */
export async function getDownloadEntitlement(uid: string): Promise<DownloadEntitlement> {
  const fullAccess: DownloadEntitlement = {
    canDownload: true,
    maxDevices: DOWNLOAD_DEVICE_LIMIT,
    maxOfflineSongs: MAX_OFFLINE_SONGS,
    licenseGracePeriodDays: LICENSE_GRACE_PERIOD_DAYS,
  };

  try {
    if (!db) return fullAccess;

    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return fullAccess;

    const data = snap.data();
    const status: string = data?.subscriptionStatus ?? "";

    // Block only explicitly disabled / banned accounts.
    if (status === "disabled" || status === "banned") {
      return {
        canDownload: false,
        maxDevices: 0,
        maxOfflineSongs: 0,
        licenseGracePeriodDays: LICENSE_GRACE_PERIOD_DAYS,
        blockedReason: "Account disabled",
      };
    }

    return fullAccess;
  } catch (err) {
    logger.error("[Entitlement] getDownloadEntitlement failed", err);
    // Fail open — don't block downloads on a network error.
    return fullAccess;
  }
}

// ─── Track rights check ───────────────────────────────────────────────────────

/**
 * Fetch the download rights for a specific track from the songs collection.
 * Returns permissive defaults if the document is missing (catalog not yet
 * populated with rights metadata).
 */
export async function getTrackRights(songId: string): Promise<TrackRights> {
  const permissive: TrackRights = {
    downloadable: true,
    territoryRights: [],
    drmRequired: false,
    offlineAllowed: true,
    offlineMaxQuality: "high",
    rightsVersion: 1,
  };

  try {
    if (!db) return permissive;

    const songRef = doc(db, "songs", songId);
    const snap = await getDoc(songRef);

    if (!snap.exists()) return permissive;

    const d = snap.data();
    return {
      downloadable: d?.downloadable !== false,
      territoryRights: Array.isArray(d?.territoryRights) ? d.territoryRights : [],
      drmRequired: d?.drmRequired === true,
      offlineAllowed: d?.offlineAllowed !== false,
      offlineMaxQuality: d?.offlineMaxQuality ?? "high",
      rightsVersion: typeof d?.rightsVersion === "number" ? d.rightsVersion : 1,
    };
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      logger.debug("[Entitlement] Track rights unavailable; using default permissions.", { songId });
      return permissive;
    }

    logger.warn("[Entitlement] getTrackRights failed; using default permissions.", err);
    return permissive;
  }
}

// ─── Territory check ──────────────────────────────────────────────────────────

/**
 * Returns true if the user's country is allowed by the track's territory rights.
 * An empty territoryRights array means no restriction.
 */
export function isTerritoryAllowed(
  territoryRights: string[],
  userCountry: string | null
): boolean {
  if (!territoryRights || territoryRights.length === 0) return true;
  if (!userCountry) return true; // can't determine — allow
  return territoryRights.includes(userCountry.toUpperCase());
}
