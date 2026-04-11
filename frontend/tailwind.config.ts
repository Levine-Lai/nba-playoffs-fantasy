import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#2a63d2",
          darkBlue: "#1d428a",
          yellow: "#ffdb4d",
          yellowLight: "#ffea8a",
          pink: "#c8102e",
          magenta: "#e7358d",
          steel: "#c4ced4"
        },
        surface: {
          base: "#eef0f2",
          card: "#fafafa",
          line: "#d8d8d8",
          header: "#c4ced4"
        },
        txt: {
          strong: "#262626",
          mid: "#333d47",
          light: "#6b7280"
        }
      },
      boxShadow: {
        panel: "1px 2px 10px 2px rgba(0, 0, 0, 0.10)",
        card: "0 7px 18px rgba(29, 66, 138, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
