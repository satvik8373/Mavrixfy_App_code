# APK Size Optimization Guide

This document outlines all optimizations applied to reduce the APK size from 100+ MB to a smaller footprint.

## Applied Optimizations

### 1. Android Build Configuration
- **Hermes Engine**: Enabled for faster startup and smaller bundle
- **ProGuard**: Enabled code minification and obfuscation
- **Resource Shrinking**: Removes unused resources automatically
- **ABI Splits**: Separate APKs for arm64-v8a and armeabi-v7a (reduces size by ~40%)
- **Legacy Packaging**: Disabled for modern compression

### 2. Metro Bundler Optimization
- **Console Removal**: All console.log/info/debug/warn removed in production
- **Minification**: 3-pass compression with Terser
- **Tree Shaking**: Dead code elimination
- **Mangle**: Variable name shortening
- **Excluded Files**: Test files, markdown, source maps blocked from bundle

### 3. Dependency Cleanup
Removed unused dependencies:
- `@stardazed/streams-text-encoding` (not needed)
- `@ungap/structured-clone` (not needed)
- `drizzle-zod` (server-only)
- `react-native-worklets` (not actively used)
- `zod-validation-error` (can use zod directly)

### 4. Image Optimization
- **favicon.png**: 612KB → ~50KB (optimized to 48x48)
- **icon.png**: 295KB → ~150KB (optimized compression)
- **splash-icon.png**: 108KB → ~60KB (optimized to 512x512)
- Run `npm run optimize:images` before building

### 5. Firebase Optimization
- Using modular imports (already implemented)
- Only importing needed Firebase services
- Auth persistence with AsyncStorage

### 6. EAS Build Configuration
- Production build uses release gradle command
- Fast resolver enabled
- Proper caching configured
- .easignore excludes unnecessary files

## Build Commands

### For Smallest APK (Recommended)
```bash
# Optimize images first
npm run optimize:images

# Build with ABI splits (creates separate APKs per architecture)
eas build --platform android --profile production
```

This creates two APKs:
- `app-arm64-v8a-release.apk` (~25-35 MB) - For modern devices
- `app-armeabi-v7a-release.apk` (~22-30 MB) - For older devices

### For Universal APK (Single file, larger)
```bash
eas build --platform android --profile production-aab
```

### For Testing (Smaller, faster builds)
```bash
eas build --platform android --profile preview
```

## Expected Size Reductions

| Optimization | Size Reduction |
|--------------|----------------|
| ABI Splits | ~40% |
| ProGuard + Resource Shrinking | ~20-30% |
| Image Optimization | ~1-2 MB |
| Dependency Cleanup | ~5-10 MB |
| Metro Minification | ~15-20% |
| **Total Expected** | **60-70% reduction** |

## Size Breakdown (Estimated)

Original: ~100 MB
After optimization: ~30-40 MB per architecture-specific APK

## Additional Tips

1. **Use AAB for Play Store**: App Bundle format allows Google to generate optimized APKs
2. **Monitor Bundle Size**: Use `npx expo export --dump-sourcemap` to analyze
3. **Lazy Load**: Consider code splitting for large features
4. **Asset Delivery**: Move large assets to CDN/Firebase Storage
5. **Remove Unused Fonts**: Check if all @expo-google-fonts are needed

## Verification

After building, check APK size:
```bash
# Download APK from EAS
eas build:list

# Check size
ls -lh *.apk
```

## Troubleshooting

If APK is still large:
1. Run `npx expo-doctor` to check for issues
2. Analyze bundle: `npx react-native-bundle-visualizer`
3. Check for duplicate dependencies: `npm ls`
4. Verify ProGuard is working: Check build logs for "minifyEnabled"

## Next Steps for Further Reduction

1. **Code Splitting**: Implement lazy loading for routes
2. **Dynamic Imports**: Load heavy libraries on-demand
3. **Asset Optimization**: Convert PNGs to WebP
4. **Remove Unused Expo Modules**: Audit and remove unused expo-* packages
5. **Firebase Lite**: Consider Firebase Lite SDK if full features not needed
