/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.(java|xml|properties)$/,
      use: 'ignore-loader',
    });
    return config;
  },
};

export default nextConfig;
