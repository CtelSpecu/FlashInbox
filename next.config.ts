import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 实验性功能
  experimental: {
    // 支持服务端组件的边缘运行时
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // 图片优化配置
  images: {
    unoptimized: true, // Cloudflare Workers 不支持 Next.js 图片优化
  },

  // 输出配置
  output: 'standalone',
};

export default nextConfig;
