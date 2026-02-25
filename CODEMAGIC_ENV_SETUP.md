# How to Add EXPO_TOKEN in Codemagic (Step-by-Step)

## The Problem
Your build is failing because Codemagic can't find the EXPO_TOKEN environment variable.

---

## Solution: Add Environment Variable Correctly

### Method 1: Using Environment Variable Groups (Recommended)

1. **Go to Codemagic Teams Settings**
   - URL: https://codemagic.io/teams
   - Click on your team name

2. **Create Variable Group**
   - Click "Environment variables" in left sidebar
   - Click "Add variable group"
   - Name it: `expo_credentials`
   - Click "Create"

3. **Add EXPO_TOKEN to Group**
   - Click on `expo_credentials` group
   - Click "Add variable"
   - Variable name: `EXPO_TOKEN`
   - Variable value: Paste your Expo token (get from https://expo.dev/settings/access-tokens)
   - Check ✅ "Secure"
   - Click "Add"

4. **Verify in YAML**
   - Your codemagic.yaml already has:
   ```yaml
   environment:
     groups:
       - expo_credentials
   ```

### Method 2: Add Directly to Workflow

1. **Go to Your App in Codemagic**
   - https://codemagic.io/apps
   - Select "Mavrixfy_App_code"

2. **Select Workflow**
   - Click on "expo-ios-workflow"

3. **Add Environment Variable**
   - Scroll down to "Environment variables" section
   - Click "Add variable"
   - Variable name: `EXPO_TOKEN`
   - Variable value: Your Expo token
   - Check ✅ "Secure"
   - Click "Add"

---

## How to Get Your Expo Token

1. Go to: https://expo.dev/
2. Login to your account
3. Click your profile → Settings
4. Go to "Access Tokens" tab
5. Click "Create Token"
6. Name: "Codemagic CI"
7. Copy the token (it looks like: `ey...` very long string)

---

## Verify It's Working

After adding the token, the build will show:

```
✅ Verify Expo Token
EXPO_TOKEN is set (length: 200)

✅ Build iOS IPA with EAS
Logged in as: your-username
```

If you see "ERROR: EXPO_TOKEN is not set!" - the variable wasn't added correctly.

---

## Common Mistakes

❌ Adding token with quotes: `"ey..."`
✅ Add token without quotes: `ey...`

❌ Adding to wrong team/app
✅ Make sure you're in the correct Codemagic team

❌ Not checking "Secure" checkbox
✅ Always check "Secure" for tokens

❌ Extra spaces before/after token
✅ Paste token cleanly, no spaces

---

## Still Not Working?

Try this alternative: Use EAS Build directly (skip Codemagic)

```bash
# On your Windows machine
npm install -g eas-cli
eas login
eas build --platform ios --profile production
```

EAS will build on their servers (also cloud Mac) and you can download the IPA.
