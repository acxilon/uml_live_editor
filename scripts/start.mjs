import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
// Harmless in normal shells, but some CI/sandbox environments set this globally;
// it makes electron.exe behave like plain Node.js instead of the desktop app.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: false,
  env,
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
child.on('error', (error) => {
  console.error('[start] Failed to launch Electron:', error);
  process.exit(1);
});
