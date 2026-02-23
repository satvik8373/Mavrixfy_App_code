# Android Auto Testing Guide

## Method 1: Using Android Auto Desktop Head Unit (DHU) - Recommended for Development

### Step 1: Install Android Auto DHU
```bash
# Download Android Auto Desktop Head Unit
# Visit: https://developer.android.com/training/cars/testing

# Or install via SDK Manager:
# Android Studio > Tools > SDK Manager > SDK Tools > Android Auto Desktop Head Unit Emulator
```

### Step 2: Enable Developer Mode on Phone
1. Open **Android Auto** app on your phone
2. Tap **Menu** (three lines) → **Settings**
3. Scroll down and tap **Version** 10 times
4. You'll see "Developer mode enabled"
5. Go back to Settings → **Developer settings**
6. Enable:
   - **Unknown sources** ✓
   - **Developer mode** ✓

### Step 3: Connect Phone to Computer
```bash
# Enable USB debugging on phone
# Settings > Developer options > USB debugging

# Connect phone via USB
adb devices
# Should show your device
```

### Step 4: Run DHU
```bash
# Navigate to Android SDK platform-tools
cd ~/Android/Sdk/platform-tools

# Run DHU (Windows)
desktop-head-unit.exe

# Run DHU (Mac/Linux)
./desktop-head-unit
```

### Step 5: Launch Your App
```bash
# Build and install your app
cd Mavrixfy_App/android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Or use npm
npm run android
```

### Step 6: Test in DHU
1. DHU window will show Android Auto interface
2. Click **Media** icon
3. Your app "Mavrixfy" should appear in the list
4. Click on it to browse music
5. Test navigation: Trending → Playlists → Albums
6. Test playback controls

---

## Method 2: Using Real Car or Car Display

### Step 1: Enable Developer Mode (Same as above)
1. Android Auto app → Settings → Tap Version 10 times
2. Enable **Unknown sources** in Developer settings

### Step 2: Connect to Car
1. Connect phone to car via USB or wireless Android Auto
2. Android Auto should launch automatically
3. Go to Media section
4. Your app should appear

### Step 3: Test Features
- Browse music categories
- Play songs
- Use steering wheel controls
- Test voice commands: "Play music on Mavrixfy"

---

## Method 3: Android Auto Simulator (No Car Needed)

### Using Android Emulator
```bash
# Create AVD with Android Auto
# Android Studio > AVD Manager > Create Virtual Device
# Select: Automotive > Android Automotive (1024p landscape)
# System Image: API 33 or higher

# Start emulator
emulator -avd Automotive_API_33

# Install your app
adb install app-debug.apk
```

---

## Debugging & Logs

### View Android Auto Logs
```bash
# Filter logs for your app
adb logcat | grep "MusicService"
adb logcat | grep "Mavrixfy"

# View all Android Auto logs
adb logcat | grep "AndroidAuto"

# Clear logs and start fresh
adb logcat -c
adb logcat
```

### Check if Service is Running
```bash
# Check if MusicService is active
adb shell dumpsys activity services | grep MusicService

# Check MediaSession
adb shell dumpsys media_session
```

### Test MediaBrowser Connection
```bash
# Check if MediaBrowserService is registered
adb shell dumpsys package com.mavrixfy.app | grep Service
```

---

## Common Issues & Fixes

### Issue 1: App Not Showing in Android Auto
**Fix:**
```bash
# 1. Verify Unknown sources is enabled
# 2. Reinstall app
adb uninstall com.mavrixfy.app
adb install app-debug.apk

# 3. Restart Android Auto
adb shell am force-stop com.google.android.projection.gearhead
```

### Issue 2: Service Not Starting
**Check logs:**
```bash
adb logcat | grep "MusicService"
```

**Verify manifest:**
- Service must have `android:exported="true"`
- Intent filter must include `android.media.browse.MediaBrowserService`

### Issue 3: No Music Showing
**Debug:**
```bash
# Check if data is synced
adb logcat | grep "MusicDataProvider"
```

**Solution:** Make sure you're calling `syncMusicData()` in your React Native code

### Issue 4: Playback Not Working
**Check:** Ensure react-native-track-player is properly initialized

---

## Quick Test Checklist

- [ ] App appears in Android Auto media list
- [ ] Can browse Trending category
- [ ] Can browse Playlists category
- [ ] Can browse Albums category
- [ ] Can select and play a song
- [ ] Play button works
- [ ] Pause button works
- [ ] Next track works
- [ ] Previous track works
- [ ] Lock screen controls work
- [ ] Car steering wheel controls work (if available)
- [ ] No crashes or ANR errors

---

## Performance Testing

### Check Response Time
```bash
# onLoadChildren should respond < 300ms
adb logcat | grep "onLoadChildren"
```

### Memory Usage
```bash
# Monitor memory
adb shell dumpsys meminfo com.mavrixfy.app
```

---

## Production Testing

Before releasing:

1. **Test on Multiple Devices**
   - Different Android versions (8.0+)
   - Different car models
   - Different screen sizes

2. **Test Network Conditions**
   - Slow network
   - No network (cached data)
   - Network switching

3. **Test Edge Cases**
   - Empty playlists
   - Very long song titles
   - Special characters in names
   - Large music libraries (1000+ songs)

4. **Stress Testing**
   - Rapid navigation
   - Quick play/pause cycles
   - App backgrounding/foregrounding

---

## Useful ADB Commands

```bash
# Force stop app
adb shell am force-stop com.mavrixfy.app

# Start app
adb shell am start -n com.mavrixfy.app/.MainActivity

# Clear app data
adb shell pm clear com.mavrixfy.app

# Check app version
adb shell dumpsys package com.mavrixfy.app | grep versionName

# Take screenshot
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png

# Record screen
adb shell screenrecord /sdcard/demo.mp4
# Stop with Ctrl+C
adb pull /sdcard/demo.mp4
```

---

## Next Steps

1. Build release APK: `npm run build:apk`
2. Test on real device with Android Auto
3. Submit to Google Play Console
4. Request Android Auto review (if needed)

For more info: https://developer.android.com/training/cars/testing
