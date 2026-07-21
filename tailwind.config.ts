import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          bg: "#FDFBF7",       // Background Primary - Porcelain Ivory
          card: "#F4EFEA",     // Background Secondary / Cards - Warm Cream
          border: "#E6DFD5",   // Borders & Dividers - Soft Ivory Border
        },
        ink: {
          DEFAULT: "#2B2623",  // Text Primary - Soft Deep Charcoal
          muted: "#7A726A",    // Text Muted - Warm Muted Stone
        },
        gold: {
          DEFAULT: "#C5A059",  // Accent / Highlights - Muted Warm Gold
          light: "#D9BD84",
          dark: "#A9803F",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 20px rgba(43, 38, 35, 0.06)",
        card: "0 1px 3px rgba(43, 38, 35, 0.05), 0 8px 24px rgba(43, 38, 35, 0.04)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        shimmer: "shimmer 2.2s linear infinite",
      },
      transitionTimingFunction: {
        buttery: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
