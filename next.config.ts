import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pixi ships modern ESM; let Next transpile it for the client bundle.
  transpilePackages: ['pixi.js'],
};

export default nextConfig;
