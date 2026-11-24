const { colors } = require("./lib/theme-colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Required for NativeWind on web (Expo Router syncs color scheme at runtime).
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Defined in lib/theme-colors.js (also used for icon/indicator colours).
      colors,
    },
  },
  plugins: [],
};
