import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 开发 / preview 时把浏览器里的相对路径请求转到本机 Hono。
 * 覆盖环境变量可连远端：VITE_API_PROXY_TARGET=https://example.com
 */
const API_TARGET = process.env.VITE_API_PROXY_TARGET?.trim() || 'http://127.0.0.1:3751';

const proxy = {
  '/api': { target: API_TARGET, changeOrigin: true, secure: false },
  '/auth': { target: API_TARGET, changeOrigin: true, secure: false },
  '/rss': { target: API_TARGET, changeOrigin: true, secure: false },
  '/mcp': { target: API_TARGET, changeOrigin: true, secure: false },
  '/subscription': { target: API_TARGET, changeOrigin: true, secure: false },
  '/admin/parse': { target: API_TARGET, changeOrigin: true, secure: false },
  '/admin/extractor': { target: API_TARGET, changeOrigin: true, secure: false },
} as const;

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: true,
    allowedHosts: ['rssany', '.rssany', 'rssany.com', '.rssany.com'],
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: { ...proxy },
  },
  /** `vite preview` 无 dev 中间件，须单独配置，否则 /api 落到静态页导致 fetch 异常 */
  preview: {
    proxy: { ...proxy },
  },
});
