const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Disable bridgeless mode for compatibility
config.resolver = {
  ...config.resolver,
  blockList: [
    /server\/.*/,
    /server_dist\/.*/,
    /node_modules\/react-native-track-player\/lib\/web\/.*/,
    /node_modules\/react-native-track-player\/.*\.web\.js$/,
  ],
  assetExts: [...config.resolver.assetExts, 'db', 'mp3', 'ttf', 'obj', 'png', 'jpg'],
  sourceExts: [...config.resolver.sourceExts, 'jsx', 'js', 'ts', 'tsx', 'json'],
  platforms: ['ios', 'android'],
};

// Performance optimizations
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    compress: {
      drop_console: true,
      drop_debugger: true,
      reduce_funcs: true,
      dead_code: true,
      collapse_vars: true,
      reduce_vars: true,
      warnings: false,
      ecma: 2020,
      module: true,
      passes: 3,
    },
    mangle: {
      keep_fnames: false,
      keep_classnames: false,
      toplevel: true,
    },
    output: {
      comments: false,
      beautify: false,
      ascii_only: true,
    },
  },
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

config.unstable_bridgelessEnabled = false;

module.exports = config;
