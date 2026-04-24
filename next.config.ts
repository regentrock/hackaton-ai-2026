import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ignorar erros do ESLint durante o build em produção
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ignorar erros de tipos durante o build em produção
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configuração do webpack para ignorar warnings
  webpack: (config, { isServer }) => {
    // Ignorar warnings de módulos
    config.ignoreWarnings = [{ module: /node_modules/ }];
    
    // Configuração específica para o Prisma no servidor
    if (isServer) {
      config.externals = [...(config.externals || []), 'prisma', '@prisma/client'];
    }
    
    return config;
  },
};

export default nextConfig;