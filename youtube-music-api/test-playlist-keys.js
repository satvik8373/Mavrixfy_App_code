import { Innertube } from 'youtubei.js';

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

function shelfItems(search, type) {
  if (type === "playlist") {
    return search.playlists?.contents || [];
  }
  return [];
}

function normalizeCollectionItem(item, type) {
  const title = text(item.title || item.name);
  const id = text(item.id || item.playlistId || item.browseId);
  return {
    playlistId: id,
    title
  };
}

async function searchPlaylists(yt, query, limit) {
  const search = await yt.music.search(query, { type: "playlist" });
  return shelfItems(search, "playlist")
    .slice(0, limit)
    .flatMap((item) => {
      const normalized = normalizeCollectionItem(item, "playlist");
      return normalized?.playlistId || normalized?.browseId ? [normalized] : [];
    });
}

async function test() {
  try {
    const yt = await Innertube.create({
      gl: "IN",
      hl: "en",
      location: "IN",
      lang: "en"
    });
    console.log("Innertube created with IN region");
    
    const results = await searchPlaylists(yt, "India top songs chart", 12);
    console.log("Found playlists:", results);
    
    if (results.length > 0) {
      const firstId = results[0].playlistId;
      console.log(`\nFetching details for the first playlist ID: "${firstId}"`);
      const details = await yt.music.getPlaylist(firstId);
      console.log("Details contents length:", details.contents?.length || details.items?.length || 0);
    }
  } catch (err) {
    console.error(err);
  }
}

test();
