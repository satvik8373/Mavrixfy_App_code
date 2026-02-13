module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          unstable_transformImportMeta: true,
          lazyImports: true,
        }
      ]
    ],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./",
          },
        },
      ],
    ],
    env: {
      production: {
        plugins: [
          "transform-remove-console",
          ["react-native-paper/babel", { "env": "production" }],
        ],
      },
    },
  };
};
