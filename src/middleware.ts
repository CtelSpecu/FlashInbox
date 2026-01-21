import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 生成安全响应头
 */
function getSecurityHeaders(isAdmin: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': isAdmin ? 'no-referrer' : 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  // CSP 策略
  if (isAdmin) {
    // 管理后台更严格的 CSP
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // shadcn/ui 需要
      "style-src 'self' 'unsafe-inline'", // Tailwind 需要
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ');
  } else {
    // 用户站点 CSP（允许 Turnstile）
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ');
  }

  return headers;
}

/**
 * Next.js 中间件
 * 处理安全头、CSP 和路由保护
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 判断是否为管理后台路由
  const isAdmin = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  // 创建响应
  const response = NextResponse.next();

  // 添加安全头
  const securityHeaders = getSecurityHeaders(isAdmin);
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  // API 响应的 CORS 处理
  if (pathname.startsWith('/api/')) {
    // 不允许跨域请求 API
    response.headers.set('Access-Control-Allow-Origin', request.nextUrl.origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: response.headers,
      });
    }
  }

  return response;
}

/**
 * 中间件匹配配置
 * 匹配所有 API 路由和页面路由
 */
export const config = {
  matcher: [
    // 匹配所有 API 路由
    '/api/:path*',
    // 匹配管理后台
    '/admin/:path*',
    // 匹配用户端页面（排除静态资源）
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)',
  ],
};

