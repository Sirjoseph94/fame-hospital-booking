// Single source of truth for brand colours. CommonJS so tailwind.config.js
// can require it; components import it for props that can't take a
// className (icon `color`, ActivityIndicator, inline web styles).
const colors = {
  surface: "#FFFFFF",
  "surface-muted": "#F8FAFC",
  ink: "#0F172A",
  "ink-muted": "#64748B",
  primary: "#2563EB",
  available: "#16A34A",
  /** Needs attention (e.g. visit awaiting doctor confirmation). */
  warning: "#D97706",
  /** Destructive actions (e.g. delete account). */
  danger: "#DC2626",
};

module.exports = { colors };
