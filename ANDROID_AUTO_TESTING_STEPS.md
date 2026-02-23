# Android Auto Testing Steps - Fix Green Error Screen

## Current Issue
Green error screen: "No project application installed. Please contact your car manufacturer."

This means Android Auto can see your app but cannot connect to the MediaBrowserService properly.

## Root Cause Analysis
The issue is likely one of these:

1. **Service not starting** - AndroidAutoMusicService isn't being initialized
2. **TrackPlayer conflict** - react-native-track-player has its own MusicService that may conflict
3. **App not running** - Android Auto requires the app to be running BEFORE connecting
4. **Session token timing** - MediaSession token not set before Android Auto connects

## Testing Steps

### Step 1: Build and Install Fresh APK

```powershell
# Clean build
cd Mavrixfy_App/android
./gradlew clean assembleDebug

# Install on emulator (make sure Automotive emulator is running)
# Find the emulator ID first
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe devices

# Install APK
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
```

### Step 2: Launch App FIRST

**CRITICAL**: You MUST launch the Mavrixfy app on the phone/emulator BEFORE opening Android Auto.

```powershell
# Launch the app
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe -s emulator-5554 shell am start -n com.mavrixfy.app/.MainActivity
```

Wait for the app to fully load (you should see the main screen).

### Step 3: Check Service Registration

```powershell
# Verify the service is registered
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe shell dumpsys package com.mavrixfy.app | Select-String "AndroidAutoMusicService"

# Should show:
# Service #0:
#   com.mavrixfy.app/.AndroidAutoMusicService
```

### Step 4: Start Monitoring Logs

Open a separate PowerShell window and run:

```powershell
# Monitor Android Auto service logs
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe logcat -s AndroidAutoMusic:* MediaBrowser:* CarMediaService:*
```

### Step 5: Open Android Auto

Now open Android Auto on the emulator. Watch the logs for:

```
AndroidAutoMusic: onCreate: Service starting
AndroidAutoMusic: onCreate: MediaSession created and token set
AndroidAutoMusic: onGetRoot: clientPackageName=com.google.android.projection.gearhead
AndroidAutoMusic: onLoadChildren: parentId=root
AndroidAutoMusic: onLoadChildren: Loading root items
AndroidAutoMusic: onLoadChildren: Returning 3 items
```

### Step 6: If Still Green Screen

If you still see the green error, check these logs:

```powershell
# Check for connection errors
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe logcat | Select-String "MediaBrowser|CarMediaService|AndroidAutoMusic"
```

Look for errors like:
- "Failed to connect to MediaBrowserService"
- "Service not found"
- "Connection refused"

## Common Issues and Fixes

### Issue 1: Service Not Starting

**Symptom**: No "onCreate" log from AndroidAutoMusicService

**Fix**: The service needs to be started explicitly. Add this to `_layout.tsx`:

```typescript
useEffect(() => {
  if (Platform.OS !== 'android') return;
  
  // Start the Android Auto service
  AndroidAutoModule.startService();
}, []);
```

### Issue 2: TrackPlayer Conflict

**Symptom**: Logs show TrackPlayer's MusicService instead of AndroidAutoMusicService

**Fix**: Both services can coexist, but we need to ensure they don't conflict. Check if TrackPlayer is using the same service name.

### Issue 3: Session Token Not Set

**Symptom**: "MediaSession token is null" in logs

**Fix**: Already implemented - we set the token immediately in onCreate().

### Issue 4: App Not in Foreground

**Symptom**: Service starts but Android Auto can't connect

**Fix**: Ensure the app is in the foreground when Android Auto connects. The MediaBrowserService needs an active app context.

## Testing on Real Car

When testing on your real car:

1. **Install APK on your phone**:
   ```powershell
   # Connect phone via USB
   C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe devices
   C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe install -r Mavrixfy_App/android/app/build/outputs/apk/debug/app-debug.apk
   ```

2. **Enable Android Auto Developer Settings**:
   - Open Android Auto app on phone
   - Tap version number 10 times to enable developer mode
   - Go to Settings → Developer settings
   - Enable "Unknown sources"

3. **Launch Mavrixfy app on phone FIRST**

4. **Connect phone to car** (USB or wireless)

5. **Open Android Auto in car** - Mavrixfy should appear in the media apps list

## Expected Behavior

When working correctly:

1. App launches and syncs music data
2. AndroidAutoMusicService starts automatically
3. Android Auto connects to the service
4. You see "Mavrixfy" in the Android Auto media apps list
5. Tapping it shows: Trending, Playlists, Albums
6. Selecting a song plays it with proper metadata and controls

## Next Steps if Still Failing

If the green screen persists after following all steps:

1. **Check Android Auto version** - Update to latest
2. **Clear Android Auto cache** - Settings → Apps → Android Auto → Clear Cache
3. **Reinstall both apps** - Uninstall Mavrixfy and Android Auto, then reinstall
4. **Check permissions** - Ensure all permissions are granted
5. **Try on real device** - Emulator Android Auto can be buggy

## Debugging Commands

```powershell
# Check if service is running
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe shell dumpsys activity services | Select-String "mavrixfy"

# Check MediaSession
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe shell dumpsys media_session

# Force stop and restart
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe shell am force-stop com.mavrixfy.app
C:\Users\ASUS\AppData\Local\Android\Sdk\platform-tools\adb.exe shell am start -n com.mavrixfy.app/.MainActivity
```
