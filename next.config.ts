import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configuração webpack simplificada
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Garantir que o Prisma não seja externalizado
      if (config.externals) {
        const externals = config.externals;
        if (Array.isArray(externals)) {
          config.externals = externals.filter((external) => {
            if (typeof external === 'string') {
              return external !== 'prisma' && external !== '@prisma/client';
            }
            return true;
          });
        }
      }
    }
    return config;
  },
};

export default nextConfig;