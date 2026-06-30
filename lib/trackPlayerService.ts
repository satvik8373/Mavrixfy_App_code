/**
 * TrackPlayer Playback Service
 *
 * This is the background service registered via TrackPlayer.registerPlaybackService().
 * It handles all remote control events (lock screen, notification, headphones,
 * Bluetooth, CarPlay, Android Auto) using react-native-track-player's official API.
 *
 * Official docs: https://rntp.dev/docs/basics/playback-service
 */

import TrackPlayer, { Event } from "react-native-track-player";
import { setupPlayer } from "@/lib/trackPlayer";
import { compactMap } from "@/lib/arrayUtils";

let pausedForDuck = false;
let commandChain: Promise<void> = Promise.resolve();

function runRemoteCommand(command: () => Promise<void> | void): void {
  commandChain = commandChain
    .catch(() => {
      // Keep later remote controls working if an earlier native command fails.
    })
    .then(async () => {
      try {
        await command();
      } catch {
        // Remote commands can arrive while the JS app is rebuilding the queue.
        // Dropping a failed command is safer than letting it reject through RNTP.
      }
    });
}

export const trackPlayerService = async () => {
  // Ensure player is fully set up with all capabilities before registering handlers.
  // This covers cold-start from a notification tap where the app hasn't run yet.
  try {
    await setupPlayer();
  } catch {
    // player_already_initialized is fine — just means the app already set it up
  }

  // ── Play / Pause / Stop ────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemotePlay, () => runRemoteCommand(() => TrackPlayer.play()));
  TrackPlayer.addEventListener(Event.RemotePause, () => runRemoteCommand(() => TrackPlayer.pause()));
  // Use stop() (not pause()) so the foreground service and notification are
  // torn down when the user explicitly hits the Stop button.
  TrackPlayer.addEventListener(Event.RemoteStop, () => runRemoteCommand(() => TrackPlayer.stop()));

  // ── Next / Previous ────────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemoteNext, () => runRemoteCommand(async () => {
      await TrackPlayer.skipToNext();
      await TrackPlayer.play();
  }));

  TrackPlayer.addEventListener(Event.RemotePrevious, () => runRemoteCommand(async () => {
      const progress = await TrackPlayer.getProgress();
      // If more than 3 seconds in, restart the current track
      if ((progress?.position ?? 0) > 3) {
        await TrackPlayer.seekTo(0);
        return;
      }
      try {
        await TrackPlayer.skipToPrevious();
        await TrackPlayer.play();
      } catch {
        await TrackPlayer.seekTo(0);
      }
  }));

  // ── Seek ───────────────────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) =>
    runRemoteCommand(() => TrackPlayer.seekTo(e.position))
  );

  // ── Audio focus / ducking (calls, navigation, alarms) ─────────────────────
  // Official RNTP duck handling: https://rntp.dev/docs/api/events#remoteduck
  TrackPlayer.addEventListener(Event.RemoteDuck, (e) => runRemoteCommand(async () => {
      if (e.permanent) {
        // Permanent loss (e.g. another app took over) — pause without tearing
        // down the iOS AVPlayer session.
        pausedForDuck = false;
        await TrackPlayer.pause();
      } else if (e.paused) {
        // Transient loss (e.g. navigation prompt) — pause and remember
        pausedForDuck = true;
        await TrackPlayer.pause();
      } else if (pausedForDuck) {
        // Focus returned — resume only if we paused for duck
        pausedForDuck = false;
        await TrackPlayer.play();
      }
  }));

  // ── Search / ID playback (CarPlay, Android Auto, Siri, Google Assistant) ──
  TrackPlayer.addEventListener(Event.RemotePlayId, (e) => runRemoteCommand(async () => {
      const queue = await TrackPlayer.getQueue();
      const idx = queue.findIndex((t) => String(t.id) === String(e.id));
      if (idx >= 0) {
        await TrackPlayer.skip(idx);
        await TrackPlayer.play();
      }
  }));

  TrackPlayer.addEventListener(Event.RemotePlaySearch, (e) => runRemoteCommand(async () => {
      const queue = await TrackPlayer.getQueue();
      if (queue.length === 0) return;
      const terms = compactMap([e.title, e.artist, e.album, e.query], (v) => String(v ?? "").toLowerCase().trim());
      if (terms.length === 0) {
        await TrackPlayer.skip(0);
        await TrackPlayer.play();
        return;
      }
      const idx = queue.findIndex((t) => {
        const hay = [t.title, t.artist, t.album]
          .map((v) => String(v ?? "").toLowerCase())
          .join(" ");
        return terms.every((term) => hay.includes(term));
      });
      const targetIdx = idx >= 0 ? idx : 0;
      await TrackPlayer.skip(targetIdx);
      await TrackPlayer.play();
  }));

  TrackPlayer.addEventListener(Event.RemoteSkip, (e) => runRemoteCommand(async () => {
      if (typeof e.index !== "number") return;
      await TrackPlayer.skip(e.index);
      await TrackPlayer.play();
  }));
};
