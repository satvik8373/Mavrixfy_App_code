import os
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic


DEFAULT_LIMIT = 20
MAX_LIMIT = 100


app = FastAPI(title="Mavrixfy YouTube Music FastAPI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_expo_api_prefix(request, call_next):
    prefix = "/api/youtube-music"
    if request.scope.get("path", "").startswith(prefix):
        stripped = request.scope["path"][len(prefix):] or "/"
        request.scope["path"] = stripped
        request.scope["raw_path"] = stripped.encode("utf-8")
    return await call_next(request)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _limit(value: int | None, fallback: int = DEFAULT_LIMIT, maximum: int = MAX_LIMIT) -> int:
    if not value or value < 1:
        return fallback
    return min(value, maximum)


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _safe_call(label: str, fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"YouTube Music {label} failed: {exc}") from exc


def _search_filter(value: str | None) -> str | None:
    normalized = _text(value).lower().replace("-", "_")
    if not normalized:
        return None
    aliases = {
        "song": "songs",
        "songs": "songs",
        "video": "videos",
        "videos": "videos",
        "uploads": "videos",
        "album": "albums",
        "albums": "albums",
        "artist": "artists",
        "artists": "artists",
        "playlist": "playlists",
        "playlists": "playlists",
        "featured_playlist": "featured_playlists",
        "featured_playlists": "featured_playlists",
        "community_playlist": "community_playlists",
        "community_playlists": "community_playlists",
    }
    return aliases.get(normalized, normalized)


def _client_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "language": os.getenv("YTMUSIC_LANGUAGE", os.getenv("YOUTUBE_MUSIC_LANGUAGE", "en")),
        "location": os.getenv("YTMUSIC_LOCATION", os.getenv("YOUTUBE_MUSIC_LOCATION", "IN")),
    }
    auth = os.getenv("YTMUSIC_AUTH") or os.getenv("YTMUSIC_AUTH_FILE")
    if auth:
        kwargs["auth"] = auth
    return kwargs


@lru_cache(maxsize=1)
def get_ytmusic() -> YTMusic:
    kwargs = _client_kwargs()
    try:
        return YTMusic(**kwargs)
    except TypeError:
        kwargs.pop("location", None)
        return YTMusic(**kwargs)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "Mavrixfy YouTube Music API",
        "provider": "ytmusicapi",
        "location": os.getenv("YTMUSIC_LOCATION", os.getenv("YOUTUBE_MUSIC_LOCATION", "IN")),
    }


@app.get("/healthz")
def healthz():
    ytmusic = get_ytmusic()
    return {
        "status": "ok",
        "provider": "ytmusicapi",
        "client": ytmusic.__class__.__name__,
        "hasAuth": bool(os.getenv("YTMUSIC_AUTH") or os.getenv("YTMUSIC_AUTH_FILE")),
    }


@app.get("/search")
def search(
    q: str | None = None,
    query: str | None = None,
    filter: str | None = Query(default=None),
    limit: int | None = Query(default=DEFAULT_LIMIT),
):
    term = _text(query or q)
    if not term:
        raise HTTPException(status_code=400, detail="Missing search query")

    results = _safe_call(
        "search",
        get_ytmusic().search,
        term,
        filter=_search_filter(filter),
        limit=_limit(limit, DEFAULT_LIMIT, MAX_LIMIT),
    )
    return _as_list(results)


@app.get("/search/suggestions")
def search_suggestions(q: str | None = None, query: str | None = None):
    term = _text(query or q)
    if not term:
        raise HTTPException(status_code=400, detail="Missing search query")
    return _as_list(_safe_call("search suggestions", get_ytmusic().get_search_suggestions, term))


@app.get("/home")
def home(limit: int | None = Query(default=10)):
    sections = _as_list(_safe_call("home", get_ytmusic().get_home, limit=_limit(limit, 10, 20)))
    return sections


@app.get("/charts")
def charts(country: str = Query(default="IN")):
    return _safe_call("charts", get_ytmusic().get_charts, country=_text(country).upper() or "IN")


@app.get("/moods")
def moods():
    return _safe_call("mood categories", get_ytmusic().get_mood_categories)


@app.get("/mood-playlists")
def mood_playlists(params: str = Query(default="")):
    if not _text(params):
        raise HTTPException(status_code=400, detail="Missing mood params")
    return _as_list(_safe_call("mood playlists", get_ytmusic().get_mood_playlists, params))


@app.get("/mood-playlist/{params:path}")
def mood_playlist_path(params: str):
    if not _text(params):
        raise HTTPException(status_code=400, detail="Missing mood params")
    return _as_list(_safe_call("mood playlists", get_ytmusic().get_mood_playlists, params))


@app.get("/playlist/{playlist_id}")
def playlist(playlist_id: str, limit: int | None = Query(default=100)):
    playlist_id = _text(playlist_id)
    if not playlist_id:
        raise HTTPException(status_code=400, detail="Missing playlist ID")
    return _safe_call("playlist", get_ytmusic().get_playlist, playlist_id, limit=_limit(limit, 100, 250))


@app.get("/album/{album_id}")
def album(album_id: str):
    album_id = _text(album_id)
    if not album_id:
        raise HTTPException(status_code=400, detail="Missing album ID")
    return _safe_call("album", get_ytmusic().get_album, album_id)


@app.get("/artist/{artist_id}")
def artist(artist_id: str):
    artist_id = _text(artist_id).replace("youtube_", "")
    if not artist_id:
        raise HTTPException(status_code=400, detail="Missing artist ID")
    return _safe_call("artist", get_ytmusic().get_artist, artist_id)


@app.get("/watch/{video_id}")
def watch(video_id: str, limit: int | None = Query(default=25), radio: bool = Query(default=True)):
    video_id = _text(video_id).replace("youtube_", "")
    if not video_id:
        raise HTTPException(status_code=400, detail="Missing video ID")
    return _safe_call(
        "watch playlist",
        get_ytmusic().get_watch_playlist,
        video_id,
        limit=_limit(limit, 25, 100),
        radio=radio,
    )


@app.get("/new-releases")
def new_releases(limit: int | None = Query(default=25)):
    results = _safe_call(
        "new releases search",
        get_ytmusic().search,
        "new releases",
        filter="albums",
        limit=_limit(limit, 25, 50),
    )
    return _as_list(results)
