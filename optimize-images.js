const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const imagesToOptimize = [
  { input: 'assets/images/favicon.png', output: 'assets/images/favicon.png', size: 48 },
  { input: 'assets/images/icon.png', output: 'assets/images/icon.png', size: 1024 },
  { input: 'assets/images/splash-icon.png', output: 'assets/images/splash-icon.png', size: 512 },
  { input: 'assets/images/android-icon-foreground.png', output: 'assets/images/android-icon-foreground.png', size: 432 },
  { input: 'assets/images/android-icon-monochrome.png', output: 'assets/images/android-icon-monochrome.png', size: 432 },
];

async function optimizeImages() {
  console.log('🖼️  Optimizing images for production...\n');
  
  for (const img of imagesToOptimize) {
    const inputPath = path.join(__dirname, img.input);
    const outputPath = path.join(__dirname, img.output);
    
    if (!fs.existsSync(inputPath)) {
      console.log(`⚠️  Skipping ${img.input} (not found)`);
      continue;
    }
    
    const originalSize = fs.statSync(inputPath).size;
    
    await sharp(inputPath)
      .resize(img.size, img.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 90, compressionLevel: 9, palette: true })
      .toFile(outputPath + '.tmp');
    
    const newSize = fs.statSync(outputPath + '.tmp').size;
    
    if (newSize < originalSize) {
      fs.renameSync(outputPath + '.tmp', outputPath);
      const savings = ((1 - newSize / originalSize) * 100).toFixed(1);
      console.log(`✅ ${img.input}: ${(originalSize / 1024).toFixed(1)}KB → ${(newSize / 1024).toFixed(1)}KB (${savings}% smaller)`);
    } else {
      fs.unlinkSync(outputPath + '.tmp');
      console.log(`ℹ️  ${img.input}: Already optimized`);
    }
  }
  
  console.log('\n✨ Image optimization complete!');
}

optimizeImages().catch(console.error);
