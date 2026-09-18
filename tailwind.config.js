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
      colors: {
        surface: "#FFFFFF",
        "surface-muted": "#F8FAFC",
        ink: "#0F172A",
        "ink-muted": "#64748B",
        primary: "#2563EB",
        available: "#16A34A",
      },
    },
  },
  plugins: [],
};
