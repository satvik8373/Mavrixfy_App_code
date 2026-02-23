const spotifyGreen = "#1DB954";
const spotifyBlack = "#121212";
const spotifyDarkGray = "#181818";
const spotifyLightGray = "#282828";
const spotifyWhite = "#FFFFFF";
const spotifySubtext = "#B3B3B3";

export default {
  light: {
    text: spotifyWhite,
    background: spotifyBlack,
    tint: spotifyGreen,
    tabIconDefault: spotifySubtext,
    tabIconSelected: spotifyWhite,
  },
  primary: spotifyGreen,
  primaryGlow: "rgba(29, 185, 84, 0.3)",
  background: spotifyBlack,
  backgroundGradientStart: "#0a0a0a",
  backgroundGradientEnd: "#1a1a1a",
  surface: spotifyDarkGray,
  surfaceLight: spotifyLightGray,
  surfaceGlass: "rgba(255, 255, 255, 0.08)",
  surfaceGlassDark: "rgba(0, 0, 0, 0.4)",
  text: spotifyWhite,
  subtext: spotifySubtext,
  inactive: "#535353",
  black: "#000000",
  gradientDark: ["#0a0a0a", "#121212", "#1a1a1a"],
  gradientGreen: ["#1DB954", "#1ed760", "#1fdf64"],
  shadow: {
    color: "#000000",
    offset: { width: 0, height: 4 },
    opacity: 0.3,
    radius: 8,
  },
};
