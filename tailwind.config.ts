import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        tech: ['JetBrains Mono', 'Courier New', 'Monaco', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
