import coreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [".next/**", "node_modules/**", "data/**", "public/**"],
  },
  ...coreWebVitals,
];
