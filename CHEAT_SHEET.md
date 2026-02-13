# Mavrixfy Build & Update Cheat Sheet

## 🎯 Quick Decision Tree

```
Need to update app?
│
├─ Changed JavaScript/React code only?
│  └─ YES → Use EAS Update (INSTANT)
│     Command: quick-update.bat
│     Time: Seconds
│
└─ Changed native code/dependencies/app.json?
   └─ YES → Rebuild APK
      ├─ Fast (2-5 min): eas build --local
      └─ Cloud (10-20 min): eas build
```

---

## ⚡ Super Quick Commands

### Most Used (Copy & Paste)

```bash
# Instant update (90% of cases)
quick-update.bat

# Fast local build (when needed)
eas build --platform android --profile production --local

# Development mode
npx expo start --dev-client

# View builds
eas build:list

# View updates
eas update:list
```

---

## 📋 Command Reference

### Build Commands

| What | Command | Time |
|------|---------|------|
| Production APK (cloud) | `eas build --platform android --profile production` | 10-20 min |
| Production APK (local) | `eas build --platform android --profile production --local` | 2-5 min |
| Development build | `eas build --profile development --platform android` | 10-20 min |
| Preview/Test build | `eas build --platform android --profile preview` | 10-20 min |

### Update Commands

| What | Command | Time |
|------|---------|------|
| Publish to production | `quick-update.bat` or `eas update --branch production --message "msg"` | Instant |
| Publish to preview | `eas update --branch preview --message "msg"` | Instant |
| View all updates | `eas update:list` | - |
| View specific update | `eas update:view [id]` | - |
| Rollback update | `eas update:republish --group [id]` | Instant |

### Status Commands

| What | Command |
|------|---------|
| List builds | `eas build:list` |
| View build details | `eas build:view [id]` |
| Download build | `eas build:download --platform android` |
| List channels | `eas channel:list` |
| List secrets | `eas secret:list` |

---

## 🔄 Update Decision Matrix

| Change Type | Method | Command | Time |
|-------------|--------|---------|------|
| Bug fix | EAS Update | `quick-update.bat` | Instant |
| UI change | EAS Update | `quick-update.bat` | Instant |
| New feature (JS) | EAS Update | `quick-update.bat` | Instant |
| Text/content | EAS Update | `quick-update.bat` | Instant |
| Add JS package | EAS Update | `quick-update.bat` | Instant |
| Add native package | Rebuild | `eas build --local` | 2-5 min |
| Change app.json | Rebuild | `eas build --local` | 2-5 min |
| Update Expo SDK | Rebuild | `eas build --local` | 2-5 min |
| Change icon/splash | Rebuild | `eas build --local` | 2-5 min |

---

## 🎨 Development Workflows

### Workflow 1: Quick Fix
```bash
1. Fix code
2. npm start (test)
3. quick-update.bat
```
**Time:** 2-5 minutes

### Workflow 2: New Feature
```bash
1. Develop feature
2. npm start (test)
3. eas update --branch preview --message "test"
4. Test with users
5. quick-update.bat (production)
```
**Time:** Dev time + instant deploy

### Workflow 3: Native Changes
```bash
1. Make changes
2. npm start (test)
3. eas build --platform android --profile production --local
4. Distribute APK
```
**Time:** Dev time + 2-5 min build

---

## 🚀 Speed Optimization

### Fastest Build Method
```bash
# Setup once: Install Android Studio
# Then always use:
eas build --platform android --profile production --local
```
**Result:** 2-5 min builds instead of 10-20 min

### Fastest Update Method
```bash
# Use for 90% of changes:
quick-update.bat
```
**Result:** Instant updates, no APK needed

### Fastest Development
```bash
# Build dev client once:
eas build --profile development --platform android

# Then use:
npx expo start --dev-client
```
**Result:** Instant hot reload

---

## 📱 User Impact

### EAS Update
- ✅ Automatic (no user action)
- ✅ Fast (seconds to download)
- ✅ Seamless (applies on restart)
- ✅ Easy rollback

### APK Rebuild
- ❌ Manual (user must install)
- ❌ Slower (full APK download)
- ❌ Requires reinstall
- ✅ Includes native changes

---

## 🛠️ Setup Commands (One-Time)

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login
eas login

# 3. Setup environment
cd Mavrixfy_App
setup-env-for-build.bat

# 4. Setup updates
setup-eas-update.bat

# 5. Initial build
eas build --platform android --profile production
```

---

## 🎯 Best Practices

### ✅ DO
- Use EAS Update for most changes
- Test in preview before production
- Use descriptive update messages
- Use local builds for speed
- Version your updates

### ❌ DON'T
- Rebuild APK for every change
- Skip testing in preview
- Use vague update messages
- Forget to configure updates
- Ignore update monitoring

---

## 🚨 Emergency Commands

### Rollback Update
```bash
# 1. Find previous update
eas update:list --branch production

# 2. Rollback
eas update:republish --group [previous-update-group-id]
```

### Force Rebuild
```bash
eas build --platform android --profile production --clear-cache
```

### Check Update Status
```bash
eas update:list --branch production
```

---

## 📊 Time Comparison

| Task | Old Way | New Way | Time Saved |
|------|---------|---------|------------|
| Bug fix | Rebuild APK (20 min) | EAS Update (instant) | 20 min |
| UI update | Rebuild APK (20 min) | EAS Update (instant) | 20 min |
| New feature | Rebuild APK (20 min) | EAS Update (instant) | 20 min |
| APK build | Cloud (20 min) | Local (3 min) | 17 min |

**Average time saved per update:** 15-20 minutes

---

## 🎓 Learning Path

### Day 1: Setup
```bash
1. Install EAS CLI
2. Login to Expo
3. Configure environment
4. Build first APK
```

### Day 2: First Update
```bash
1. Make small change
2. Test locally
3. Publish with quick-update.bat
4. Verify on device
```

### Day 3: Local Builds
```bash
1. Install Android Studio
2. Configure environment
3. Try local build
4. Compare speed
```

### Week 2: Advanced
```bash
1. Use preview channel
2. Staged rollouts
3. A/B testing
4. Update monitoring
```

---

## 📞 Quick Help

### Build failing?
- Check `eas build:list` for errors
- Try `--clear-cache` flag
- Verify environment variables

### Update not working?
- Check `eas update:list`
- Verify app.json configuration
- Check device has internet

### Too slow?
- Use local builds
- Use EAS Update instead
- Enable caching

---

## 🎉 TL;DR

**Most common workflow:**
```bash
# Make changes → Test → Publish
quick-update.bat
```

**When you need APK:**
```bash
# Fast local build
eas build --platform android --profile production --local
```

**For development:**
```bash
# Hot reload
npx expo start --dev-client
```

That's it! 🚀
