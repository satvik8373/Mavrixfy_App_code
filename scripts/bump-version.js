#!/usr/bin/env node

/**
 * Version Bump Script
 * 
 * Automatically bumps version in:
 * - app.json
 * - package.json
 * - Backend app-version.json
 * 
 * Usage:
 *   npm run version:patch  (1.0.0 → 1.0.1)
 *   npm run version:minor  (1.0.0 → 1.1.0)
 *   npm run version:major  (1.0.0 → 2.0.0)
 */

const fs = require('fs');
const path = require('path');

const bumpType = process.argv[2] || 'patch';

if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('❌ Invalid bump type. Use: major, minor, or patch');
  process.exit(1);
}

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  
  switch (type) {
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'patch':
      parts[2]++;
      break;
  }
  
  return parts.join('.');
}

function updateFile(filePath, updateFn) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    const oldVersion = updateFn(data);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    return oldVersion;
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return null;
  }
}

console.log(`\n🚀 Bumping ${bumpType} version...\n`);

// 1. Update app.json
const appJsonPath = path.join(__dirname, '../app.json');
const oldAppVersion = updateFile(appJsonPath, (data) => {
  const oldVersion = data.expo.version;
  const newVersion = bumpVersion(oldVersion, bumpType);
  data.expo.version = newVersion;
  data.expo.runtimeVersion = newVersion;
  
  // Bump build numbers
  if (data.expo.android) {
    data.expo.android.versionCode = (data.expo.android.versionCode || 1) + 1;
  }
  if (data.expo.ios) {
    data.expo.ios.buildNumber = String((parseInt(data.expo.ios.buildNumber || '1') + 1));
  }
  
  console.log(`✅ app.json: ${oldVersion} → ${newVersion}`);
  if (data.expo.android) {
    console.log(`   Android versionCode: ${data.expo.android.versionCode}`);
  }
  if (data.expo.ios) {
    console.log(`   iOS buildNumber: ${data.expo.ios.buildNumber}`);
  }
  
  return oldVersion;
});

// 2. Update package.json
const packageJsonPath = path.join(__dirname, '../package.json');
updateFile(packageJsonPath, (data) => {
  const oldVersion = data.version;
  const newVersion = bumpVersion(oldVersion, bumpType);
  data.version = newVersion;
  console.log(`✅ package.json: ${oldVersion} → ${newVersion}`);
  return oldVersion;
});

// 3. Update backend app-version.json
const backendVersionPath = path.join(__dirname, '../../Mavrixfy-web/backend/app-version.json');
if (fs.existsSync(backendVersionPath)) {
  updateFile(backendVersionPath, (data) => {
    const oldVersion = data.latestVersion;
    const newVersion = bumpVersion(oldVersion, bumpType);
    data.latestVersion = newVersion;
    data.releaseDate = new Date().toISOString().split('T')[0];
    console.log(`✅ backend/app-version.json: ${oldVersion} → ${newVersion}`);
    return oldVersion;
  });
} else {
  console.log('⚠️  Backend app-version.json not found, skipping');
}

// 4. Update mobile server app-version.json
const mobileServerVersionPath = path.join(__dirname, '../server/app-version.json');
if (fs.existsSync(mobileServerVersionPath)) {
  updateFile(mobileServerVersionPath, (data) => {
    const oldVersion = data.latestVersion;
    const newVersion = bumpVersion(oldVersion, bumpType);
    data.latestVersion = newVersion;
    data.releaseDate = new Date().toISOString().split('T')[0];
    console.log(`✅ server/app-version.json: ${oldVersion} → ${newVersion}`);
    return oldVersion;
  });
}

console.log('\n✨ Version bump complete!\n');
console.log('Next steps:');
console.log('1. Update changelog in app-version.json');
console.log('2. Commit changes: git add . && git commit -m "Bump version to X.X.X"');
console.log('3. Build app: npm run build:eas');
console.log('4. Deploy backend: git push\n');
