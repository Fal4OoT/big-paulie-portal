import type { Config } from "tailwindcss";

// Direction artistique tirée du logo Big Paulie : panneau émaillé crème, rouge
// rétro, vert « racing », ciel de Sandy Shores au crépuscule.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: "#120D0B", 900: "#0C0807", 800: "#1A1310", 700: "#241A15", 600: "#30241D", 500: "#3F3027" },
        cream: { DEFAULT: "#F1E6CF", muted: "#B9A88E", dim: "#7F705E" },
        paulie: { red: "#9E1B1E", "red-bright": "#C8312F", green: "#1F5A3A", "green-bright": "#2F7D53" },
        sunset: "#E07A2F",
        sand: "#D9A441",
      },
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        sign: "0 0 0 1px rgba(241,230,207,0.06), 0 12px 30px -12px rgba(0,0,0,0.7)",
      },
    },
  },
  plugins: [],
};

export default config;
