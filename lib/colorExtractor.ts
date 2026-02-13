/**
 * Extract dominant color from image URL
 * Uses a simple approach with fallback colors
 */

interface ColorResult {
  primary: string;
  text: string;
}

// Cache for extracted colors
const colorCache = new Map<string, ColorResult>();

/**
 * Extract dominant color from image
 * For now, returns predefined colors based on image URL hash
 * In production, you could use a library like react-native-image-colors
 */
export async function extractDominantColor(imageUrl: string): Promise<ColorResult> {
  // Check cache first
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  // Generate a consistent color based on URL hash
  const hash = simpleHash(imageUrl);
  const hue = hash % 360;
  
  // Generate color with good saturation and lightness for dark theme
  const saturation = 45 + (hash % 30); // 45-75%
  const lightness = 35 + (hash % 20); // 35-55%
  
  const primary = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const text = lightness > 45 ? "#000000" : "#FFFFFF";

  const result: ColorResult = { primary, text };
  
  // Cache the result
  colorCache.set(imageUrl, result);
  
  return result;
}

/**
 * Simple hash function for strings
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Predefined color palettes for common music genres/moods
 */
export const musicColorPalettes = {
  // Vibrant colors
  vibrant: [
    { primary: "#1DB954", text: "#000000" }, // Spotify Green
    { primary: "#E13300", text: "#FFFFFF" }, // Red
    { primary: "#FF6B35", text: "#000000" }, // Orange
    { primary: "#F7B801", text: "#000000" }, // Yellow
    { primary: "#8338EC", text: "#FFFFFF" }, // Purple
    { primary: "#3A86FF", text: "#FFFFFF" }, // Blue
    { primary: "#FB5607", text: "#000000" }, // Bright Orange
    { primary: "#FF006E", text: "#FFFFFF" }, // Pink
  ],
  // Muted/Dark colors
  muted: [
    { primary: "#2D3142", text: "#FFFFFF" }, // Dark Blue Gray
    { primary: "#4F5D75", text: "#FFFFFF" }, // Slate
    { primary: "#5C4742", text: "#FFFFFF" }, // Brown
    { primary: "#3D5A80", text: "#FFFFFF" }, // Navy
    { primary: "#6A4C93", text: "#FFFFFF" }, // Deep Purple
  ],
};

/**
 * Get a random color from predefined palettes
 */
export function getRandomMusicColor(): ColorResult {
  const allColors = [...musicColorPalettes.vibrant, ...musicColorPalettes.muted];
  const randomIndex = Math.floor(Math.random() * allColors.length);
  return allColors[randomIndex];
}

/**
 * Clear color cache (useful for memory management)
 */
export function clearColorCache(): void {
  colorCache.clear();
}
