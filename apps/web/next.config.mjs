/** @type {import('next').NextConfig} */
const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

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
