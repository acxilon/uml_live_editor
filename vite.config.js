import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionOf = (name) =>
  String(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? '').replace(/^[^\d]*/, '');

function contentSecurityPolicy(isDev) {
  const script = isDev
    ? "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'"
    : "script-src 'self' 'wasm-unsafe-eval'";
  const connect = isDev
    ? "connect-src 'self' ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:*"
    : "connect-src 'self'";
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    connect,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ');
}

export default defineConfig({
  root: path.join(root, 'src'),
  base: './',
  publicDir: path.join(root, 'public'),
  plugins: [
    {
      name: 'uml-live-csp',
      transformIndexHtml(html, context) {
        const isDev = Boolean(context.server);
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: contentSecurityPolicy(isDev),
            },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __PLANTUML_VERSION__: JSON.stringify(versionOf('@plantuml/core')),
    __MERMAID_VERSION__: JSON.stringify(versionOf('mermaid')),
  },
  server: {
    host: '127.0.0.1',
    port: 5183,
    strictPort: false,
  },
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
    target: 'chrome130',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 6000,
    sourcemap: false,
  },
});
