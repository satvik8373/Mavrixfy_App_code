const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Server dependencies that should NOT be in mobile app
const serverDeps = [
  'express',
  'pg',
  'drizzle-orm',
  'http-proxy-middleware',
  'tsx',
  'ws'
];

console.log('🔧 Moving server dependencies to devDependencies...\n');

let moved = 0;

serverDeps.forEach(dep => {
  if (packageJson.dependencies[dep]) {
    const version = packageJson.dependencies[dep];
    
    // Move to devDependencies
    packageJson.devDependencies[dep] = version;
    delete packageJson.dependencies[dep];
    
    console.log(`✅ Moved: ${dep}@${version}`);
    moved++;
  }
});

if (moved > 0) {
  // Write back to package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log(`\n✅ Successfully moved ${moved} server dependencies!`);
  console.log('\n📦 Next steps:');
  console.log('1. Run: npm install');
  console.log('2. Run: eas build --platform android --profile production --clear-cache');
  console.log('\n💡 Expected APK size reduction: 20-30 MB');
} else {
  console.log('\n✅ All server dependencies are already in the correct place!');
}
