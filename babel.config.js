module.exports = function configureBabel(api) {
  api.cache(true);

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // babel-preset-expo adds the worklets (Reanimated 4) plugin automatically.
  };
};
