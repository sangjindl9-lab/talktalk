import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/media/:path*',
        destination: `${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/v1/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
