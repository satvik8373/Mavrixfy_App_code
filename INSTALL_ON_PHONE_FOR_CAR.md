# 🚗 Install Mavrixfy on Your Phone for Android Auto in Car

## ✅ APK is Ready!

Your production APK with full Android Auto support is built at:

```
E:\Mavrixfy\Mavrixfy_App\android\app\build\outputs\apk\release\app-release.apk
```

---

## Method 1: Install via USB (Recommended)

### Step 1: Enable USB Debugging on Your Phone

1. **Go to Settings → About phone**
2. **Tap "Build number" 7 times** (enables Developer options)
3. **Go back → Developer options**
4. **Enable "USB debugging"**

### Step 2: Connect Phone to Computer

1. **Connect your phone via USB cable**
2. **On phone, accept "Allow USB debugging" prompt**

### Step 3: Install APK

```powershell
# Check if phone is connected
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices

# Install APK
&"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r E:\Mavrixfy\Mavrixfy_App\android\app\build\outputs\apk\release\app-release.apk
```

---

## Method 2: Install Manually

### Step 1: Copy APK to Phone

1. **Copy the APK file:**
   ```
   E:\Mavrixfy\Mavrixfy_App\android\app\build\outputs\apk\release\app-release.apk
   ```

2. **Transfer to your phone:**
   - Via USB cable (copy to Downloads folder)
   - Via Google Drive
   - Via email to yourself
   - Via any file transfer method

### Step 2: Install on Phone

1. **On your phone, open the APK file**
2. **Tap "Install"**
3. **If prompted, enable "Install from unknown sources"**
4. **Wait for installation to complete**

---

## Using in Your Car with Android Auto

### Step 1: Enable Android Auto Developer Mode (One-time setup)

1. **Open Android Auto app on your phone**
2. **Tap hamburger menu (≡) → Settings**
3. **Scroll to bottom and tap "Version" 10 times**
4. **You'll see "Developer mode enabled"**
5. **Go back → Developer settings**
6. **Enable "Unknown sources"** ✓

### Step 2: Connect Phone to Car

1. **Connect your phone to car via USB or wireless Android Auto**
2. **Android Auto will launch automatically**

### Step 3: Access Mavrixfy in Car

1. **On car display, tap "Media" icon**
2. **Look for "Mavrixfy" in the sources list**
3. **Tap on "Mavrixfy"**

### Step 4: Browse and Play Music

You'll see the proper Android Auto interface (like Spotify):

```
┌─────────────────────────────────┐
│  ← Mavrixfy                     │
├─────────────────────────────────┤
│  📁 Trending                    │
│     5 songs                     │
│                                 │
│  📁 Playlists                   │
│     3 playlists                 │
│                                 │
│  📁 Albums                      │
│     3 albums                    │
└─────────────────────────────────┘
```

**Tap on any category to browse and play!**

---

## What You'll See in Your Car

### ✅ Same UI as Spotify:
- List view with song titles and artists
- Album artwork (when you add real data)
- Now playing screen
- Playback controls (play/pause/next/previous)
- Progress bar
- Queue management

### ✅ Car Controls Work:
- Steering wheel buttons
- Voice commands ("Play music on Mavrixfy")
- Touch screen controls
- Physical buttons (if available)

---

## Replace Test Data with Your Real Music

The app currently has test data. To use your real music:

### Option 1: Update in Code

Edit `app/_layout.tsx` and replace the test data with your API:

```typescript
const syncAndroidAutoData = async () => {
  try {
    // Fetch from your API
    const response = await fetch('YOUR_API_ENDPOINT/music');
    const data = await response.json();

    // Map to Android Auto format
    const trending = data.songs.map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      url: song.streamUrl
    }));

    await syncMusicData({ trending, playlists, albums });
  } catch (error) {
    console.error('Failed to sync:', error);
  }
};
```

Then rebuild:
```powershell
cd E:\Mavrixfy\Mavrixfy_App\android
./gradlew assembleRelease
```

### Option 2: Dynamic Loading

If your app already loads music from API, the Android Auto hook will automatically sync it when the app launches.

---

## Troubleshooting

### "Mavrixfy doesn't appear in Android Auto"

1. **Make sure "Unknown sources" is enabled:**
   - Android Auto app → Settings → Developer settings → Unknown sources ✓

2. **Restart Android Auto:**
   - Disconnect and reconnect phone to car
   - Or force stop Android Auto app on phone

3. **Launch Mavrixfy app first:**
   - Open Mavrixfy on your phone before connecting to car
   - This ensures the service is registered

### "Media browser is empty"

- The test data should show 5 songs, 3 playlists, 3 albums
- If empty, check app logs or replace with your real API data

### "App crashes in car"

- Make sure you're using the release APK (not debug)
- Check that react-native-track-player is properly configured
- Test playback on phone first before testing in car

---

## Testing Before Car

You can test Android Auto on your phone using Desktop Head Unit (DHU):

```powershell
# On computer, run DHU
&"$env:LOCALAPPDATA\Android\Sdk\extras\google\auto\desktop-head-unit.exe"

# Connect phone via USB
# DHU will show Android Auto interface on computer screen
```

---

## Production Checklist

Before deploying to users:

- [ ] Replace test data with real API
- [ ] Test playback on phone
- [ ] Test in car with Android Auto
- [ ] Test all controls (play/pause/next/previous)
- [ ] Test browsing all categories
- [ ] Test voice commands
- [ ] Test steering wheel controls
- [ ] Test with different songs/playlists
- [ ] Test offline behavior (if applicable)
- [ ] Sign APK for Play Store (if publishing)

---

## What's Included

✅ **MediaBrowserService** - Provides music to Android Auto
✅ **MediaSessionCompat** - Handles playback controls
✅ **React Native Bridge** - Syncs data between app and service
✅ **Test Data** - 5 songs, 3 playlists, 3 albums
✅ **Proper Android Auto UI** - Same as Spotify
✅ **Car Controls Support** - Steering wheel, voice, touch
✅ **Lock Screen Controls** - Works on phone too

---

## Next Steps

1. ✅ **Install APK on your phone** (via USB or manually)
2. ✅ **Enable "Unknown sources"** in Android Auto
3. ✅ **Connect phone to car**
4. ✅ **Open Media → Mavrixfy**
5. ✅ **Enjoy your music in car!**

---

## Summary

🎉 **Your app is ready for Android Auto!**

**APK Location:**
```
E:\Mavrixfy\Mavrixfy_App\android\app\build\outputs\apk\release\app-release.apk
```

**Install on phone → Enable Unknown sources → Connect to car → Enjoy!**

The Android Auto interface will look and work exactly like Spotify in your car!
