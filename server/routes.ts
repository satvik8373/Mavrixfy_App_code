import type { Express } from "express";
import { createServer, type Server } from "node:http";

const API_BASE = "https://jiosaavn-api-ts.vercel.app";
const TIMEOUT_MS = 12000;

async function apiFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(endpoint, API_BASE);
  Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === "Success" || data.success) return data.data || data;
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

function normalizeImage(images: any): any[] {
  if (typeof images === "string") {
    return [{ quality: "500x500", url: images }];
  }
  if (!Array.isArray(images)) return [];
  return images.map(img => ({
    quality: img.quality || "",
    url: img.link || img.url || "",
  }));
}

function normalizeSong(song: any): any {
  if (!song) return null;
  const artists = song.artist_map?.artists || [];
  const primaryArtists = artists.filter((a: any) => a.role === "Singer" || a.role === "Primary Artists");
  const allArtists = primaryArtists.length > 0 ? primaryArtists : artists;

  return {
    id: song.id,
    name: song.name || "",
    type: song.type || "song",
    year: typeof song.year === "string" ? song.year : String(song.year || ""),
    duration: song.duration || 0,
    language: song.language || "",
    hasLyrics: song.has_lyrics || false,
    album: {
      id: song.album_id || "",
      name: typeof song.album === "string" ? song.album : (song.album?.name || ""),
      url: song.album_url || "",
    },
    artists: {
      primary: allArtists.map((a: any) => ({
        id: a.id || "",
        name: a.name || "",
        image: normalizeImage(a.image || []),
        url: a.url || "",
      })),
      featured: [],
      all: artists.map((a: any) => ({
        id: a.id || "",
        name: a.name || "",
        role: a.role || "",
        image: normalizeImage(a.image || []),
        url: a.url || "",
      })),
    },
    image: normalizeImage(song.image || []),
    downloadUrl: (song.download_url || song.downloadUrl || []).map((d: any) => ({
      quality: d.quality || "",
      url: d.link || d.url || "",
    })),
  };
}

function normalizePlaylist(playlist: any): any {
  if (!playlist) return null;
  return {
    id: playlist.id,
    name: playlist.name || "",
    type: playlist.type || "playlist",
    image: normalizeImage(playlist.image || []),
    url: playlist.url || "",
    songCount: playlist.songCount || playlist.song_count || 0,
    language: playlist.language || "",
    description: playlist.description || playlist.header_desc || "",
    songs: Array.isArray(playlist.songs) ? playlist.songs.map(normalizeSong).filter(Boolean) : undefined,
  };
}

function getGoogleAuthPage(returnUrl: string): string {
  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in - Mavrixfy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #121212; color: #fff;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 20px;
    }
    .card {
      background: #1e1e1e; border-radius: 16px; padding: 40px 32px;
      max-width: 380px; width: 100%; text-align: center;
    }
    .logo { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #1DB954; }
    .subtitle { font-size: 14px; color: #b3b3b3; margin-bottom: 32px; }
    .google-btn {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      width: 100%; padding: 14px; border-radius: 50px;
      background: #fff; color: #333; font-size: 16px; font-weight: 600;
      border: none; cursor: pointer; transition: background 0.2s;
    }
    .google-btn:hover { background: #f0f0f0; }
    .google-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .google-btn svg { width: 20px; height: 20px; }
    .status { margin-top: 20px; font-size: 14px; color: #b3b3b3; }
    .error { color: #ff4444; }
    .spinner {
      display: inline-block; width: 20px; height: 20px;
      border: 2px solid #ccc; border-top-color: #333;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Mavrixfy</div>
    <div class="subtitle">Sign in with your Google account</div>
    <button class="google-btn" id="googleBtn" onclick="doGoogleSignIn()">
      <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google
    </button>
    <div class="status" id="status"></div>
  </div>

  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
    import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

    const app = initializeApp(${JSON.stringify(firebaseConfig)});
    const auth = getAuth(app);
    const returnUrl = ${JSON.stringify(returnUrl)};

    window.doGoogleSignIn = async function() {
      const btn = document.getElementById('googleBtn');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Signing in...';
      status.textContent = '';

      try {
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const googleIdToken = credential?.idToken;
        if (!googleIdToken) throw new Error('Could not get Google credential');

        status.textContent = 'Success! Redirecting back to app...';
        const separator = returnUrl.includes('?') ? '&' : '?';
        window.location.href = returnUrl + separator + 'id_token=' + encodeURIComponent(googleIdToken);
      } catch (error) {
        console.error('Google Sign-In error:', error);
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google';
        if (error.code === 'auth/popup-blocked') {
          status.innerHTML = '<span class="error">Popup was blocked. Please allow popups and try again.</span>';
        } else if (error.code === 'auth/popup-closed-by-user') {
          status.textContent = 'Sign-in cancelled. Try again when ready.';
        } else {
          status.innerHTML = '<span class="error">' + (error.message || 'Sign-in failed. Please try again.') + '</span>';
        }
      }
    };
  </script>
</body>
</html>`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/auth/google-mobile", (req, res) => {
    const returnUrl = String(req.query.returnUrl || "");
    if (!returnUrl) {
      return res.status(400).send("Missing returnUrl parameter");
    }
    const html = getGoogleAuthPage(returnUrl);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.get("/api/jiosaavn/search/songs", async (req, res) => {
    try {
      const { query, limit = "20" } = req.query;
      if (!query) return res.status(400).json({ error: "Query parameter is required" });

      const data = await apiFetch("/search/songs", { q: String(query), limit: String(limit) });
      if (!data) return res.status(503).json({ success: false, error: "API unavailable" });

      const results = Array.isArray(data.results) ? data.results.map(normalizeSong).filter(Boolean) : [];
      res.json({ success: true, data: { results } });
    } catch (error) {
      console.error("Error in /api/jiosaavn/search/songs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/jiosaavn/search/playlists", async (req, res) => {
    try {
      const { query, limit = "20" } = req.query;
      if (!query) return res.status(400).json({ error: "Query parameter is required" });

      const data = await apiFetch("/search/playlists", { q: String(query), limit: String(limit) });
      if (!data) return res.status(503).json({ success: false, error: "API unavailable" });

      const results = Array.isArray(data.results) ? data.results.map(normalizePlaylist).filter(Boolean) : [];
      res.json({ success: true, data: { results } });
    } catch (error) {
      console.error("Error in /api/jiosaavn/search/playlists:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/jiosaavn/playlists", async (req, res) => {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Playlist id parameter is required" });

      const data = await apiFetch("/playlist", { id: String(id) });
      if (!data) return res.status(503).json({ success: false, error: "API unavailable" });

      res.json({ success: true, data: normalizePlaylist(data) });
    } catch (error) {
      console.error("Error in /api/jiosaavn/playlists:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/jiosaavn/songs", async (req, res) => {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Song id parameter is required" });

      const data = await apiFetch("/song", { id: String(id) });
      if (!data) return res.status(503).json({ success: false, error: "API unavailable" });

      const songs = Array.isArray(data) ? data.map(normalizeSong).filter(Boolean) : [normalizeSong(data)].filter(Boolean);
      res.json({ success: true, data: songs });
    } catch (error) {
      console.error("Error in /api/jiosaavn/songs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/jiosaavn/search/all", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) return res.status(400).json({ error: "Query parameter is required" });

      const data = await apiFetch("/search", { q: String(query) });
      if (!data) return res.status(503).json({ success: false, error: "API unavailable" });

      res.json({ success: true, data });
    } catch (error) {
      console.error("Error in /api/jiosaavn/search/all:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
