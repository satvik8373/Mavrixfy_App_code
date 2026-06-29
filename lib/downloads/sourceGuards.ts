import type { Song } from "@/lib/musicData";

export function isYouTubeBackedSong(song: Song | null | undefined): boolean {
  return Boolean(
    song &&
      (song.source === "youtube" ||
        song.id?.startsWith("youtube_") ||
        song.id?.startsWith("yt:") ||
        song.youtubeVideoId ||
        song.youtubeVisualVideoId)
  );
}

export function canDownloadSongSource(song: Song | null | undefined): boolean {
  return Boolean(song && !isYouTubeBackedSong(song));
}
