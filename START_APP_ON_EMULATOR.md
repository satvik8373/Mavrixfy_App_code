# How to Run Your App on Emulator

## The Error You're Seeing

The error `Failed to connect to localhost/127.0.0.1:8081` means your app is trying to connect to the Metro bundler (React Native dev server), but it's not running.

---

## Solution: Start Metro Bundler

### Option 1: Start Metro in Terminal

Open a **new terminal** and run:

```powershell
cd E:\Mavrixfy\Mavrixfy_App
npm start
```

Then press **`a`** to open on Android emulator.

---

### Option 2: Use Expo CLI Directly

```powershell
cd E:\Mavrixfy\Mavrixfy_App
npx expo start
```

Then:
- Press **`a`** for Android
- Or scan QR code with Expo Go app

---

### Option 3: Run Android Directly

```powershell
cd E:\Mavrixfy\Mavrixfy_App
npm run android
```

This will:
1. Start Metro bundler
2. Build the app
3. Install on emulator
4. Launch automatically

---

## Quick Fix (Recommended)

**Just run this command:**

```powershell
cd E:\Mavrixfy\Mavrixfy_App
npm run android
```

Wait for it to complete, and your app will launch on the emulator with Metro running.

---

## What About Android Auto?

The Android Auto functionality is **already built into your APK**. It will work when:

1. **You sync music data** from React Native:
   ```typescript
   import { useAndroidAuto } from './hooks/useAndroidAuto';
   
   const { syncMusicData } = useAndroidAuto();
   
   syncMusicData({
     trending: yourSongs,
     playlists: yourPlaylists,
     albums: yourAlbums
   });
   ```

2. **You connect to Android Auto** (via DHU or real car)

---

## Testing Android Auto (After App is Running)

### Method 1: Desktop Head Unit (DHU)

1. **Make sure your app is running** (Metro + Emulator)

2. **Run DHU:**
   ```powershell
   &"$env:LOCALAPPDATA\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
   ```

3. **In DHU:**
   - Click Media icon
   - Find "Mavrixfy"
   - Browse and test

### Method 2: Real Phone + Car

1. **Install app on phone:**
   ```powershell
   &"$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
   ```

2. **Enable Android Auto developer mode:**
   - Open Android Auto app
   - Settings → Tap "Version" 10 times
   - Developer settings → Enable "Unknown sources"

3. **Connect phone to car** and test

---

## Summary

**To fix the current error:**
```powershell
cd E:\Mavrixfy\Mavrixfy_App
npm run android
```

**To test Android Auto:**
1. Wait for app to launch
2. Add music data sync in your React Native code
3. Use DHU or connect to car

The Android Auto infrastructure is already in place - you just need the Metro server running for development!
