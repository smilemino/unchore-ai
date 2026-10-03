import nextConfig from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "worker/**", "skills/*/scripts/**", "next-env.d.ts"] },
  ...nextConfig,
  ...nextTs,
];
export default config;
