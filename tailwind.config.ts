import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#e5edf8",
        fog: "#070b14",
        brass: "#38bdf8",
        pine: "#22c55e",
        clay: "#fb7185",
        panel: "#0f172a",
        "panel-soft": "#111c33",
        stroke: "#1f2a44"
      },
      fontFamily: {
        display: ["Oswald", "sans-serif"],
        body: ["Manrope", "sans-serif"]
      },
      boxShadow: {
        card: "0 24px 45px -24px rgba(4, 10, 25, 0.85)"
      },
      animation: {
        "fade-up": "fadeUp 500ms ease-out",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite"
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" }
        }
      }
    }
  },
  plugins: []
};

export default config;
