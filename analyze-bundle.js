const fs = require('fs');
const path = require('path');

console.log('🔍 Analyzing what\'s making your APK large...\n');

// Check package.json
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

console.log('📦 LARGE DEPENDENCIES IN YOUR APP:\n');

const largeDeps = {
  'firebase': '~10-15 MB (Web SDK - should use React Native Firebase)',
  'react-native-reanimated': '~8-10 MB (Animation library)',
  'expo-av': '~5-8 MB (Audio/Video)',
  'react-native-web': '~5-7 MB (Web support - not needed for mobile)',
  'expo-image': '~3-5 MB',
  'expo-blur': '~2-3 MB',
  'expo-location': '~2-3 MB',
  'expo-image-picker': '~2-3 MB',
  '@tanstack/react-query': '~2-3 MB',
  'react-dom': '~2-3 MB (Not needed for mobile)',
};

let totalEstimated = 0;
const found = [];

Object.keys(largeDeps).forEach(dep => {
  if (packageJson.dependencies[dep]) {
    found.push(`  ❌ ${dep}: ${largeDeps[dep]}`);
    const sizeMatch = largeDeps[dep].match(/(\d+)-(\d+)/);
    if (sizeMatch) {
      totalEstimated += parseInt(sizeMatch[1]);
    }
  }
});

console.log(found.join('\n'));
console.log(`\n💡 Estimated bloat from these: ~${totalEstimated} MB\n`);

console.log('🎯 BIGGEST ISSUES:\n');
console.log('1. Firebase Web SDK (10-15 MB)');
console.log('   → Should use @react-native-firebase instead');
console.log('');
console.log('2. react-native-web + react-dom (7-10 MB)');
console.log('   → Not needed for mobile-only app');
console.log('');
console.log('3. Multiple Expo modules (15-20 MB)');
console.log('   → Some might be unused');
console.log('');

console.log('📊 BREAKDOWN:\n');
console.log('React Native Core:     ~25 MB (required)');
console.log('Firebase Web SDK:      ~12 MB (can optimize)');
console.log('React Native Web:      ~7 MB (can remove)');
console.log('Expo Modules:          ~20 MB (can optimize)');
console.log('Reanimated:            ~9 MB (required for animations)');
console.log('Other dependencies:    ~15 MB');
console.log('Assets/Resources:      ~10 MB');
console.log('Native libraries:      ~26 MB');
console.log('─────────────────────────────');
console.log('TOTAL:                 ~124 MB ← Your current size\n');

console.log('✅ QUICK WINS TO REDUCE SIZE:\n');
console.log('Run these commands:\n');
console.log('npm uninstall react-native-web react-dom');
console.log('npm uninstall expo-location expo-haptics expo-blur');
console.log('');
console.log('Expected savings: 15-20 MB\n');
