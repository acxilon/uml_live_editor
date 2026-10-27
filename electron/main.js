import { app, BrowserWindow, ClipboardItem, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, nativeTheme, protocol, screen, session, shell } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const rendererDir = path.join(projectRoot, 'dist');
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devServerUrl = process.env.VITE_DEV_SERVER_URL || '';
const APP_SCHEME = 'uml-live';
const APP_HOST = 'renderer';
const APP_INDEX = `${APP_SCHEME}://${APP_HOST}/index.html`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let trayHintShown = false;
let isQuitting = false;
let closePromptState = 'idle';
let closePromptTimer = null;
let closeRequestToken = 0;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

async function readWindowState() {
  try {
    const raw = await readFile(windowStateFile(), 'utf8');
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object') return null;
    const width = Number(state.width);
    const height = Number(state.height);
    const x = Number(state.x);
    const y = Number(state.y);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 900 || height < 600) return null;
    // Only restore the position if it still lands on a connected display.
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const visible = screen.getAllDisplays().some((display) => {
        const area = display.workArea;
        return x < area.x + area.width - 80 && x + width > area.x + 80 && y < area.y + area.height - 50 && y + height > area.y + 50;
      });
      if (!visible) return { width, height, maximized: Boolean(state.maximized) };
    }
    return {
      width,
      height,
      x: Number.isFinite(x) ? x : undefined,
      y: Number.isFinite(y) ? y : undefined,
      maximized: Boolean(state.maximized),
    };
  } catch {
    return null;
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    mkdirSync(path.dirname(windowStateFile()), { recursive: true });
    writeFileSync(
      windowStateFile(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }, null, 2),
      'utf8',
    );
  } catch {
    // A non-writable userData directory should never block shutdown.
  }
}

async function registerAppProtocol() {
  await protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const target = path.resolve(rendererDir, `.${pathname}`);
      if (target !== rendererDir && !target.startsWith(rendererDir + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await readFile(target);
      const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': type,
          'cache-control': 'no-cache',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function overlayColors(theme) {
  return theme === 'light'
    ? { color: '#f4f6fb', symbolColor: '#3b4759' }
    : { color: '#0a0c12', symbolColor: '#9aa8bd' };
}

function applyThemeToWindow(win, theme) {
  if (!win || win.isDestroyed()) return;
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
  win.setBackgroundColor(theme === 'light' ? '#f4f6fb' : '#0a0c12');
  if (process.platform === 'win32' || process.platform === 'linux') {
    try {
      win.setTitleBarOverlay({ ...overlayColors(theme), height: 46 });
    } catch {
      // titleBarOverlay is not supported on every platform/desktop combination.
    }
  }
}

function trayIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(projectRoot, 'build', 'tray.png');
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApplication() {
  isQuitting = true;
  app.quit();
}

function createTray() {
  if (tray) return tray;

  let image = nativeImage.createFromPath(trayIconPath());
  if (image.isEmpty() && !app.isPackaged) {
    image = nativeImage.createFromPath(path.join(projectRoot, 'build', 'icon.png'));
  }
  if (image.isEmpty()) {
    console.warn('[tray] Icon not found:', trayIconPath());
    return null;
  }

  try {
    tray = new Tray(image);
    tray.setToolTip('UML Live — PlantUML / Mermaid');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示 UML Live', click: showMainWindow },
        { type: 'separator' },
        { label: '退出 UML Live', click: quitApplication },
      ]),
    );
    tray.on('click', showMainWindow);
    tray.on('double-click', showMainWindow);
    tray.on('balloon-click', showMainWindow);
    return tray;
  } catch (error) {
    console.error('[tray] Failed to create tray:', error);
    tray = null;
    return null;
  }
}

function notifyMinimizedToTray() {
  if (trayHintShown || !tray || process.platform !== 'win32') return;
  trayHintShown = true;
  try {
    tray.displayBalloon({
      title: 'UML Live 仍在运行',
      content: '窗口已最小化到系统托盘。单击托盘图标重新打开，右键菜单可以退出。',
      iconType: 'info',
      noSound: true,
    });
  } catch {
    // Balloon notifications are optional; some Windows configurations suppress them.
  }
}

function clearClosePromptTimer() {
  if (closePromptTimer) {
    clearTimeout(closePromptTimer);
    closePromptTimer = null;
  }
}

function hideToTray(win) {
  if (!createTray()) return false;
  win.hide();
  notifyMinimizedToTray();
  return true;
}

/**
 * Ask the renderer to show the themed close dialog. The native dialog below is
 * only a fallback for a crashed/loading renderer or an unanswered request.
 */
function requestClosePrompt(win) {
  if (closePromptState !== 'idle' || isQuitting) return;
  const webContents = win.webContents;
  const rendererBusy =
    (typeof webContents.isCrashed === 'function' && webContents.isCrashed()) ||
    (typeof webContents.isLoading === 'function' && webContents.isLoading());

  if (webContents.isDestroyed() || rendererBusy) {
    void showNativeClosePrompt(win);
    return;
  }

  const token = ++closeRequestToken;
  closePromptState = 'renderer';
  webContents.send('window:close-request', token);

  clearClosePromptTimer();
  closePromptTimer = setTimeout(() => {
    closePromptTimer = null;
    if (closePromptState !== 'renderer' || token !== closeRequestToken) return;
    closePromptState = 'idle';
    try {
      webContents.send('window:close-request-cancelled');
    } catch {
      // Renderer may be gone; the native fallback will still work.
    }
    void showNativeClosePrompt(win);
  }, 6000);
}

async function showNativeClosePrompt(win) {
  if (isQuitting || !win || win.isDestroyed()) return;
  closePromptState = 'native';
  clearClosePromptTimer();
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      title: '关闭 UML Live',
      message: '要最小化到系统托盘，还是退出 UML Live？',
      detail: '最小化到托盘后，UML Live 会继续在后台运行。你可以单击托盘图标重新打开，或通过托盘菜单退出。',
      buttons: ['最小化到托盘', '退出 UML Live'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

    if (isQuitting || win.isDestroyed()) return;

    if (response === 0) {
      if (!hideToTray(win)) {
        dialog.showErrorBox('UML Live', '无法创建系统托盘图标，窗口将保持打开。');
      }
    } else {
      quitApplication();
    }
  } catch (error) {
    console.error('[window] Close prompt failed:', error);
  } finally {
    if (closePromptState === 'native') closePromptState = 'idle';
  }
}

async function createWindow() {
  const saved = await readWindowState();
  const opts = {
    width: saved?.width ?? 1440,
    height: saved?.height ?? 900,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#0a0c12',
    title: 'UML Live',
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...overlayColors('dark'), height: 46 },
    autoHideMenuBar: true,
    icon: !app.isPackaged && existsSync(path.join(projectRoot, 'build', 'icon.ico'))
      ? path.join(projectRoot, 'build', 'icon.ico')
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: false,
      devTools: true,
    },
  };
  if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
    opts.x = saved.x;
    opts.y = saved.y;
  }

  const win = new BrowserWindow(opts);
  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
    if (saved?.maximized) win.maximize();
  });

  win.on('close', (event) => {
    saveWindowState(win);
    if (isQuitting) return;
    event.preventDefault();
    if (closePromptState === 'idle') requestClosePrompt(win);
  });
  win.on('session-end', () => {
    // Windows shutdown/logoff must not be blocked by the close confirmation.
    isQuitting = true;
    closePromptState = 'idle';
    clearClosePromptTimer();
  });
  win.on('closed', () => {
    clearClosePromptTimer();
    closePromptState = 'idle';
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    if (url !== current) event.preventDefault();
  });

  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[load-error]', errorCode, errorDescription, validatedURL);
  });

  try {
    const query = process.env.UML_LIVE_DEBUG === '1' ? '?debug=1' : '';
    if (isDev) {
      await win.loadURL(`${devServerUrl}${query}`);
    } else {
      await win.loadURL(`${APP_INDEX}${query}`);
    }
  } catch (error) {
    console.error('[window] Failed to load the renderer:', error);
    dialog.showErrorBox(
      'UML Live',
      '无法加载应用界面。\n\n请确认安装文件完整，或重新安装 UML Live。',
    );
    win.destroy();
    app.quit();
  }

  return win;
}

function normalizeFilters(filters) {
  if (!Array.isArray(filters)) return undefined;
  const cleaned = filters
    .filter((filter) => filter && typeof filter === 'object' && typeof filter.name === 'string' && Array.isArray(filter.extensions))
    .map((filter) => ({
      name: filter.name.slice(0, 80),
      extensions: filter.extensions
        .filter((ext) => typeof ext === 'string' && /^[a-zA-Z0-9*]+$/.test(ext))
        .slice(0, 8),
    }))
    .filter((filter) => filter.extensions.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function safeDefaultName(name, fallback) {
  const raw = typeof name === 'string' && name.trim() ? name.trim() : fallback;
  return raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 120);
}

function toBuffer(data) {
  if (typeof data === 'string') return null;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return Buffer.from(data);
  return null;
}

function parentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
}

function registerIpc() {
  ipcMain.handle('file:save', async (event, payload = {}) => {
    const { data, encoding = 'utf8', filePath: requestedPath } = payload;
    const buffer = toBuffer(data);
    if (buffer === null && typeof data !== 'string') {
      throw new Error('Nothing to save.');
    }
    const fallback = buffer === null ? 'diagram.svg' : 'diagram.png';
    let target = typeof requestedPath === 'string' && requestedPath.trim() ? requestedPath : '';
    if (!target) {
      const result = await dialog.showSaveDialog(parentWindow(event), {
        title: 'Save diagram',
        defaultPath: path.join(app.getPath('documents'), safeDefaultName(payload.defaultName, fallback)),
        filters: normalizeFilters(payload.filters) || [{ name: 'All files', extensions: ['*'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      target = result.filePath;
    }
    await mkdir(path.dirname(target), { recursive: true });
    if (buffer === null) {
      await writeFile(target, String(data), encoding === 'utf16le' ? 'utf16le' : 'utf8');
    } else {
      await writeFile(target, buffer);
    }
    return { canceled: false, filePath: target };
  });

  ipcMain.handle('file:open', async (event) => {
    const result = await dialog.showOpenDialog(parentWindow(event), {
      title: 'Open diagram source',
      defaultPath: app.getPath('documents'),
      properties: ['openFile'],
      filters: [
        { name: 'Diagram sources', extensions: ['puml', 'plantuml', 'pu', 'uml', 'mmd', 'mermaid', 'txt'] },
        { name: 'PlantUML', extensions: ['puml', 'plantuml', 'pu', 'uml'] },
        { name: 'Mermaid', extensions: ['mmd', 'mermaid'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const filePath = result.filePaths[0];
    const data = await readFile(filePath);
    if (data.byteLength > 5 * 1024 * 1024) throw new Error('That file is too large to open (limit: 5 MB).');
    return { canceled: false, filePath, content: data.toString('utf8').replace(/^\uFEFF/, '') };
  });

  ipcMain.handle('window:close-response', async (event, token, action) => {
    if (!['tray', 'quit'].includes(action)) {
      return { ok: false, error: '未知的关闭操作。' };
    }
    if (closePromptState !== 'renderer' || token !== closeRequestToken) {
      return { ok: false, stale: true };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      closePromptState = 'idle';
      clearClosePromptTimer();
      return { ok: false, error: '窗口已经关闭。' };
    }

    clearClosePromptTimer();
    closePromptState = 'idle';

    if (action === 'tray') {
      if (!hideToTray(win)) {
        return { ok: false, error: '无法创建系统托盘图标，窗口将保持打开。' };
      }
      return { ok: true };
    }

    quitApplication();
    return { ok: true };
  });

  ipcMain.handle('clipboard:image', async (_event, data) => {
    const buffer = toBuffer(data);
    if (!buffer || buffer.length === 0) return { ok: false, error: 'No image data.' };
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) return { ok: false, error: 'Could not decode the rendered image.' };
    // Electron 45 exposes the W3C-style async clipboard API. Fall back to the
    // legacy synchronous writeImage method on older runtimes.
    if (typeof clipboard.write === 'function' && typeof ClipboardItem === 'function') {
      const blob = new Blob([buffer], { type: 'image/png' });
      await clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } else if (typeof clipboard.writeImage === 'function') {
      clipboard.writeImage(image);
    } else {
      return { ok: false, error: 'This Electron version has no image clipboard support.' };
    }
    return { ok: true, width: image.getSize().width, height: image.getSize().height };
  });

  ipcMain.handle('clipboard:text', async (_event, text) => {
    if (typeof text !== 'string') return { ok: false };
    await clipboard.writeText(text);
    return { ok: true };
  });

  ipcMain.handle('window:theme', async (_event, theme) => {
    const value = theme === 'light' ? 'light' : 'dark';
    applyThemeToWindow(mainWindow, value);
    return { theme: value };
  });

  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale(),
  }));
}

app.on('second-instance', () => {
  // A second launch should reveal the window that is currently hidden in the tray.
  showMainWindow();
});

if (hasSingleInstanceLock) {
  app.whenReady()
    .then(async () => {
      app.setAppUserModelId('com.umllive.editor');
      Menu.setApplicationMenu(null);
      if (!isDev) await registerAppProtocol();
      session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      registerIpc();
      await createWindow();
      createTray();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
        else showMainWindow();
      });
    })
    .catch((error) => {
      console.error('[app] Startup failed:', error);
      dialog.showErrorBox('UML Live', `应用启动失败。\n\n${error?.message ?? error}`);
      app.quit();
    });
}

app.on('before-quit', () => {
  isQuitting = true;
  closePromptState = 'idle';
  clearClosePromptTimer();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
