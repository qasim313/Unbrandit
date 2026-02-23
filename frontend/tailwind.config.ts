import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Android brand green
        android: {
          DEFAULT: "#3DDC84",
          dim: "#34c578",
          dark: "#2a9e5e",
          muted: "rgba(61,220,132,0.12)"
        },
        // GitHub-inspired dark palette
        gh: {
          bg: "#0d1117",
          surface: "#161b22",
          elevated: "#1c2128",
          border: "#30363d",
          "border-muted": "#21262d",
          default: "#e6edf3",
          subtle: "#c9d1d9",
          muted: "#8b949e",
          faint: "#484f58"
        },
        danger: "#f85149",
        success: "#3fb950",
        info: "#58a6ff",
        warn: "#d29922"
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "monospace"]
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.2s ease both",
        "slide-down": "slide-down 0.2s ease both",
        "slide-up": "slide-up 0.2s ease both",
        blink: "blink 1.4s ease-in-out infinite"
      },
      boxShadow: {
        "card": "0 1px 3px rgba(0,0,0,0.4)",
        "overlay": "0 8px 24px rgba(0,0,0,0.5)"
      }
    }
  },
  plugins: []
};

export default config;
