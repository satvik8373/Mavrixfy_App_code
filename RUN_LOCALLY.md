# Run App Locally with Android Auto

## ✅ App is Building...

The app is currently building and will launch on your emulator automatically.

---

## What's Happening

1. ✅ Metro bundler is starting
2. ✅ Gradle is building the APK
3. ✅ App will install on emulator
4. ✅ App will launch automatically

**This takes 1-3 minutes on first run.**

---

## Check Progress

Open a new terminal and run:

```powershell
cd E:\Mavrixfy\Mavrixfy_App
npm run android
```

You'll see:
- "Building..." messages
- "Installing app..."
- "Starting Metro bundler..."
- "App launched successfully"

---

## Once App is Running

### 1. Your App Will Launch on Emulator
- The app opens automatically
- You'll see your normal app UI (login/home screen)

### 2. Test Android Auto

**Option A: Using Desktop Head Unit (DHU)**

Open a new terminal:
```powershell
&"$env:LOCALAPPDATA\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
```

Then:
- Click **Media** icon in DHU
- Find **"Mavrixfy"**
- Click to open
- You should see media browser (currently empty until you sync data)

**Option B: Check if Service is Running**

```powershell
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell dumpsys activity services | Select-String "MusicService"
```

Should show: `com.mavrixfy.app/.MusicService`

---

## Add Music Data to Android Auto

Once your app is running, you need to sync music data. Here's how:

### Find Your Main App File

Look for one of these files:
- `app/_layout.tsx`
- `app/index.tsx`
- `App.tsx`
- `src/App.tsx`

### Add This Code

```typescript
import { useAndroidAuto } from './hooks/useAndroidAuto';
import { useEffect } from 'react';

export default function YourMainComponent() {
  const { syncMusicData } = useAndroidAuto();

  useEffect(() => {
    // Sync data when app loads
    const syncAndroidAutoData = async () => {
      // Example: Replace with your actual data
      const trending = [
        {
          id: '1',
          title: 'Test Song 1',
          artist: 'Test Artist',
          album: 'Test Album',
          url: 'https://example.com/song1.mp3'
        },
        {
          id: '2',
          title: 'Test Song 2',
          artist: 'Another Artist',
          album: 'Another Album',
          url: 'https://example.com/song2.mp3'
        }
      ];

      const playlists = [
        {
          id: 'p1',
          title: 'My Playlist',
          subtitle: '10 songs'
        }
      ];

      const albums = [
        {
          id: 'a1',
          title: 'Test Album',
          artist: 'Test Artist'
        }
      ];

      await syncMusicData({ trending, playlists, albums });
      console.log('✅ Android Auto data synced!');
    };

    syncAndroidAutoData();
  }, []);

  return (
    // Your existing app components
  );
}
```

### Or Integrate with Existing Data

If you already fetch music data:

```typescript
useEffect(() => {
  const loadData = async () => {
    // Your existing data fetch
    const musicData = await fetchMusicFromAPI();
    
    // Map to Android Auto format
    const trending = musicData.songs.map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      url: song.streamUrl
    }));

    // Sync to Android Auto
    await syncMusicData({ trending });
  };

  loadData();
}, []);
```

---

## Verify It's Working

### 1. Check Logs

```powershell
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat | Select-String "MusicBridge|MusicService|Mavrixfy"
```

You should see:
- "MusicService: onCreate"
- "MusicService: onGetRoot"
- "MusicDataProvider: updateTrendingSongs"

### 2. Test in DHU

1. Open DHU (Desktop Head Unit)
2. Click Media → Mavrixfy
3. You should see:
   - 📁 Trending
   - 📁 Playlists
   - 📁 Albums
4. Click on any category to browse
5. Click on a song to play

### 3. Test Controls

- ▶️ Play button
- ⏸️ Pause button
- ⏭️ Next button
- ⏮️ Previous button

---

## Troubleshooting

### App Not Launching?

Check build status:
```powershell
cd E:\Mavrixfy\Mavrixfy_App\android
./gradlew assembleDebug
```

### Metro Bundler Issues?

Restart Metro:
```powershell
# Stop any running Metro
Get-Process -Name "node" | Stop-Process -Force

# Start fresh
cd E:\Mavrixfy\Mavrixfy_App
npm start
```

### App Crashes?

View crash logs:
```powershell
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat | Select-String "AndroidRuntime|FATAL"
```

### Android Auto Not Showing App?

1. Check service is registered:
   ```powershell
   &"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell dumpsys package com.mavrixfy.app | Select-String "MusicService"
   ```

2. Reinstall app:
   ```powershell
   cd E:\Mavrixfy\Mavrixfy_App\android
   ./gradlew assembleDebug
   &"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\app-debug.apk
   ```

---

## Quick Commands Reference

### Start App
```powershell
cd E:\Mavrixfy\Mavrixfy_App
npm run android
```

### Start DHU
```powershell
&"$env:LOCALAPPDATA\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
```

### View Logs
```powershell
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat | Select-String "Mavrixfy"
```

### Restart App
```powershell
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am force-stop com.mavrixfy.app
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -n com.mavrixfy.app/.MainActivity
```

---

## Summary

✅ **App is building** - wait 1-3 minutes
✅ **Will launch automatically** on emulator
✅ **Add music data sync** to see content in Android Auto
✅ **Use DHU** to test Android Auto interface
✅ **All infrastructure is ready** - just needs your data!

The app is running in the background. Check your emulator screen - it should launch soon!
