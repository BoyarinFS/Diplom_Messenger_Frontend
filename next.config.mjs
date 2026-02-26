/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
  reactStrictMode: false,

  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 10,
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
    ],
  },

  turbopack: {},


  webpack: (config, { isServer, dev }) => {
    config.module.rules.push({
      test: /\.(java|xml|properties)$/,
      use: 'ignore-loader',
    });

    if (dev) {

      config.mode = 'development';
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
        minimize: false,
        moduleIds: 'named',
        chunkIds: 'named',
      };
      config.devtool = false;
    }

    return config;
  },

  async headers() {

    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
