import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1f4ea1",
          darkBlue: "#183c7e",
          yellow: "#f4d23c",
          pink: "#e5165a",
          steel: "#b9c0c7"
        },
        surface: {
          base: "#e8eaed",
          card: "#f3f4f6",
          line: "#d3d7dc"
        },
        txt: {
          strong: "#0f172a",
          mid: "#334155",
          light: "#6b7280"
        }
      },
      boxShadow: {
        panel: "0 1px 4px rgba(15, 23, 42, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;

