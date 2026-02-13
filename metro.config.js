const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Optimize bundle size
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    compress: {
      drop_console: true,
      drop_debugger: true,
      passes: 2,
    },
    mangle: true,
    output: {
      comments: false,
    },
  },
};

// Exclude server-side dependencies from mobile bundle
config.resolver = {
  ...config.resolver,
  blockList: [
    /server\/.*/,
    /server_dist\/.*/,
    /drizzle\/.*/,
  ],
};

module.exports = config;
