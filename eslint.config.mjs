import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "data/**", "public/**"],
  },
  ...coreWebVitals,
  {
    // Skip eslint-plugin-react's filesystem version lookup on every run.
    settings: { react: { version: "19.2" } },
  },
];

export default config;
