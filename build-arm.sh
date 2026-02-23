#!/bin/bash

# Build ARM v7a APK for smaller file size
# This script builds only the armeabi-v7a architecture APK

echo "🚀 Building Mavrixfy ARM v7a APK..."
echo "This will create a smaller APK (~25-30MB) compatible with most Android devices"
echo ""

# Build using EAS
eas build --platform android --profile production-arm --local

echo ""
echo "✅ Build complete!"
echo "📦 APK will be named: app-armeabi-v7a-release.apk"
echo "📍 Location: Mavrixfy_App/android/app/build/outputs/apk/release/"
