# Testing and Debugging the App Crash

## Current Status
- App crashes immediately after installation on emulator
- ProGuard rules have been updated to be less aggressive
- APK splits are working (4 architecture-specific APKs under 40 MB each)

## Steps to Test and Debug

### 1. Install and Test on Emulator

```bash
# Navigate to the app directory
cd Mavrixfy_App

# Install the ARM64 APK on emulator (most common)
adb install android/app/build/outputs/apk/release/app-arm64-v8a-release.apk

# Or if emulator is x86_64
adb install android/app/build/outputs/apk/release/app-x86_64-release.apk
```

### 2. Get Crash Logs

```bash
# Clear logcat first
adb logcat -c

# Start monitoring logs
adb logcat | grep -E "(AndroidRuntime|ReactNative|Mavrixfy|FATAL)"

# Or save to file
adb logcat > crash-log.txt
```

### 3. Test Without ProGuard (if still crashing)

If the app still crashes, temporarily disable ProGuard to confirm it's the issue:

Edit `android/gradle.properties` and set:
```properties
android.enableMinifyInReleaseBuilds=false
android.enableProguardInReleaseBuilds=false
```

Then rebuild:
```bash
cd android
./gradlew clean
./gradlew :app:assembleRelease
```

### 4. Build with EAS (Production)

Once the app works locally, build with EAS:

```bash
npx eas-cli build --platform android --profile production-optimized
```

## Expected APK Sizes
- ARM64 (arm64-v8a): ~27-28 MB ✅
- ARMv7 (armeabi-v7a): ~23-24 MB ✅
- x86_64: ~29 MB ✅
- x86: ~28-29 MB ✅

## Common ProGuard Issues

If specific classes are being stripped, add to `proguard-rules.pro`:
```
-keep class com.your.package.** { *; }
```

## Distribution
- Distribute ARM64 APK for modern devices (2019+)
- Distribute ARMv7 APK for older devices
- Users only download ONE APK based on their device architecture
