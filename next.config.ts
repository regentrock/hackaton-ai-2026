import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Remover 'optimizeFonts' que não é uma opção válida no Next.js 15
  webpack: (config, { isServer, dev }) => {
    // Otimizar chunks no cliente
    if (!isServer && !dev) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
          cacheGroups: {
            default: false,
            vendors: false,
            framework: {
              chunks: 'all',
              name: 'framework',
              test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
              priority: 40,
              enforce: true,
            },
            lib: {
              test: (module: any) => {
                return (
                  module.size() > 160000 &&
                  /node_modules[/\\]/.test(module.identifier())
                );
              },
              name: (module: any) => {
                const identifier = module.identifier();
                const match = /node_modules[/\\](.+?)([/\\]|$)/.exec(identifier);
                if (match && match[1]) {
                  return `npm.${match[1].replace('@', '')}`;
                }
                return 'npm.unknown';
              },
              priority: 30,
              minChunks: 1,
              reuseExistingChunk: true,
            },
            commons: {
              name: 'commons',
              minChunks: 2,
              priority: 20,
            },
            shared: {
              name: (module: any, chunks: any) => {
                return `shared.${chunks.map((chunk: any) => chunk.name).join('.')}`;
              },
              priority: 10,
              minChunks: 2,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;