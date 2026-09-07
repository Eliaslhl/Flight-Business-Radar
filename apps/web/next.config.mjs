/** @type {import('next').NextConfig} */
// `API_INTERNAL_URL` peut arriver sans protocole (ex. `fromService` de Render,
// qui ne fournit que le hostname) — on préfixe `https://` le cas échéant.
const RAW_API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
const API_URL = /^https?:\/\//.test(RAW_API_URL) ? RAW_API_URL : `https://${RAW_API_URL}`;

const nextConfig = {
  reactStrictMode: true,
  // Lint tourne dans sa propre tâche (`turbo run lint`), pas pendant le build.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/health", destination: `${API_URL}/health` },
    ];
  },
};

export default nextConfig;
