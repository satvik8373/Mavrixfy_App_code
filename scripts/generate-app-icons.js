const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE_PNG = path.join(__dirname, '../../frontend/public/mavrixfy.png');
const OUTPUT_DIR = path.join(__dirname, '../assets/images');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateAppIcons() {
  console.log('Generating app icons from mavrixfy.png...');
  
  try {
    // Check if source file exists
    if (!fs.existsSync(SOURCE_PNG)) {
      console.error('❌ Source file not found:', SOURCE_PNG);
      console.log('Please ensure mavrixfy.png exists in frontend/public/');
      process.exit(1);
    }

    // Main app icon (1024x1024 for iOS)
    await sharp(SOURCE_PNG)
      .resize(1024, 1024)
      .png()
      .toFile(path.join(OUTPUT_DIR, 'icon.png'));
    console.log('Created: icon.png (1024x1024)');

    // Splash screen icon
    await sharp(SOURCE_PNG)
      .resize(512, 512)
      .png()
      .toFile(path.join(OUTPUT_DIR, 'splash-icon.png'));
    console.log('Created: splash-icon.png (512x512)');

    // Android adaptive icon - foreground
    await sharp(SOURCE_PNG)
      .resize(432, 432)
      .png()
      .toFile(path.join(OUTPUT_DIR, 'android-icon-foreground.png'));
    console.log('Created: android-icon-foreground.png (432x432)');

    // Android adaptive icon - background (solid color or pattern)
    await sharp({
      create: {
        width: 432,
        height: 432,
        channels: 4,
        background: { r: 18, g: 18, b: 18, alpha: 1 }
      }
    })
      .png()
      .toFile(path.join(OUTPUT_DIR, 'android-icon-background.png'));
    console.log('Created: android-icon-background.png (432x432)');

    // Android monochrome icon
    await sharp(SOURCE_PNG)
      .resize(432, 432)
      .greyscale()
      .png()
      .toFile(path.join(OUTPUT_DIR, 'android-icon-monochrome.png'));
    console.log('Created: android-icon-monochrome.png (432x432)');

    console.log('\n✅ All app icons generated successfully!');
    console.log('Icons are ready in: Mavrixfy_App/assets/images/');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateAppIcons();
