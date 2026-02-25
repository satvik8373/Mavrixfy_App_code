# Build iOS IPA with Codemagic (No Mac Required!)

## What is Codemagic?
Codemagic provides cloud Mac machines to build iOS apps. You don't need your own Mac!

## Free Tier
- 500 build minutes/month FREE
- Enough for several iOS builds
- No credit card required to start

---

## Step-by-Step Setup

### 1. Create Codemagic Account
1. Go to https://codemagic.io/
2. Sign up with GitHub/GitLab/Bitbucket
3. Connect your repository

### 2. Get Expo Access Token
1. Go to https://expo.dev/
2. Login to your account
3. Navigate to: Account Settings → Access Tokens
4. Create a new token with name "Codemagic"
5. Copy the token (you'll need it in step 4)

### 3. Push Configuration to Git
```bash
cd e:\Mavrixfy\Mavrixfy_App
git add codemagic.yaml
git commit -m "Add Codemagic iOS build configuration"
git push
```

### 4. Configure Codemagic
1. Go to https://codemagic.io/apps
2. Click "Add application"
3. Select your repository
4. Codemagic will detect `codemagic.yaml` automatically
5. Go to Environment variables:
   - Add variable: `EXPO_TOKEN`
   - Paste your Expo token from step 2
   - Mark it as "Secure" ✓

### 5. Start Your First Build
1. In Codemagic dashboard, select your app
2. Choose workflow: `expo-ios-workflow`
3. Click "Start new build"
4. Wait 15-20 minutes for build to complete
5. Download your IPA file!

---

## Build Profiles Available

### Production Build (App Store)
```bash
# In Codemagic, select: expo-ios-workflow
```
- For App Store submission
- Requires Apple Developer account ($99/year)
- Optimized and signed

### Preview Build (Testing)
```bash
# In Codemagic, select: expo-ios-preview
```
- For internal testing
- Can install on registered devices
- No App Store needed

---

## Important Notes

### Apple Developer Account
- **Still required** for iOS distribution ($99/year)
- Codemagic just provides the Mac to build
- You need Apple account to sign the app

### Without Apple Developer Account
You can still:
- Build the IPA file
- Test in iOS Simulator
- Share with TestFlight testers (after getting account)

You cannot:
- Install on physical iPhone
- Publish to App Store

---

## Troubleshooting

### Build Fails - "No provisioning profile"
You need to set up iOS signing in Codemagic:
1. Go to Teams → Integrations
2. Add App Store Connect API key
3. Follow Codemagic's guide: https://docs.codemagic.io/yaml-code-signing/signing-ios/

### Build Fails - "Expo authentication failed"
1. Check your EXPO_TOKEN is correct
2. Make sure it's marked as "Secure"
3. Token should have full permissions

### Want to use EAS Build instead?
EAS Build (Expo's service) also provides cloud Mac builders:
```bash
npm install -g eas-cli
eas login
eas build --platform ios
```

---

## Cost Comparison

| Service | Free Tier | Paid |
|---------|-----------|------|
| Codemagic | 500 min/month | $0.038/min |
| EAS Build | Limited builds | $29/month unlimited |
| Rent Mac | None | $30-99/month |
| Buy Mac | None | $1000+ |

**Recommendation**: Start with Codemagic free tier!

---

## Next Steps

1. ✅ Configuration file created (`codemagic.yaml`)
2. ⬜ Push to Git
3. ⬜ Create Codemagic account
4. ⬜ Get Expo token
5. ⬜ Configure environment variables
6. ⬜ Start build
7. ⬜ Download IPA

Need help? Check: https://docs.codemagic.io/yaml-quick-start/building-a-react-native-app/
