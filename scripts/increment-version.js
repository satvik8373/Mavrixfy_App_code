#!/usr/bin/env node

/**
 * Increment Version Script
 * Increments version in both package.json and app.json
 * Ensures versionCode is also incremented for Android
 */

const fs = require('fs');
const path = require('path');

const type = process.argv[2] || 'patch'; // major, minor, or patch

// Read package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Read app.json
const appJsonPath = path.join(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

// Parse current version
const [major, minor, patch] = packageJson.version.split('.').map(Number);

// Calculate new version
let newMajor = major;
let newMinor = minor;
let newPatch = patch;

switch (type) {
  case 'major':
    newMajor++;
    newMinor = 0;
    newPatch = 0;
    break;
  case 'minor':
    newMinor++;
    newPatch = 0;
    break;
  case 'patch':
  default:
    newPatch++;
    break;
}

const newVersion = `${newMajor}.${newMinor}.${newPatch}`;

// Calculate new versionCode (major * 10000 + minor * 100 + patch)
const newVersionCode = (newMajor * 10000) + (newMinor * 100) + newPatch;

console.log(`📦 Incrementing version: ${packageJson.version} → ${newVersion}`);
console.log(`🔢 New versionCode: ${newVersionCode}`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

// Update app.json
appJson.expo.version = newVersion;
appJson.expo.android.versionCode = newVersionCode;
appJson.expo.runtimeVersion = newVersion;
if (appJson.expo.ios) {
  appJson.expo.ios.buildNumber = String(newVersionCode);
}

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

console.log('✅ Version updated successfully!');
console.log('');
console.log('📝 Updated files:');
console.log('   - package.json');
console.log('   - app.json');
console.log('');
console.log('🚀 Next steps:');
console.log('   1. Build APK: npm run build:apk');
console.log('   2. Test installation on device');
console.log('   3. Commit changes: git add . && git commit -m "Bump version to v' + newVersion + '"');
