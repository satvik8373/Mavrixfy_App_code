# Release Build Guide

This guide ensures proper APK installation and updates without "App not installed" errors.

## Prerequisites

1. **Release Keystore**: Make sure you have your release keystore configured
2. **Version Increment**: Always increment version before building

## Step-by-Step Release Process

### 1. Increment Version

Before building a new release, increment the version:

```bash
# For patch updates (1.2.0 → 1.2.1)
npm run version:patch

# For minor updates (1.2.0 → 1.3.0)
npm run version:minor

# For major updates (1.2.0 → 2.0.0)
npm run version:major
```

This automatically updates:
- `package.json` version
- `app.json` version
- `app.json` android.versionCode
- `app.json` runtimeVersion

### 2. Build Release APK

```bash
npm run build:apk
```

Or manually:

```bash
cd android
.\gradlew assembleRelease
cd ..
```

The APK will be at: `android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk`

### 3. Install on Device

#### Option A: Using ADB
```bash
adb install -r android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk
```

The `-r` flag replaces the existing app.

#### Option B: Manual Installation
1. Copy APK to device
2. Uninstall old version first (Settings → Apps → Mavrixfy → Uninstall)
3. Install new APK

### 4. Verify Installation

Check the version in Settings:
- Open app
- Go to Settings
- Check "Version" field shows the new version

## Troubleshooting "App not installed" Error

### Cause 1: Version Code Not Incremented
**Solution**: Always use `npm run version:patch` before building

### Cause 2: Signature Mismatch
**Problem**: Different keystores used for old and new APK

**Solution**: 
- Always use the same keystore for all releases
- Check `android/gradle.properties` has correct keystore path
- Verify keystore properties:
  ```
  MAVRIXFY_RELEASE_STORE_FILE=mavrixfy-release.keystore
  MAVRIXFY_RELEASE_KEY_ALIAS=mavrixfy
  MAVRIXFY_RELEASE_STORE_PASSWORD=your_password
  MAVRIXFY_RELEASE_KEY_PASSWORD=your_password
  ```

### Cause 3: Corrupted Installation
**Solution**: 
1. Uninstall old app completely
2. Clear app data: Settings → Apps → Mavrixfy → Storage → Clear Data
3. Restart device
4. Install new APK

### Cause 4: Insufficient Storage
**Solution**: Free up device storage (at least 100MB)

### Cause 5: APK Architecture Mismatch
**Solution**: Use the correct APK for your device:
- `app-armeabi-v7a-release.apk` - 32-bit ARM devices
- `app-arm64-v8a-release.apk` - 64-bit ARM devices (most modern phones)
- `app-x86_64-release.apk` - Emulators

## Version Code Calculation

The version code is automatically calculated from the version string:

```
versionCode = (major * 10000) + (minor * 100) + patch

Examples:
1.2.0 → 10200
1.2.1 → 10201
1.3.0 → 10300
2.0.0 → 20000
```

This ensures:
- Each version has a unique, incrementing code
- Android can properly detect updates
- No conflicts during installation

## Best Practices

1. **Always increment version** before building
2. **Use the same keystore** for all releases
3. **Test on real device** before distributing
4. **Keep keystore backup** in a secure location
5. **Document version changes** in release notes
6. **Test update path** from previous version

## Quick Commands

```bash
# Complete release workflow
npm run version:patch          # Increment version
npm run build:apk             # Build APK
adb install -r android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk  # Install

# Check what's installed
adb shell pm list packages | grep mavrixfy
adb shell dumpsys package com.mavrixfy.app | grep versionCode

# Uninstall if needed
adb uninstall com.mavrixfy.app
```

## Expo Updates (OTA)

For JavaScript-only updates without rebuilding APK:

```bash
# Publish update to production
npm run update:production

# Publish update to preview
npm run update:preview
```

Note: OTA updates only work for JS changes, not native code changes.
