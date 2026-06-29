/**
 * Audio Quality — Utilities for quality-based audio URL selection
 */

import { DownloadQuality } from "@/types/downloads";

/**
 * Map download quality preference to audio bitrate
 */
function qualityToBitrate(quality: DownloadQuality): string {
  switch (quality) {
    case "low":
      return "48kbps";
    case "medium":
      return "160kbps";
    case "high":
    default:
      return "320kbps";
  }
}

/**
 * Attempt to construct a quality-specific audio URL
 * JioSaavn CDN URLs encode the bitrate in the filename, e.g.:
 * - https://aac.saavncdn.com/<hash>/<bitrate>_<hash>.mp4
 * - https://preview.saavncdn.com/<hash>/<bitrate>_<hash>.mp4
 * Legacy responses may also embed /<bitrate>/ as a path segment.
 */
export function getAudioUrlByQuality(baseUrl: string, quality: DownloadQuality): string {
  if (!baseUrl || typeof baseUrl !== "string") {
    return baseUrl;
  }

  const targetBitrate = qualityToBitrate(quality);
  const bitrateNum = targetBitrate.replace("kbps", "");

  // Known JioSaavn CDN hosts whose path layout reliably uses a bitrate segment.
  // Constraining the slash pattern to these hosts avoids rewriting arbitrary
  // numeric path segments (e.g. .../users/128/... or .../albums/64/...) that
  // happen to collide with a bitrate value.
  const JIOSAAVN_HOSTS = ["saavncdn.com", "saavn.com", "jiosaavn.com"];

  // Pattern 1: /320/ or /128/ or /96/ etc — but only on known audio CDN hosts
  // to avoid false positives on unrelated numeric path segments.
  try {
    const { host } = new URL(baseUrl);
    if (JIOSAAVN_HOSTS.some((h) => host.includes(h))) {
      const withSlashes = baseUrl.replace(
        /\/(?:320|256|192|160|128|96|64|48|32)\//g,
        `/${bitrateNum}/`
      );
      if (withSlashes !== baseUrl) {
        return withSlashes;
      }
    }
  } catch {
    // Not an absolute URL — skip the host-scoped slash pattern.
  }

  // Pattern 2: _320 or _128 etc in filename (the real JioSaavn encoding).
  // Anchored before a file extension, trailing underscore, or end of path.
  const withUnderscore = baseUrl.replace(/_(?:320|256|192|160|128|96|64|48|32)(?=\.|_|$)/g, `_${bitrateNum}`);
  if (withUnderscore !== baseUrl) {
    return withUnderscore;
  }

  // Pattern 3: -320 or -128 etc
  const withDash = baseUrl.replace(/-(?:320|256|192|160|128|96|64|48|32)(?=\.|_|$|-)/g, `-${bitrateNum}`);
  if (withDash !== baseUrl) {
    return withDash;
  }

  // If no pattern matched, return original URL
  // (it's likely already the best quality)
  return baseUrl;
}

/**
 * Get the bitrate for a download quality for UI display
 */
function getQualityLabel(quality: DownloadQuality): string {
  switch (quality) {
    case "low":
      return "~48 kbps";
    case "medium":
      return "~160 kbps";
    case "high":
    default:
      return "~320 kbps";
  }
}
