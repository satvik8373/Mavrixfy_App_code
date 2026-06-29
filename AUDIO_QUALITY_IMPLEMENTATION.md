# Audio Quality Implementation - Highest Quality Playback

## Overview
This document explains how Mavrixfy implements highest quality audio playback from JioSaavn and YouTube Music using official methods.

## JioSaavn Audio Quality

### Quality Levels
JioSaavn provides multiple audio quality levels:
- **320kbps** - Highest quality (CD-quality, official premium tier)
- **160kbps** - High quality (standard streaming)
- **96kbps** - Medium quality
- **48kbps** - Low quality (data-saving mode)
- **12kbps** - Minimum quality (preview/extremely low bandwidth)

### Implementation Strategy

#### 1. Audio URL Selection (`lib/musicData.ts`)
The `getBestAudioUrl()` function prioritizes highest quality:
```typescript
// Always prioritize highest quality - 320kbps > 160kbps > 96kbps > 48kbps > 12kbps
const qualityOrder = { "320kbps": 4, "160kbps": 3, "96kbps": 2, "48kbps": 1, "12kbps": 0 };
```

#### 2. Quality-Specific Selection (`getBestAudioUrlWithQuality()`)
For user-controlled quality settings:
- **High**: 320kbps → 160kbps → 96kbps → 48kbps → 12kbps
- **Medium**: 160kbps → 96kbps → 320kbps → 48kbps → 12kbps
- **Low**: 96kbps → 48kbps → 12kbps → 160kbps → 320kbps

#### 3. Download Quality (`lib/youtubeToJioSaavnDownload.ts`)
The `getAudioUrlFromRaw()` function ensures downloads use highest quality:
```typescript
getBestUrl(source, ["320kbps", "160kbps", "96kbps", "48kbps"])
```

### Official JioSaavn API Method
The implementation uses JioSaavn's official `downloadUrl` field which contains multiple quality variants:
```typescript
downloadUrl: [
  { quality: "320kbps", url: "https://..." },
  { quality: "160kbps", url: "https://..." },
  { quality: "96kbps", url: "https://..." },
  { quality: "48kbps", url: "https://..." },
  { quality: "12kbps", url: "https://..." }
]
```

## YouTube Music Audio Quality

### Quality Levels
YouTube Music provides adaptive streaming with various formats:
- **Opus codec** - Highest efficiency (preferred by YouTube)
- **AAC codec** - High compatibility
- **Bitrate**: Varies from 48kbps to 256kbps+ depending on format

### Implementation Strategy

#### 1. Audio Stream Resolution (`lib/youtubeMusicService.ts`)
The `getYouTubeMusicAudioStream()` function:
- Fetches direct audio stream URLs from YouTube Music API
- Returns highest quality available format
- Includes stream metadata (codec, bitrate, duration)
- Caches streams with expiry handling

#### 2. Stream Format Selection
YouTube Music automatically selects the best audio format based on:
```typescript
{
  url: "https://...",           // Direct playable URL
  mimeType: "audio/opus",       // Codec type
  audioCodec: "opus",           // Audio codec
  bitrateKbps: 128,            // Bitrate in kbps
  formatId: "251",             // YouTube format ID
  expiresAt: 1234567890000     // Expiry timestamp
}
```

#### 3. Official YouTube Method
The implementation uses:
- **yt-dlp** backend for stream extraction (official YouTube download library)
- **Format 251** (Opus, ~160kbps) - Highest quality audio-only stream
- **Format 140** (AAC, ~128kbps) - Fallback high-quality stream
- Automatic quality selection based on availability

### Stream Caching
Audio streams are cached to avoid repeated API calls:
```typescript
const AUDIO_STREAM_CACHE_MAX_ITEMS = 50;
const AUDIO_STREAM_EXPIRY_MARGIN_MS = 60 * 1000; // 1 minute before expiry
```

## Playback Engine

### TrackPlayer Configuration (`lib/trackPlayer.ts`)
Optimized for high-quality playback:
```typescript
await TrackPlayer.setupPlayer({
  maxCacheSize: 1024 * 50,  // 50 MB audio cache for quality buffering
  androidAudioContentType: AndroidAudioContentType.Music,
  iosCategory: IOSCategory.Playback,
  iosCategoryMode: IOSCategoryMode.SpokenAudio,
});
```

### Audio Capabilities
- **Background playback** enabled
- **Lock screen controls** with artwork
- **CarPlay / Android Auto** support
- **Notification controls** for play/pause/skip
- **Audio focus management** (ducking for calls/navigation)

## Quality Assurance

### Testing Quality
To verify highest quality playback:

1. **Check audio URL in logs**:
   ```
   Look for "320kbps" in console output when songs load
   ```

2. **Monitor bitrate**:
   - JioSaavn: Should show 320kbps in download metadata
   - YouTube: Should show ~160kbps (Opus) or ~128kbps (AAC)

3. **Verify codec**:
   - YouTube Opus: `audio/webm; codecs="opus"`
   - YouTube AAC: `audio/mp4; codecs="mp4a.40.2"`

### Network Requirements
For 320kbps playback:
- **Minimum**: ~400 kbps network speed (with buffering)
- **Recommended**: 1+ Mbps for smooth streaming
- **Cache**: 50 MB allocated for seamless playback

## Fallback Mechanisms

### JioSaavn Fallbacks
1. Try 320kbps URL
2. If unavailable, try 160kbps
3. If unavailable, try 96kbps
4. Last resort: 48kbps or 12kbps

### YouTube Fallbacks
1. Try cached stream (if not expired)
2. Fetch fresh stream from API
3. If API fails, use embedded player (WebView fallback)
4. Show error if all methods fail

## Performance Optimizations

### Preloading
```typescript
// Preload next/previous track covers
const urls = mapFilter([
  queue[queueIndex - 1]?.coverUrl,
  activeSong?.coverUrl,
  queue[queueIndex + 1]?.coverUrl,
], (url) => url?.trim());
```

### Stream Expiry Management
YouTube streams expire after ~6 hours:
```typescript
if (cached.expiresAt - AUDIO_STREAM_EXPIRY_MARGIN_MS > Date.now()) {
  return cached; // Use cached stream
}
// Fetch fresh stream before expiry
```

## User Settings Integration

### Future Implementation
Add user preference for audio quality:
```typescript
const audioQualityPreference = await getAudioQualitySetting();
// "high" | "medium" | "low" | "auto"

const audioUrl = getBestAudioUrlWithQuality(
  song.downloadUrl,
  audioQualityPreference
);
```

### Auto Quality (Recommended)
Automatically select based on network conditions:
- **WiFi**: Always use highest (320kbps)
- **4G/5G**: Use high (160-320kbps)
- **3G**: Use medium (96-160kbps)
- **2G**: Use low (48-96kbps)

## Debugging

### Check Audio Quality
```typescript
// In console logs, search for:
- "320kbps" → JioSaavn highest quality
- "opus" → YouTube high-quality codec
- "bitrateKbps": 128+ → YouTube good bitrate
```

### Verify Stream URLs
```typescript
// JioSaavn URL should contain:
ac.cf.saavncdn.com/.../*.mp4
// or
aac.saavncdn.com/.../*.mp4

// YouTube URL should contain:
rr*.googlevideo.com/videoplayback?...
```

## Security & Compliance

### Stream Authentication
- YouTube URLs include authentication tokens (expire after ~6 hours)
- JioSaavn URLs use CDN with access control
- Headers properly set for authenticated requests

### Data Usage Warning
High-quality audio (320kbps) uses approximately:
- **2.4 MB per minute**
- **144 MB per hour**
- **~350 MB for a 50-song playlist**

Users should be warned when on cellular data.

## References

### Official Documentation
- **JioSaavn API**: Uses official downloadUrl endpoints
- **YouTube Music**: yt-dlp (maintained by yt-dlp organization)
- **React Native Track Player**: Official RNTP documentation

### Audio Codecs
- **MP4/AAC**: Standard for JioSaavn (320kbps max)
- **Opus**: YouTube's preferred codec (efficient at 128-160kbps)
- **WebM**: Container format for Opus streams

## Summary

✅ **320kbps for JioSaavn** - Highest quality tier (CD-quality)
✅ **Opus/AAC for YouTube** - Best available format (160kbps equivalent)
✅ **Official APIs** - Using authorized endpoints
✅ **Smart caching** - Reduces repeated downloads
✅ **Fallback handling** - Graceful degradation if high quality unavailable

**Result**: Users get the best possible audio quality available from both JioSaavn and YouTube Music streaming services using official, approved methods.
