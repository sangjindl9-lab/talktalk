import type { NextConfig } from 'next';

const RAW_API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';
const API_BASE = /^https?:\/\//.test(RAW_API_BASE) ? RAW_API_BASE : `http://${RAW_API_BASE}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/media/:path*',
        destination: `${API_BASE}/api/v1/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
