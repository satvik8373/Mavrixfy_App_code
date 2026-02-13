const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Optimize bundle size
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    compress: {
      drop_console: true,
      drop_debugger: true,
      pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
      passes: 3,
    },
    mangle: {
      toplevel: true,
    },
    output: {
      comments: false,
      ascii_only: true,
    },
  },
  minifierPath: require.resolve('metro-minify-terser'),
};

// Exclude server-side dependencies from mobile bundle
config.resolver = {
  ...config.resolver,
  blockList: [
    /server\/.*/,
    /server_dist\/.*/,
    /drizzle\/.*/,
    /\.test\.(ts|tsx|js|jsx)$/,
    /\.spec\.(ts|tsx|js|jsx)$/,
    /__tests__\/.*/,
    /\.md$/,
    /\.map$/,
  ],
  sourceExts: [...config.resolver.sourceExts],
};

module.exports = config;
