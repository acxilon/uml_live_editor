import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const root = path.dirname(fileURLToPath(import.meta.url));

const server = await createServer({
  configFile: path.join(root, 'vite.config.js'),
});

await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`;
server.printUrls();

const env = { ...process.env, VITE_DEV_SERVER_URL: url, NODE_ENV: 'development' };
// Some CI/harness environments set this globally; Electron would then start as
// plain Node.js instead of a desktop app.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: false,
  env,
});

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.close().catch(() => {});
  if (!child.killed) child.kill();
  process.exit(code);
}

child.on('exit', (code) => {
  void shutdown(code ?? 0);
});
child.on('error', (error) => {
  console.error('[dev] Failed to launch Electron:', error);
  void shutdown(1);
});

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
