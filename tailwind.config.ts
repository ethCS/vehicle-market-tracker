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
        ink: "#111827",
        fog: "#f3f4f6",
        brass: "#b45309",
        pine: "#166534",
        clay: "#9a3412"
      },
      fontFamily: {
        display: ["Oswald", "sans-serif"],
        body: ["Manrope", "sans-serif"]
      },
      boxShadow: {
        card: "0 20px 35px -20px rgba(17, 24, 39, 0.35)"
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
