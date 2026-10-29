/**
 * Dev smoke test: launches the built app with remote debugging enabled, drives
 * the debug bridge, renders every template and captures screenshots/exports.
 * Not shipped with the app.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '_out');
const port = 9333;
await mkdir(outDir, { recursive: true });

const env = { ...process.env, UML_LIVE_DEBUG: '1' };
delete env.ELECTRON_RUN_AS_NODE;

let electronLog = '';
const packagedExe = process.env.UML_CAPTURE_EXE;
const command = packagedExe || electronPath;
const args = packagedExe ? [`--remote-debugging-port=${port}`] : ['.', `--remote-debugging-port=${port}`];
const child = spawn(command, args, {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk) => {
  electronLog += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  electronLog += chunk.toString();
});
child.on('exit', (code) => {
  console.log(`[electron] exited with ${code}`);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && /uml-live|localhost/.test(target.url));
      if (page) return page;
    } catch {
      // Not listening yet.
    }
    await sleep(200);
  }
  throw new Error('DevTools target did not appear');
}

const target = await waitForTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let messageId = 0;
const pending = new Map();
const consoleLines = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    consoleLines.push(
      `[console.${message.params.type}] ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`,
    );
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleLines.push(
      `[exception] ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`,
    );
  }
  if (message.method === 'Log.entryAdded') {
    const entry = message.params.entry;
    consoleLines.push(`[log.${entry.level}] ${entry.text}`);
  }
});

function send(method, params = {}) {
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = true) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const file = path.join(outDir, name);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  const info = await stat(file);
  console.log(`[shot] ${name} ${info.size} bytes`);
  return file;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await sleep(600);

let debugReady = false;
for (let i = 0; i < 120; i += 1) {
  const type = await evaluate('typeof window.__umlLive');
  if (type === 'object') {
    debugReady = true;
    break;
  }
  await sleep(250);
}

if (!debugReady) {
  console.log('[fatal] debug bridge not available');
  console.log('title:', await evaluate('document.title'));
  console.log('body:', String(await evaluate('document.body.innerText')).slice(0, 1500));
  console.log('[console]', consoleLines.join('\n'));
  console.log('[electron]', electronLog.slice(-4000));
  await screenshot('00-failed.png').catch(() => {});
  try {
    await send('Browser.close');
  } catch {}
  child.kill();
  process.exit(1);
}

// Verify the editor Ctrl+wheel font gesture and keep screenshots at the default size.
await evaluate(`window.__umlLive.setEditorFontSize(12.8)`);
await sleep(200);
const editorFont = await evaluate(`(() => {
  const scroller = document.querySelector('.cm-scroller');
  const before = window.__umlLive.getState().editorFontSize;
  const rect = scroller.getBoundingClientRect();
  scroller.dispatchEvent(new WheelEvent('wheel', {
    deltaY: -120,
    ctrlKey: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true,
    cancelable: true
  }));
  return {
    before,
    after: window.__umlLive.getState().editorFontSize,
    css: getComputedStyle(scroller).fontSize,
    footer: document.getElementById('editorFontSize').textContent
  };
})()`);
console.log('[editor-font]', JSON.stringify(editorFont));
const editorFontBounds = await evaluate(`(() => {
  const max = window.__umlLive.setEditorFontSize(999).size;
  const min = window.__umlLive.setEditorFontSize(-999).size;
  window.__umlLive.setEditorFontSize(12.8);
  return { min, max };
})()`);
console.log('[editor-font-bounds]', JSON.stringify(editorFontBounds));
await sleep(400);

const initialState = await evaluate(`(async () => {
  for (let i = 0; i < 150; i += 1) {
    const s = window.__umlLive.getState();
    if (!s.isRendering && (s.currentValid || s.lastError)) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  return window.__umlLive.getState();
})()`);
console.log('[initial]', JSON.stringify(initialState, null, 2));
await sleep(400);
await screenshot('01-dark-plantuml.png');

await evaluate(`document.getElementById('previewOnlyBtn').click()`);
await sleep(450);
const previewOnlyState = await evaluate(`(() => {
  const editor = document.getElementById('editorPane');
  const preview = document.getElementById('previewPane');
  const viewport = document.getElementById('previewViewport');
  const button = document.getElementById('previewOnlyBtn');
  return {
    active: document.body.classList.contains('is-preview-only'),
    editorDisplay: getComputedStyle(editor).display,
    editorWidth: editor.getBoundingClientRect().width,
    previewWidth: preview.getBoundingClientRect().width,
    viewportWidth: viewport.getBoundingClientRect().width,
    buttonPressed: button.getAttribute('aria-pressed')
  };
})()`);
console.log('[preview-only]', JSON.stringify(previewOnlyState));
await screenshot('01b-preview-only.png');
await evaluate(`document.getElementById('previewOnlyBtn').click()`);
await sleep(400);
const previewRestoredState = await evaluate(`(() => ({
  active: document.body.classList.contains('is-preview-only'),
  editorDisplay: getComputedStyle(document.getElementById('editorPane')).display,
  buttonPressed: document.getElementById('previewOnlyBtn').getAttribute('aria-pressed')
}))()`);
console.log('[preview-restored]', JSON.stringify(previewRestoredState));

await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'F11',
  code: 'F11',
  windowsVirtualKeyCode: 122,
  nativeVirtualKeyCode: 122,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'F11',
  code: 'F11',
  windowsVirtualKeyCode: 122,
  nativeVirtualKeyCode: 122,
});
await sleep(350);
const previewOnlyByF11 = await evaluate(
  `document.body.classList.contains('is-preview-only')`,
);
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
  nativeVirtualKeyCode: 27,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
  nativeVirtualKeyCode: 27,
});
await sleep(350);
const previewRestoredByEsc = await evaluate(
  `!document.body.classList.contains('is-preview-only')`,
);
console.log(
  '[preview-shortcuts]',
  JSON.stringify({ previewOnlyByF11, previewRestoredByEsc }),
);

await evaluate(`document.getElementById('fitBtn').click()`);
await sleep(150);
const viewAfterButton = await evaluate(`(() => {
  const viewport = document.getElementById('previewViewport').getBoundingClientRect();
  const layer = document.getElementById('diagramLayer').getBoundingClientRect();
  const state = window.__umlLive.getState();
  return {
    zoom: state.zoom,
    centered:
      Math.abs(viewport.left + viewport.width / 2 - (layer.left + layer.width / 2)) < 1.5 &&
      Math.abs(viewport.top + viewport.height / 2 - (layer.top + layer.height / 2)) < 1.5,
    viewport: { width: viewport.width, height: viewport.height },
    diagram: { width: layer.width, height: layer.height }
  };
})()`);
const wheelInZoom = await evaluate(`(() => {
  const viewport = document.getElementById('previewViewport');
  const rect = viewport.getBoundingClientRect();
  viewport.dispatchEvent(new WheelEvent('wheel', {
    deltaY: -120,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true,
    cancelable: true
  }));
  return window.__umlLive.getState().zoom;
})()`);
const wheelOutZoom = await evaluate(`(() => {
  const viewport = document.getElementById('previewViewport');
  const rect = viewport.getBoundingClientRect();
  viewport.dispatchEvent(new WheelEvent('wheel', {
    deltaY: 120,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true,
    cancelable: true
  }));
  return window.__umlLive.getState().zoom;
})()`);
const viewControls = { initialZoom: initialState.zoom, viewAfterButton, wheelInZoom, wheelOutZoom };
console.log('[view-controls]', JSON.stringify(viewControls));

const templates = await evaluate('window.__umlLive.getTemplates()');
const templateResults = [];
for (const template of templates) {
  const started = Date.now();
  try {
    const result = await evaluate(
      `window.__umlLive.loadTemplate(${JSON.stringify(template.id)})`,
      true,
    );
    const state = await evaluate('window.__umlLive.getState()');
    templateResults.push({
      id: template.id,
      ms: Date.now() - started,
      ok: Boolean(result?.ok),
      duration: result?.duration ?? null,
      width: result?.width ?? null,
      height: result?.height ?? null,
      line: state?.lastError?.line ?? null,
      error: result?.ok ? null : state?.lastError?.message ?? 'unknown',
    });
    console.log(`[template] ${template.id}: ${result?.ok ? 'OK' : 'FAIL'} ${Date.now() - started}ms`);
  } catch (error) {
    templateResults.push({ id: template.id, ok: false, error: String(error) });
    console.log(`[template] ${template.id}: THROW ${error}`);
  }
}

// A second language switch back to PlantUML and a Graphviz-backed class diagram.
await evaluate(`window.__umlLive.setTheme('dark')`, true);
await evaluate(`window.__umlLive.loadTemplate('puml-class')`, true);
await sleep(300);
await screenshot('02-dark-plantuml-class.png');

// Invalid syntax should surface a friendly error and keep exports disabled.
await evaluate(
  `window.__umlLive.setCode('mermaid', 'flowchart LR\\n  A --> ')`,
  true,
);
await sleep(300);
const errorState = await evaluate('window.__umlLive.getState()');
const errorButtons = await evaluate(`({
  svg: document.getElementById('exportSvgBtn').disabled,
  png: document.getElementById('exportPngBtn').disabled,
  copy: document.getElementById('copyImageBtn').disabled,
  placeholder: document.getElementById('previewPlaceholder').hidden
})`);
console.log('[error-state]', JSON.stringify(errorState, null, 2));
console.log('[error-buttons]', JSON.stringify(errorButtons));
await screenshot('03-mermaid-error.png');

// CJK content: PlantUML computes labels with its own font metrics, so keep an
// eye on this scenario across engine updates.
const chineseCode = `@startuml
title 中文渲染测试
actor "用户" as User
participant "订单服务" as Order
database "数据库" as DB
User -> Order : 提交订单
Order -> DB : 保存记录
DB --> Order : 成功
Order --> User : 返回订单号
note right of Order
  中文注释第一行
  中文注释第二行
end note
@enduml`;
const chineseResult = await evaluate(
  `window.__umlLive.setCode('plantuml', ${JSON.stringify(chineseCode)})`,
  true,
);
console.log('[cjk-plantuml]', JSON.stringify(chineseResult));
await sleep(300);
await screenshot('03b-plantuml-chinese.png');

const pumlError = await evaluate(
  `window.__umlLive.setCode('plantuml', '@startuml\\nqqq zzz foo bar\\n@enduml')`,
  true,
);
const pumlErrorState = await evaluate('window.__umlLive.getState()');
console.log('[puml-error-result]', JSON.stringify(pumlError));
console.log('[puml-error-state]', JSON.stringify(pumlErrorState.lastError));
await sleep(250);
await screenshot('03c-plantuml-error.png');

const themedPuml = `@startuml
!theme vibrant
title Themed diagram
class ThemeProbe {
  +String id
  +render() : void
}
note right of ThemeProbe : !theme loads themes.js
@enduml`;
const themedResult = await evaluate(
  `window.__umlLive.setCode('plantuml', ${JSON.stringify(themedPuml)})`,
  true,
);
console.log('[puml-theme]', JSON.stringify(themedResult));
await sleep(350);
await screenshot('03d-plantuml-theme.png');

// Mermaid template (now top-down), dark.
await evaluate(`window.__umlLive.loadTemplate('mmd-flowchart')`, true);
await sleep(400);
await screenshot('04-dark-mermaid.png');

// Light theme, Mermaid sequence.
await evaluate(`window.__umlLive.loadTemplate('mmd-sequence')`, true);
await evaluate(`window.__umlLive.setTheme('light')`, true);
await sleep(400);
await screenshot('05-light-mermaid.png');

// PlantUML light.
await evaluate(`window.__umlLive.loadTemplate('puml-component')`, true);
await sleep(400);
await screenshot('06-light-plantuml.png');

// Empty state.
await evaluate(`window.__umlLive.setCode('plantuml', '')`, true);
await sleep(300);
await screenshot('07-empty.png');

// Menus and modals.
await evaluate(`window.__umlLive.setTheme('dark')`, true);
await evaluate(`window.__umlLive.loadTemplate('puml-sequence')`, true);
await evaluate(`document.getElementById('templatesBtn').click()`);
await sleep(300);
await screenshot('08-templates-menu.png');
await evaluate(`document.getElementById('templatesBtn').click()`);
await evaluate(`document.getElementById('exportOptionsBtn').click()`);
await sleep(250);
await screenshot('09-export-menu.png');
await evaluate(`document.getElementById('exportOptionsBtn').click()`);
await evaluate(`document.getElementById('fileMenuBtn').click()`);
await sleep(250);
await screenshot('10-file-menu.png');
await evaluate(
  `[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('键盘快捷键'))?.click()`,
);
await sleep(300);
await screenshot('11-shortcuts.png');
await evaluate(`document.getElementById('modalCloseBtn').click()`);
await evaluate(`document.getElementById('fileMenuBtn').click()`);
await evaluate(
  `[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('关于 UML Live'))?.click()`,
);
await sleep(300);
await screenshot('12-about.png');
await evaluate(`document.getElementById('modalCloseBtn').click()`);

// Back to dark PlantUML for export verification.
await evaluate(`window.__umlLive.setTheme('dark')`, true);
await evaluate(`window.__umlLive.loadTemplate('puml-sequence')`, true);
await sleep(300);

const svgPath = path.join(outDir, 'export-test.svg');
const pngPath = path.join(outDir, 'export-test.png');
const svgResult = await evaluate(
  `window.__umlLive.exportSvg(${JSON.stringify(svgPath)})`,
  true,
);
const pngResult = await evaluate(
  `window.__umlLive.exportPng(${JSON.stringify(pngPath)}, { scale: 2, transparent: false })`,
  true,
);
const copyResult = await evaluate('window.__umlLive.copyImage({ scale: 2 })', true);
await sleep(150);
await screenshot('13-toast.png');
console.log('[export-svg]', JSON.stringify(svgResult));
console.log('[export-png]', JSON.stringify(pngResult));
console.log('[copy-image]', JSON.stringify(copyResult));
console.log('[export files]', await stat(svgPath).catch(() => null), await stat(pngPath).catch(() => null));

const svgText = await readFile(svgPath, 'utf8').catch(() => '');
console.log('[svg head]', svgText.slice(0, 260).replace(/\n/g, '\\n'));

if (process.env.UML_CAPTURE_NARROW === '1') {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1024,
    height: 700,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(700);
  await screenshot('14-narrow.png');
  await send('Emulation.clearDeviceMetricsOverride');
}

const finalState = await evaluate('window.__umlLive.getState()');
console.log('[final-state]', JSON.stringify(finalState, null, 2));

console.log('\n[console events]');
for (const line of consoleLines) console.log(line);
console.log('\n[electron log]');
console.log(electronLog.slice(-6000));

await writeFile(
  path.join(outDir, 'smoke-report.json'),
  JSON.stringify(
    {
      initialState,
      previewOnlyState,
      previewRestoredState,
      previewOnlyByF11,
      previewRestoredByEsc,
      viewControls,
      templateResults,
      errorState,
      errorButtons,
      chineseResult,
      pumlErrorState,
      themedResult,
      svgResult,
      pngResult,
      copyResult,
      finalState,
      consoleLines,
      electronLog,
    },
    null,
    2,
  ),
);

send('Browser.close').catch(() => {});
ws.close();
setTimeout(() => {
  if (!child.killed) child.kill();
  process.exit(0);
}, 1500);
