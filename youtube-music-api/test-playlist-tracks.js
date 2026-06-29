import { Innertube } from 'youtubei.js';
import musicRouter from './routes/music.js';

// We will mock text, normalizeTrack, getTrackId, getEndpointPayload, extractVideoId, etc.
// Let's just import the functions from the routes/music.js file.
// Since routes/music.js doesn't export these helper functions, we will copy them here.

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value.toString === "function") {
    const rendered = value.toString();
    return rendered && rendered !== "[object Object]" ? rendered.trim() : "";
  }
  return "";
}

function extractVideoId(value) {
  const raw = text(value).replace(/^youtube_/, "");
  if (VIDEO_ID_PATTERN.test(raw)) return raw;
  const match = raw.match(/[?&]v=([A-Za-z0-9_-]{11})|youtu\.be\/([A-Za-z0-9_-]{11})/);
  return match?.[1] || match?.[2] || "";
}

function getEndpointPayload(item) {
  return item?.endpoint?.payload || item?.overlay?.content?.endpoint?.payload || {};
}

function getTrackId(item) {
  const payload = getEndpointPayload(item);
  return extractVideoId(item?.id || item?.videoId || payload?.videoId);
}

function getThumbnails(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.contents)
      ? value.contents
      : [];

  return source.flatMap((thumb) => {
    const url = text(thumb?.url);
    if (!url) return [];
    return [{
      url,
      width: Number(thumb?.width) || 0,
      height: Number(thumb?.height) || 0,
    }];
  });
}

function itemThumbnails(item) {
  return getThumbnails(item?.thumbnails || item?.thumbnail || item?.thumbnail?.contents);
}

function normalizePeople(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source.flatMap((person) => {
    const name = text(person?.name || person?.title || person);
    if (!name) return [];
    const id = text(person?.channel_id || person?.id || person?.browseId);
    return [id ? { name, id } : { name }];
  });
}

function getMusicVideoType(item) {
  const payload = getEndpointPayload(item);
  const musicType =
    payload?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType ||
    payload?.watchEndpointMusicConfig?.musicVideoType;
  if (musicType) return musicType;
  if (item?.item_type === "song") return "MUSIC_VIDEO_TYPE_ATV";
  if (item?.item_type === "video") return "MUSIC_VIDEO_TYPE_OMV";
  return text(item?.item_type) || undefined;
}

function normalizeTrack(item) {
  const videoId = getTrackId(item);
  const title = text(item?.title || item?.name);
  if (!videoId || !title) return null;

  const artists = normalizePeople(item?.artists || item?.authors || item?.author);
  const albumName = text(item?.album?.name || item?.album?.title);
  const albumId = text(item?.album?.id || item?.album?.browseId);

  return {
    videoId,
    title,
    artists,
    album: albumName ? { name: albumName, id: albumId || undefined } : undefined,
    duration: item?.duration?.text || text(item?.duration) || undefined,
    duration_seconds: Number(item?.duration?.seconds) || undefined,
    thumbnails: itemThumbnails(item),
    videoType: getMusicVideoType(item),
    resultType: item?.item_type || "song",
    category: item?.item_type === "video" || item?.item_type === "non_music_track" ? "video" : "song",
    views: text(item?.views) || undefined,
    year: text(item?.year) || undefined,
  };
}

async function test() {
  try {
    const yt = await Innertube.create();
    
    // Let's test a couple of different playlist IDs
    const playlistIds = [
      "PL9bw4S5ePsEG1BSA7I5EtqskLWRaQojwR", // Bollywood Breakup
      "RDCLAK5uy_n9F5Zg5wq9YV95ypcKdc1-1Gxh9Gg7FNg" // YouTube Music playlist
    ];

    for (const pid of playlistIds) {
      console.log(`\n--- Fetching Playlist: ${pid} ---`);
      try {
        const playlist = await yt.music.getPlaylist(pid);
        const rawItems = playlist.contents || [];
        console.log(`Total raw items returned by Innertube: ${rawItems.length}`);
        
        let nullCount = 0;
        for (let i = 0; i < rawItems.length; i++) {
          const item = rawItems[i];
          const normalized = normalizeTrack(item);
          if (!normalized) {
            nullCount++;
            console.log(`Item at index ${i} is NULL. Raw keys:`, Object.keys(item));
            console.log("Raw item title/name:", item.title || item.name);
            console.log("Raw item id/videoId:", item.id || item.videoId);
            console.log("Raw item endpoint payload:", item.endpoint?.payload || item.overlay?.content?.endpoint?.payload);
          }
        }
        console.log(`Playlist ${pid} normalization complete. Null count: ${nullCount}`);
      } catch (err) {
        console.error(`Failed to fetch ${pid}:`, err.message);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

test();
