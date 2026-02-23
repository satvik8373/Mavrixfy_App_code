@echo off
REM Build ARM v7a APK for smaller file size
REM This script builds only the armeabi-v7a architecture APK

echo.
echo ========================================
echo   Building Mavrixfy ARM v7a APK
echo ========================================
echo.
echo This will create a smaller APK (~25-30MB)
echo Compatible with most Android devices
echo.

REM Build using EAS
call eas build --platform android --profile production-arm --local

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo APK Name: app-armeabi-v7a-release.apk
echo Location: android\app\build\outputs\apk\release\
echo.
pause
