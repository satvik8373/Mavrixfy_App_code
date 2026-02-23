# Android Auto Setup in Android Studio - Step by Step

## Method 1: Android Automotive OS Emulator (Easiest - No Car Needed)

### Step 1: Create Android Automotive Emulator

1. **Open Android Studio**

2. **Open Device Manager:**
   - Click **Tools** → **Device Manager**
   - OR click the phone icon in the top toolbar

3. **Create New Virtual Device:**
   - Click **"Create Device"** button
   - In the left panel, select **"Automotive"** category
   - Choose one of these:
     - **Polestar 2** (Recommended)
     - **Android Automotive (1024p landscape)**
   - Click **Next**

4. **Select System Image:**
   - Choose **API 33** (Android 13) or higher
   - If not downloaded, click **Download** next to it
   - Wait for download to complete
   - Click **Next**

5. **Configure AVD:**
   - Name: `Android_Auto_Test`
   - Click **Show Advanced Settings**
   - Set RAM: 4096 MB (minimum)
   - Set Internal Storage: 2048 MB
   - Click **Finish**

### Step 2: Start the Emulator

1. In Device Manager, click **▶ Play** button next to your Automotive device
2. Wait for emulator to boot (first time takes 2-3 minutes)
3. You'll see a car dashboard interface

### Step 3: Build and Install Your App

**Option A: Using Android Studio**
1. Open your project: `Mavrixfy_App/android` in Android Studio
2. Select the Automotive emulator from device dropdown
3. Click **Run** (green play button) or press `Shift + F10`

**Option B: Using Command Line**
```bash
# Navigate to android folder
cd Mavrixfy_App/android

# Build the app
./gradlew assembleDebug

# Start emulator (if not running)
emulator -avd Android_Auto_Test

# Install app
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Step 4: Find Your App in Emulator

1. In the emulator, look for the **app drawer** icon (grid of dots)
2. Click on it to see all apps
3. Find **"Mavrixfy"** and click to open
4. Your app should launch normally

### Step 5: Test Media Functionality

Since this is Android Automotive OS (not Android Auto), your app runs as a regular app but with automotive optimizations.

---

## Method 2: Desktop Head Unit (DHU) - Real Android Auto Experience

### Step 1: Install Android SDK Platform-Tools

1. **Open Android Studio**
2. Go to **Tools** → **SDK Manager**
3. Click **SDK Tools** tab
4. Check these items:
   - ✓ **Android SDK Platform-Tools**
   - ✓ **Android Auto Desktop Head Unit Emulator**
5. Click **Apply** → **OK**
6. Wait for installation

### Step 2: Enable Developer Mode on Your Physical Phone

1. **Install Android Auto app** on your phone (if not pre-installed)
   - Download from Play Store if needed

2. **Enable Developer Mode:**
   - Open **Android Auto** app
   - Tap **hamburger menu** (≡) → **Settings**
   - Scroll to bottom and tap **"Version"** 10 times rapidly
   - You'll see toast: "Developer mode enabled"

3. **Enable Unknown Sources:**
   - Go back to Settings
   - Tap **"Developer settings"** (now visible)
   - Enable **"Unknown sources"** toggle
   - Enable **"Developer mode"** toggle

### Step 3: Connect Phone to Computer

1. **Enable USB Debugging on phone:**
   - Go to **Settings** → **About phone**
   - Tap **"Build number"** 7 times
   - Go back → **Developer options**
   - Enable **"USB debugging"**

2. **Connect phone via USB cable**

3. **Verify connection:**
   ```bash
   adb devices
   ```
   Should show your device like:
   ```
   List of devices attached
   ABC123XYZ    device
   ```

### Step 4: Install Your App on Phone

```bash
cd Mavrixfy_App/android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Step 5: Start Desktop Head Unit (DHU)

**Find DHU location:**
```bash
# Windows
cd %LOCALAPPDATA%\Android\Sdk\extras\google\auto

# Mac/Linux
cd ~/Library/Android/sdk/extras/google/auto
# or
cd ~/Android/Sdk/extras/google/auto
```

**Run DHU:**
```bash
# Windows
desktop-head-unit.exe

# Mac/Linux
./desktop-head-unit
```

**Alternative - Run from anywhere:**
```bash
# Add to PATH or run directly
"%LOCALAPPDATA%\Android\Sdk\extras\google\auto\desktop-head-unit.exe"
```

### Step 6: Use DHU

1. **DHU window opens** showing Android Auto interface
2. **On your phone:** Accept any connection prompts
3. **In DHU window:**
   - Click **Media** icon (musical note)
   - You should see **"Mavrixfy"** in the list
   - Click on it
   - Browse: Trending, Playlists, Albums
   - Select a song to play

### Step 7: Test Controls

- **Play/Pause** button
- **Next/Previous** buttons
- **Browse** different categories
- Check if songs load properly

---

## Method 3: Test on Real Android Device (Without Car)

### Step 1: Build and Install App

```bash
cd Mavrixfy_App/android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Step 2: Test MediaBrowserService

```bash
# Check if service is registered
adb shell dumpsys package com.mavrixfy.app | grep MusicService

# Start service manually
adb shell am start-foreground-service com.mavrixfy.app/.MusicService

# Check if service is running
adb shell dumpsys activity services | grep MusicService
```

### Step 3: View Logs

```bash
# Watch service logs
adb logcat | grep MusicService

# Watch all app logs
adb logcat | grep Mavrixfy

# Clear and start fresh
adb logcat -c
adb logcat
```

---

## Troubleshooting

### Issue: DHU not found

**Solution:**
```bash
# Install via SDK Manager
# Android Studio > Tools > SDK Manager > SDK Tools
# Check "Android Auto Desktop Head Unit Emulator"
```

### Issue: Phone not detected by DHU

**Solution:**
```bash
# Check ADB connection
adb devices

# Restart ADB
adb kill-server
adb start-server

# Reconnect phone
```

### Issue: App not showing in DHU

**Solution:**
1. Verify "Unknown sources" is enabled in Android Auto developer settings
2. Reinstall app:
   ```bash
   adb uninstall com.mavrixfy.app
   adb install app-debug.apk
   ```
3. Restart Android Auto on phone
4. Restart DHU

### Issue: Emulator is slow

**Solution:**
1. Increase RAM in AVD settings (4GB minimum)
2. Enable hardware acceleration:
   - Tools → SDK Manager → SDK Tools
   - Install "Intel x86 Emulator Accelerator (HAXM)"
3. Use a device with lower resolution

### Issue: Build fails

**Solution:**
```bash
# Clean and rebuild
cd Mavrixfy_App/android
./gradlew clean
./gradlew assembleDebug
```

---

## Quick Verification Commands

```bash
# Check if app is installed
adb shell pm list packages | grep mavrixfy

# Check app version
adb shell dumpsys package com.mavrixfy.app | grep versionName

# Check if MediaBrowserService is exported
adb shell dumpsys package com.mavrixfy.app | grep MusicService

# Test MediaSession
adb shell dumpsys media_session

# Force stop app
adb shell am force-stop com.mavrixfy.app

# Start app
adb shell am start -n com.mavrixfy.app/.MainActivity
```

---

## Expected Results

✅ **Automotive Emulator:**
- App launches normally
- Can play music
- Media controls work

✅ **DHU (Desktop Head Unit):**
- App appears in Media section
- Can browse: Trending, Playlists, Albums
- Can select and play songs
- Play/Pause/Next/Previous work
- Lock screen controls work

✅ **Logs show:**
```
MusicService: onCreate
MusicService: onGetRoot
MusicService: onLoadChildren: root
MediaSession: Session created
```

---

## Next Steps After Testing

1. **Integrate with your React Native code:**
   ```typescript
   import { useAndroidAuto } from './hooks/useAndroidAuto';
   
   const { syncMusicData } = useAndroidAuto();
   
   useEffect(() => {
     syncMusicData({
       trending: yourSongs,
       playlists: yourPlaylists,
       albums: yourAlbums
     });
   }, []);
   ```

2. **Test with real data from your API**

3. **Build release APK:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

4. **Test in real car** (if available)

---

## Recommended Testing Flow

1. ✅ Start with **Automotive Emulator** (easiest)
2. ✅ Move to **DHU with phone** (real Android Auto experience)
3. ✅ Finally test in **real car** (production validation)

Choose Method 1 (Automotive Emulator) if you want to start testing immediately without any phone setup!
