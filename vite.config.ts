import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, type IndexHtmlTransformContext, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url));
const appBuildId = `${process.env.npm_package_version ?? '0.0.0'}-${new Date().toISOString()}`;

const htmlBuildStampPlugin: PluginOption = {
  name: 'auteura-html-build-stamp',
  transformIndexHtml(html: string, _context?: IndexHtmlTransformContext): string {
    return html.replaceAll('__AUTEURA_BUILD_ID__', encodeURIComponent(appBuildId));
  },
};

const devContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' ws: wss: https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "worker-src 'self' blob:",
].join('; ');

const pwaPlugin: PluginOption = VitePWA({
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  manifest: false,
  includeAssets: ['icons/icon-192.svg', 'icons/icon-512.svg', 'icons/icon-maskable.svg'],
  workbox: {
    globPatterns: ['**/*.{css,html,ico,js,json,png,svg,webmanifest,woff,woff2,wasm,onnx,task,cube}'],
    runtimeCaching: [
      {
        urlPattern: ({ url }): boolean =>
          url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'app-chunks',
          cacheableResponse: {
            statuses: [0, 200],
          },
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 30,
            maxEntries: 64,
          },
        },
      },
      {
        urlPattern: ({ request, url }): boolean =>
          request.destination === 'font' || /\.(?:woff2?|ttf|otf)$/u.test(url.pathname),
        handler: 'CacheFirst',
        options: {
          cacheName: 'font-assets',
          cacheableResponse: {
            statuses: [0, 200],
          },
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 365,
            maxEntries: 24,
          },
        },
      },
      {
        urlPattern: ({ url }): boolean => /\.cube$/u.test(url.pathname),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'lut-assets',
          cacheableResponse: {
            statuses: [0, 200],
          },
          networkTimeoutSeconds: 3,
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 14,
            maxEntries: 32,
          },
        },
      },
      {
        urlPattern: ({ url }): boolean => /\.(?:onnx|task)$/u.test(url.pathname),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'ai-model-assets',
          cacheableResponse: {
            statuses: [0, 200],
          },
          networkTimeoutSeconds: 5,
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 14,
            maxEntries: 16,
          },
        },
      },
      {
        urlPattern: ({ url }): boolean => /\.wasm$/u.test(url.pathname),
        handler: 'CacheFirst',
        options: {
          cacheName: 'wasm-assets',
          cacheableResponse: {
            statuses: [0, 200],
          },
          expiration: {
            maxAgeSeconds: 60 * 60 * 24 * 30,
            maxEntries: 16,
          },
        },
      },
    ],
  },
});

function getPackageName(id: string): string | null {
  const normalizedId = id.split('\\').join('/');
  const nodeModulesToken = '/node_modules/';
  const nodeModulesIndex = normalizedId.lastIndexOf(nodeModulesToken);

  if (nodeModulesIndex === -1) {
    return null;
  }

  const packagePath = normalizedId.slice(nodeModulesIndex + nodeModulesToken.length);
  const pathSegments = packagePath.split('/');

  if (pathSegments[0]?.startsWith('@') === true && pathSegments[1] !== undefined) {
    return `${pathSegments[0]}/${pathSegments[1]}`;
  }

  return pathSegments[0] ?? null;
}

export default defineConfig({
  define: {
    __AUTEURA_BUILD_ID__: JSON.stringify(appBuildId),
  },
  plugins: [react(), htmlBuildStampPlugin, pwaPlugin],
  publicDir: 'public',
  worker: {
    format: 'iife',
  },
  resolve: {
    alias: {
      '@': path.resolve(sourceDirectory),
    },
  },
  server: {
    headers: {
      'Content-Security-Policy': devContentSecurityPolicy,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self), microphone=(self), fullscreen=(self)',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          const packageName = getPackageName(id);

          if (packageName === null) {
            return undefined;
          }

          if (['react', 'react-dom', 'scheduler'].includes(packageName)) {
            return 'vendor-react';
          }

          if (
            packageName.startsWith('@mui/') ||
            packageName.startsWith('@emotion/') ||
            packageName === '@popperjs/core' ||
            packageName === 'react-transition-group'
          ) {
            return 'vendor-mui';
          }

          if (packageName.startsWith('@mediapipe/')) {
            return 'vendor-mediapipe';
          }

          if (packageName.startsWith('@sentry/')) {
            return 'vendor-observability';
          }

          if (['idb', 'rxjs'].includes(packageName)) {
            return 'vendor-data';
          }

          return 'vendor-misc';
        },
      },
    },
  },
});
