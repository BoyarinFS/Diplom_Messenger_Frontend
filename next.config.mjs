/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Добавляем поддержку WASM
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Для клиента игнорируем нативные модули node
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        assert: false,
      };
    }

    // Добавляем rule для WASM файлов
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
  },

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
  
  // Убираем дублирующийся webpack и turbopack

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