import express from "express";
import { Readable } from "node:stream";
import { getYoutube } from "../services/youtube.js";

const router = express.Router();

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const AUDIO_CACHE_MAX_ITEMS = 100;
const AUDIO_CACHE_MAX_AGE_SECONDS = 20 * 60;
const AUDIO_CACHE_EXPIRY_MARGIN_SECONDS = 90;
const AUDIO_RESOLVER_TOKEN = (process.env.YOUTUBE_MUSIC_AUDIO_TOKEN || "").trim();
const DEFAULT_PLAYBACK_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "*/*",
};

const audioStreamCache = new Map();

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

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

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
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

function getThumbnails(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.contents)
      ? value.contents
      : Array.isArray(value?.thumbnails)
        ? value.thumbnails
        : Array.isArray(value?.thumbnail)
          ? value.thumbnail
          : [];

  return source
    .map((thumb) => ({
      url: text(thumb?.url),
      width: Number(thumb?.width) || 0,
      height: Number(thumb?.height) || 0,
    }))
    .filter((thumb) => thumb.url);
}

function itemThumbnails(item) {
  return getThumbnails(item?.thumbnails || item?.thumbnail || item?.thumbnail?.contents);
}

function normalizePeople(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source
    .map((person) => {
      const name = text(person?.name || person?.title || person);
      if (!name) return null;
      const id = text(person?.channel_id || person?.id || person?.browseId);
      return id ? { name, id } : { name };
    })
    .filter(Boolean);
}

function getBrowseId(item) {
  const payload = getEndpointPayload(item);
  return text(payload?.browseId || item?.browseId || item?.playlistId || item?.id);
}

function getTrackId(item) {
  const payload = getEndpointPayload(item);
  return extractVideoId(item?.id || item?.videoId || payload?.videoId);
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

function normalizeCollectionItem(item, fallbackType = "") {
  const itemType = item?.item_type || fallbackType;
  const id = getBrowseId(item);
  const title = text(item?.title || item?.name);
  const author = text(item?.author?.name || item?.subtitle);
  const thumbnails = itemThumbnails(item);

  if (itemType === "artist") {
    return {
      browseId: id,
      id,
      name: title,
      title,
      resultType: "artist",
      category: "artist",
      thumbnails,
      subscribers: text(item?.subscribers) || undefined,
    };
  }

  if (itemType === "album") {
    return {
      browseId: id,
      id,
      title,
      resultType: "album",
      category: "album",
      artists: normalizePeople(item?.author || item?.artists || item?.authors),
      year: text(item?.year) || undefined,
      thumbnails,
      trackCount: Number.parseInt(text(item?.item_count || item?.song_count), 10) || undefined,
    };
  }

  return {
    browseId: id,
    playlistId: id,
    id,
    title,
    resultType: "playlist",
    category: "playlist",
    author: author || undefined,
    thumbnails,
    description: text(item?.subtitle) || undefined,
    itemCount: text(item?.item_count || item?.song_count) || undefined,
    trackCount: Number.parseInt(text(item?.item_count || item?.song_count), 10) || undefined,
  };
}

function normalizeSearchItem(item, fallbackType) {
  if (["song", "video", "non_music_track"].includes(item?.item_type) || getTrackId(item)) {
    return normalizeTrack(item);
  }
  return normalizeCollectionItem(item, fallbackType);
}

function shelfItems(search, type) {
  if (type === "song") return search.songs?.contents || [];
  if (type === "video") return search.videos?.contents || [];
  if (type === "album") return search.albums?.contents || [];
  if (type === "artist") return search.artists?.contents || [];
  if (type === "playlist") return search.playlists?.contents || [];
  return (search.contents || []).flatMap((section) => section?.contents || []);
}

function mapFilterToType(filter) {
  const value = text(filter).toLowerCase();
  if (value === "songs") return "song";
  if (value === "videos" || value === "uploads") return "video";
  if (value === "albums") return "album";
  if (value === "artists") return "artist";
  if (value.includes("playlist")) return "playlist";
  return "song";
}

function headerThumbnails(header) {
  return getThumbnails(header?.thumbnail?.contents || header?.thumbnail || header?.thumbnails);
}

function headerTitle(header, fallback) {
  return text(header?.title || fallback);
}

function parseYearFromSubtitle(value) {
  const match = text(value).match(/\b(19|20)\d{2}\b/);
  return match?.[0] || undefined;
}

function normalizePlaylist(playlist, fallbackId) {
  const header = playlist?.header || {};
  const tracks = (playlist?.contents || [])
    .map((item) => normalizeTrack(item))
    .filter(Boolean);

  return {
    browseId: fallbackId,
    title: headerTitle(header, "YouTube Music Playlist"),
    description: text(header?.second_subtitle || header?.subtitle) || `${tracks.length} tracks`,
    thumbnails: headerThumbnails(header),
    trackCount: tracks.length,
    tracks,
  };
}

function normalizeAlbum(album, fallbackId) {
  const header = album?.header || {};
  const tracks = (album?.contents || [])
    .map((item) => normalizeTrack(item))
    .filter(Boolean);

  return {
    browseId: fallbackId,
    title: headerTitle(header, "YouTube Music Album"),
    artists: normalizePeople(header?.strapline_text_one),
    year: parseYearFromSubtitle(header?.subtitle || header?.second_subtitle),
    description: text(header?.second_subtitle || header?.subtitle) || `${tracks.length} tracks`,
    thumbnails: headerThumbnails(header),
    trackCount: tracks.length,
    tracks,
  };
}

function sectionTitle(section) {
  return text(section?.title || section?.header?.title);
}

function normalizeArtist(artist, fallbackId) {
  const header = artist?.header || {};
  const sections = artist?.sections || [];
  const tracks = [];
  const albums = [];

  for (const section of sections) {
    const title = sectionTitle(section).toLowerCase();
    for (const item of section?.contents || []) {
      if ((item?.item_type === "song" || item?.item_type === "video") && (title.includes("song") || tracks.length < 10)) {
        const track = normalizeTrack(item);
        if (track) tracks.push(track);
      } else if (item?.item_type === "album") {
        const album = normalizeCollectionItem(item, "album");
        if (album?.browseId) albums.push(album);
      }
    }
  }

  return {
    browseId: fallbackId,
    name: headerTitle(header, "Artist"),
    description: text(header?.description) || undefined,
    thumbnails: headerThumbnails(header),
    subscribers: text(header?.subscription_button?.subscriber_count || header?.subtitle) || undefined,
    tracks: tracks.slice(0, 25),
    albums: albums.slice(0, 20),
  };
}

function normalizeHomeShelf(section) {
  const title = sectionTitle(section);
  const contents = (section?.contents || [])
    .filter((item) => {
      const id = getBrowseId(item);
      return (
        item?.item_type === "playlist" ||
        item?.item_type === "album" ||
        id.startsWith("VL") ||
        id.startsWith("PL") ||
        id.startsWith("RDCLAK") ||
        id.startsWith("RDTMAK") ||
        id.startsWith("OLAK") ||
        id.startsWith("MPREb")
      );
    })
    .map((item) => normalizeCollectionItem(item, "playlist"))
    .filter((item) => item?.playlistId || item?.browseId);

  return title && contents.length > 0 ? { title, contents } : null;
}

async function searchPlaylists(query, limit) {
  const yt = await getYoutube();
  const search = await yt.music.search(query, { type: "playlist" });
  return shelfItems(search, "playlist")
    .slice(0, limit)
    .map((item) => normalizeCollectionItem(item, "playlist"))
    .filter((item) => item?.playlistId || item?.browseId);
}

function getAudioUrlExpiry(audioUrl) {
  try {
    const expiry = Number.parseInt(new URL(audioUrl).searchParams.get("expire") || "", 10);
    if (expiry > Math.floor(Date.now() / 1000)) return expiry;
  } catch {}
  return Math.floor(Date.now() / 1000) + AUDIO_CACHE_MAX_AGE_SECONDS;
}

function mimeExtension(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "opus";
  return "mp3";
}

function audioCodec(mimeType) {
  const match = mimeType.match(/codecs="([^"]+)"/i);
  return match?.[1] || "";
}

function selectAudioFormat(formats) {
  return formats
    .filter((format) => format?.has_audio && !format?.has_video)
    .sort((a, b) => {
      const aMp4 = text(a.mime_type).includes("mp4") ? 1 : 0;
      const bMp4 = text(b.mime_type).includes("mp4") ? 1 : 0;
      const aBitrate = Number(a.average_bitrate || a.bitrate || 0);
      const bBitrate = Number(b.average_bitrate || b.bitrate || 0);
      return bMp4 - aMp4 || bBitrate - aBitrate;
    })[0];
}

function getCachedAudioStream(videoId) {
  const cached = audioStreamCache.get(videoId);
  if (!cached) return null;
  if (cached._cacheUntil <= Math.floor(Date.now() / 1000)) {
    audioStreamCache.delete(videoId);
    return null;
  }
  audioStreamCache.delete(videoId);
  audioStreamCache.set(videoId, cached);
  const { _cacheUntil, ...stream } = cached;
  return stream;
}

function cacheAudioStream(videoId, stream) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(stream.expiresAt) || now + AUDIO_CACHE_MAX_AGE_SECONDS;
  const cacheUntil = Math.min(expiresAt - AUDIO_CACHE_EXPIRY_MARGIN_SECONDS, now + AUDIO_CACHE_MAX_AGE_SECONDS);
  if (cacheUntil <= now) return;

  audioStreamCache.set(videoId, { ...stream, _cacheUntil: cacheUntil });
  while (audioStreamCache.size > AUDIO_CACHE_MAX_ITEMS) {
    const oldest = audioStreamCache.keys().next().value;
    if (!oldest) break;
    audioStreamCache.delete(oldest);
  }
}

function verifyAudioResolverToken(req) {
  if (!AUDIO_RESOLVER_TOKEN) return;
  const provided = text(req.get("x-resolver-token") || req.query.token);
  if (provided !== AUDIO_RESOLVER_TOKEN) {
    throw httpError(403, "Invalid audio resolver token");
  }
}

async function resolveAudioStream(videoId) {
  const cached = getCachedAudioStream(videoId);
  if (cached) return cached;

  const yt = await getYoutube();
  const info = await yt.music.getInfo(videoId, process.env.YOUTUBE_PO_TOKEN ? { po_token: process.env.YOUTUBE_PO_TOKEN } : undefined);
  const formats = [
    ...(info?.streaming_data?.formats || []),
    ...(info?.streaming_data?.adaptive_formats || []),
  ];
  const format = selectAudioFormat(formats);
  if (!format) throw httpError(502, "No playable audio formats found for this video");

  const url = await format.decipher(yt.session.player);
  if (!url || !url.startsWith("https://")) {
    throw httpError(502, "Unable to resolve YouTube audio");
  }

  const mimeType = text(format.mime_type).split(";")[0] || "audio/mp4";
  const stream = {
    videoId,
    url,
    expiresAt: getAudioUrlExpiry(url),
    headers: {},
    formatId: String(format.itag || ""),
    extension: mimeExtension(mimeType),
    mimeType,
    audioCodec: audioCodec(text(format.mime_type)),
    bitrateKbps: Math.round(Number(format.average_bitrate || format.bitrate || 0) / 1000) || null,
    duration: Math.round(Number(format.approx_duration_ms || info?.basic_info?.duration || 0) / 1000) || info?.basic_info?.duration || null,
    contentLength: Number(format.content_length) || null,
  };

  cacheAudioStream(videoId, stream);
  return stream;
}

async function resolveAudioStreamForRequest(req) {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) throw httpError(400, "Invalid YouTube video ID");
  verifyAudioResolverToken(req);
  return resolveAudioStream(videoId);
}

router.get("/healthz", asyncRoute(async (_req, res) => {
  const yt = await getYoutube();
  res.json({
    status: "ok",
    provider: "youtubei.js",
    lang: yt.session.lang,
    location: yt.session.context?.client?.gl,
    hasCookie: Boolean(process.env.YOUTUBE_COOKIE),
    hasPoToken: Boolean(process.env.YOUTUBE_PO_TOKEN),
  });
}));

router.get("/search", asyncRoute(async (req, res) => {
  const term = text(req.query.q || req.query.query);
  if (!term) throw httpError(400, "Missing search query");

  const limit = parsePositiveInt(req.query.limit, 20, 50);
  const type = mapFilterToType(req.query.filter);
  const yt = await getYoutube();
  const search = await yt.music.search(term, { type });
  const results = shelfItems(search, type)
    .slice(0, limit)
    .map((item) => normalizeSearchItem(item, type))
    .filter(Boolean);

  res.json(results);
}));

router.get("/search/suggestions", asyncRoute(async (req, res) => {
  const term = text(req.query.q || req.query.query);
  if (!term) throw httpError(400, "Missing search query");

  const yt = await getYoutube();
  const sections = await yt.music.getSearchSuggestions(term);
  const suggestions = [];
  const seen = new Set();

  for (const section of sections || []) {
    for (const item of section?.contents || []) {
      const suggestion = text(item?.suggestion || item?.title || item?.endpoint?.payload?.query);
      if (!suggestion || seen.has(suggestion.toLowerCase())) continue;
      seen.add(suggestion.toLowerCase());
      suggestions.push(suggestion);
    }
  }

  res.json(suggestions);
}));

router.get("/song/:videoId", asyncRoute(async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) throw httpError(400, "Invalid YouTube video ID");

  const yt = await getYoutube();
  const info = await yt.music.getInfo(videoId);
  const basic = info?.basic_info || {};

  res.json({
    id: basic.id || videoId,
    videoId: basic.id || videoId,
    title: basic.title,
    duration: basic.duration,
    views: basic.view_count,
    author: basic.author,
    channelId: basic.channel_id,
    thumbnails: getThumbnails(basic.thumbnail),
    thumbnail: getThumbnails(basic.thumbnail)?.[0]?.url,
  });
}));

router.get("/playlist/:playlistId", asyncRoute(async (req, res) => {
  const playlistId = text(req.params.playlistId);
  if (!playlistId) throw httpError(400, "Missing playlist ID");
  const yt = await getYoutube();
  const playlist = await yt.music.getPlaylist(playlistId);
  res.json(normalizePlaylist(playlist, playlistId));
}));

router.get("/album/:albumId", asyncRoute(async (req, res) => {
  const albumId = text(req.params.albumId);
  if (!albumId) throw httpError(400, "Missing album ID");
  const yt = await getYoutube();
  const album = await yt.music.getAlbum(albumId);
  res.json(normalizeAlbum(album, albumId));
}));

router.get("/artist/:artistId", asyncRoute(async (req, res) => {
  const artistId = text(req.params.artistId).replace(/^youtube_/, "");
  if (!artistId) throw httpError(400, "Missing artist ID");
  const yt = await getYoutube();
  const artist = await yt.music.getArtist(artistId);
  res.json(normalizeArtist(artist, artistId));
}));

router.get("/watch/:videoId", asyncRoute(async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) throw httpError(400, "Invalid YouTube video ID");

  const limit = parsePositiveInt(req.query.limit, 25, 50);
  const radio = text(req.query.radio).toLowerCase() !== "false";
  const yt = await getYoutube();
  const upNext = await yt.music.getUpNext(videoId, radio);
  const tracks = (upNext?.contents || [])
    .map((item) => normalizeTrack(item))
    .filter(Boolean)
    .slice(0, limit);

  res.json({
    tracks,
    playlistId: text(upNext?.playlist_id) || null,
  });
}));

router.get("/home", asyncRoute(async (req, res) => {
  const limit = parsePositiveInt(req.query.limit, 10, 12);

  const yt = await getYoutube();
  const home = await yt.music.getHomeFeed();
  const shelves = (home?.sections || [])
    .map((section) => normalizeHomeShelf(section))
    .filter(Boolean)
    .slice(0, limit);

  res.json(shelves);
}));

router.get("/charts", asyncRoute(async (req, res) => {
  const country = text(req.query.country || "IN").toUpperCase();
  const suffix = country === "IN" ? "India" : country;
  const [daily, weekly] = await Promise.all([
    searchPlaylists(`${suffix} top songs chart`, 12),
    searchPlaylists(`${suffix} trending music playlist`, 12),
  ]);

  res.json({
    daily,
    weekly,
    videos: [],
    trending: daily,
    playlists: [...daily, ...weekly],
  });
}));

router.get("/audio/:videoId", asyncRoute(async (req, res) => {
  const stream = await resolveAudioStreamForRequest(req);
  res.json({ stream });
}));

router.get("/stream-info/:videoId", asyncRoute(async (req, res) => {
  const stream = await resolveAudioStreamForRequest(req);
  res.json({ stream });
}));

async function sendStream(req, res, headOnly = false) {
  const stream = await resolveAudioStreamForRequest(req);
  const headers = { ...DEFAULT_PLAYBACK_HEADERS };
  if (req.get("range")) headers.Range = req.get("range");

  const upstream = await fetch(stream.url, {
    method: headOnly ? "HEAD" : "GET",
    headers,
  });

  res.status(upstream.status);
  for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  if (!res.getHeader("content-type")) res.setHeader("content-type", stream.mimeType || "audio/mp4");
  res.setHeader("accept-ranges", res.getHeader("accept-ranges") || "bytes");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-disposition", `inline; filename="${stream.videoId}.${stream.extension || "m4a"}"`);

  if (headOnly || !upstream.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
}

router.get("/stream/:videoId", asyncRoute((req, res) => sendStream(req, res, false)));
router.head("/stream/:videoId", asyncRoute((req, res) => sendStream(req, res, true)));

router.get("/moods", (_req, res) => res.json([]));
router.get("/mood-playlists", (_req, res) => res.json([]));
router.get("/mood-playlist/:params", (_req, res) => res.json([]));
router.get("/new-releases", (_req, res) => res.json([]));

export default router;
