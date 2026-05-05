import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

delete process.env.NEXT_DEV_WRANGLER_ENV;

initOpenNextCloudflareForDev({
  persist: { path: '.wrangler/state' },
});

const nextConfig: NextConfig = {
  // 实验性功能
  experimental: {
    // 支持服务端组件的边缘运行时
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // 限制构建静态页时的 worker 数量，避免在资源受限环境中被 OOM / Worker 退出
    cpus: 4,
  },

  // 图片优化配置
  images: {
    unoptimized: true, // Cloudflare Workers 不支持 Next.js 图片优化
  },

  // 输出配置
  output: 'standalone',
};

export default nextConfig;
