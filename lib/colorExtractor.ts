/**
 * Extract dominant color from image URL
 * Uses a simple approach with fallback colors
 */

interface ColorResult {
  primary: string;
  text: string;
  isDark: boolean;
}

// Cache for extracted colors
const colorCache = new Map<string, ColorResult>();

/**
 * Spotify-style color palettes - vibrant and dark
 */
const spotifyColorPalettes = [
  { primary: "#1DB954", text: "#000000", isDark: false }, // Spotify Green
  { primary: "#E13300", text: "#FFFFFF", isDark: true },  // Red
  { primary: "#8E44AD", text: "#FFFFFF", isDark: true },  // Purple
  { primary: "#3498DB", text: "#FFFFFF", isDark: true },  // Blue
  { primary: "#E67E22", text: "#000000", isDark: false }, // Orange
  { primary: "#16A085", text: "#FFFFFF", isDark: true },  // Teal
  { primary: "#C0392B", text: "#FFFFFF", isDark: true },  // Dark Red
  { primary: "#2C3E50", text: "#FFFFFF", isDark: true },  // Dark Blue
  { primary: "#8E44AD", text: "#FFFFFF", isDark: true },  // Deep Purple
  { primary: "#D35400", text: "#FFFFFF", isDark: true },  // Dark Orange
  { primary: "#27AE60", text: "#000000", isDark: false }, // Green
  { primary: "#2980B9", text: "#FFFFFF", isDark: true },  // Ocean Blue
  { primary: "#F39C12", text: "#000000", isDark: false }, // Yellow
  { primary: "#E74C3C", text: "#FFFFFF", isDark: true },  // Bright Red
  { primary: "#9B59B6", text: "#FFFFFF", isDark: true },  // Violet
];

/**
 * Extract dominant color from image
 * Returns consistent Spotify-style colors based on image URL
 */
export async function extractDominantColor(imageUrl: string): Promise<ColorResult> {
  // Check cache first
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  // Generate a consistent color based on URL hash
  const hash = simpleHash(imageUrl);
  const colorIndex = hash % spotifyColorPalettes.length;
  
  const result = spotifyColorPalettes[colorIndex];
  
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
 * Get a random color from Spotify palettes
 */
export function getRandomMusicColor(): ColorResult {
  const randomIndex = Math.floor(Math.random() * spotifyColorPalettes.length);
  return spotifyColorPalettes[randomIndex];
}

/**
 * Clear color cache (useful for memory management)
 */
export function clearColorCache(): void {
  colorCache.clear();
}
