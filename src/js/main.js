import '../styles.css';
import {
  CodeEditor,
  EDITOR_FONT_DEFAULT,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
} from './editor.js';
import { PreviewController } from './preview.js';
import {
  addSvgBackground,
  downloadBlob,
  prepareSvg,
  renderPng,
  withXmlDeclaration,
} from './svg.js';
import { renderPlantUml, preloadPlantUml, plantumlVersion } from './renderers/plantuml.js';
import { renderMermaid, mermaidVersion } from './renderers/mermaid.js';
import {
  defaultTemplate,
  detectLanguageFromContent,
  getTemplate,
  languageFromPath,
  templates,
  templatesFor,
} from './templates.js';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const PLANTUML_VERSION = plantumlVersion();
const MERMAID_VERSION = mermaidVersion();
const STORE_KEY = 'uml-live.state.v2';
const bridge = window.umlDesktop ?? null;
const isMac = false;

const $ = (id) => document.getElementById(id);

const dom = {
  editorHost: $('editor'),
  editorPane: $('editorPane'),
  workspace: $('workspace'),
  splitter: $('splitter'),
  previewPane: $('previewPane'),
  previewViewport: $('previewViewport'),
  diagramLayer: $('diagramLayer'),
  diagramSvg: $('diagramSvg'),
  previewPlaceholder: $('previewPlaceholder'),
  previewLoading: $('previewLoading'),
  previewLoadingText: $('previewLoadingText'),
  previewProgress: $('previewProgress'),
  previewStatus: $('previewStatus'),
  renderStatus: $('renderStatus'),
  renderTime: $('renderTime'),
  diagramSize: $('diagramSize'),
  engineInfo: $('engineInfo'),
  zoomValueBtn: $('zoomValueBtn'),
  zoomInBtn: $('zoomInBtn'),
  zoomOutBtn: $('zoomOutBtn'),
  fitBtn: $('fitBtn'),
  previewOnlyBtn: $('previewOnlyBtn'),
  copyImageBtn: $('copyImageBtn'),
  copyOptionsBtn: $('copyOptionsBtn'),
  exportPngBtn: $('exportPngBtn'),
  exportSvgBtn: $('exportSvgBtn'),
  exportOptionsBtn: $('exportOptionsBtn'),
  renderBtn: $('renderBtn'),
  liveToggle: $('liveToggle'),
  templatesBtn: $('templatesBtn'),
  placeholderTemplatesBtn: $('placeholderTemplatesBtn'),
  languageSwitch: $('languageSwitch'),
  cursorInfo: $('cursorInfo'),
  charInfo: $('charInfo'),
  editorFontBtn: $('editorFontBtn'),
  editorFontSize: $('editorFontSize'),
  saveState: $('saveState'),
  editorLangBadge: $('editorLangBadge'),
  docName: $('docName'),
  docLang: $('docLang'),
  docStatusDot: $('docStatusDot'),
  themeBtn: $('themeBtn'),
  fileMenuBtn: $('fileMenuBtn'),
  shortcutsBtn: $('shortcutsBtn'),
  footerShortcutsBtn: $('footerShortcutsBtn'),
  errorCard: $('errorCard'),
  errorTitle: $('errorTitle'),
  errorLine: $('errorLine'),
  errorMessage: $('errorMessage'),
  errorCloseBtn: $('errorCloseBtn'),
  errorCopyBtn: $('errorCopyBtn'),
  modalBackdrop: $('modalBackdrop'),
  modal: $('modal'),
  modalTitle: $('modalTitle'),
  modalBody: $('modalBody'),
  modalCloseBtn: $('modalCloseBtn'),
  closeDialogBackdrop: $('closeDialogBackdrop'),
  closeDialog: $('closeDialog'),
  closeDialogTray: $('closeDialogTray'),
  closeDialogQuit: $('closeDialogQuit'),
  toastStack: $('toastStack'),
  dropOverlay: $('dropOverlay'),
};

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const stored = readStore();
const defaultPuml = defaultTemplate('plantuml');
const defaultMmd = defaultTemplate('mermaid');

function storedCode(language) {
  const value = stored?.codes?.[language];
  return typeof value === 'string' ? value : null;
}

function storedName(language, fallback) {
  const value = stored?.names?.[language];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function storedTemplateId(language, fallback) {
  const value = stored?.templateIds?.[language];
  return getTemplate(value)?.language === language ? value : fallback;
}

const state = {
  theme: stored.theme === 'light' ? 'light' : 'dark',
  language: stored.language === 'mermaid' ? 'mermaid' : 'plantuml',
  codes: {
    plantuml: storedCode('plantuml') ?? defaultPuml.code,
    mermaid: storedCode('mermaid') ?? defaultMmd.code,
  },
  templateIds: {
    plantuml: storedTemplateId('plantuml', defaultPuml.id),
    mermaid: storedTemplateId('mermaid', defaultMmd.id),
  },
  names: {
    plantuml: storedName('plantuml', defaultPuml.name),
    mermaid: storedName('mermaid', defaultMmd.name),
  },
  live: stored.live !== false,
  split: clamp(Number(stored.split) || 48, 26, 74),
  pngScale: [1, 2, 3].includes(Number(stored.pngScale)) ? Number(stored.pngScale) : 2,
  // White is now the default export background; transparency must be opted into.
  transparent: stored.exportBackground === 'transparent',
  editorFontSize: Number.isFinite(Number(stored.editorFontSize))
    ? clamp(Math.round(Number(stored.editorFontSize) * 10) / 10, EDITOR_FONT_MIN, EDITOR_FONT_MAX)
    : EDITOR_FONT_DEFAULT,
  revision: 0,
  renderToken: 0,
  renderTimer: null,
  progressTimer: null,
  loadingTimer: null,
  isRendering: false,
  currentValid: false,
  exporting: false,
  lastSvg: null,
  lastResult: null,
  lastDims: null,
  lastError: null,
  pendingChanges: false,
  fitNext: true,
  previewOnly: false,
  engineReady: { plantuml: false, mermaid: false },
  info: null,
};

const filePaths = { plantuml: null, mermaid: null };
let editor = null;
let preview = null;
let persistTimer = null;
let openPopover = null;
let popoverAnchor = null;
let removePopoverListeners = null;
let lastFocused = null;
let closeDialogOpen = false;
let closeDialogToken = null;
let closeDialogPreviousFocus = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function basename(filePath) {
  return String(filePath ?? '').split(/[\\/]/).pop() || '';
}

function stripKnownExtension(name) {
  return String(name ?? '').replace(/\.(?:puml|plantuml|pu|uml|mmd|mermaid|txt|svg|png)$/i, '');
}

function sourceExtension(language) {
  return language === 'mermaid' ? 'mmd' : 'puml';
}

function engineLabel(language) {
  return language === 'mermaid' ? 'Mermaid' : 'PlantUML';
}

function engineVersion(language) {
  return language === 'mermaid' ? MERMAID_VERSION : PLANTUML_VERSION;
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

/* -------------------------------------------------------------------------- */
/* Persistence and small UI helpers                                           */
/* -------------------------------------------------------------------------- */

function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        theme: state.theme,
        language: state.language,
        codes: state.codes,
        templateIds: state.templateIds,
        names: state.names,
        live: state.live,
        split: state.split,
        pngScale: state.pngScale,
        exportBackground: state.transparent ? 'transparent' : 'white',
        editorFontSize: state.editorFontSize,
      }),
    );
    setSaveState('saved');
  } catch {
    setSaveState('error');
  }
}

function schedulePersist() {
  setSaveState('saving');
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 350);
}

function setSaveState(kind) {
  if (!dom.saveState) return;
  dom.saveState.classList.toggle('is-saving', kind === 'saving');
  dom.saveState.classList.toggle('is-saved', kind === 'saved');
  const icon = kind === 'saving' ? 'i-loader' : kind === 'error' ? 'i-alert' : 'i-check';
  const label = kind === 'saving' ? '保存中…' : kind === 'error' ? '自动保存不可用' : '已自动保存';
  dom.saveState.innerHTML = `<svg class="icon"><use href="#${icon}"></use></svg>${label}`;
}

function setDocDot(kind) {
  if (!dom.docStatusDot) return;
  dom.docStatusDot.classList.remove('is-idle', 'is-rendering', 'is-paused', 'is-error', 'is-success');
  dom.docStatusDot.classList.add(`is-${kind}`);
}

function setStatus(kind, text, meta = '') {
  dom.previewStatus.classList.remove('is-idle', 'is-rendering', 'is-error', 'is-paused');
  if (kind !== 'ok') dom.previewStatus.classList.add(`is-${kind}`);
  dom.renderStatus.textContent = text;
  dom.renderTime.textContent = meta;
  if (kind === 'ok') {
    setDocDot(state.live ? 'success' : 'paused');
  } else if (kind === 'error') {
    setDocDot('error');
  } else if (kind === 'paused') {
    setDocDot('paused');
  } else if (kind === 'rendering') {
    setDocDot('rendering');
  } else {
    setDocDot('idle');
  }
}

function updateLanguageUi() {
  const language = state.language;
  dom.languageSwitch.querySelectorAll('.seg-btn').forEach((button) => {
    const active = button.dataset.language === language;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const label = engineLabel(language);
  dom.editorLangBadge.textContent = label;
  dom.docLang.textContent = label;
  dom.liveToggle.classList.toggle('is-on', state.live);
  dom.liveToggle.setAttribute('aria-checked', String(state.live));
  dom.liveToggle.title = state.live ? '关闭实时渲染' : '开启实时渲染';
  updatePngLabels();
}

function updateDocName() {
  const path = filePaths[state.language];
  const name = path ? basename(path) : state.names[state.language] || '未命名图表';
  dom.docName.textContent = name;
  dom.docName.title = path || name;
  document.title = `${name} — UML Live`;
}

function updateCursorInfo(info) {
  if (!info) return;
  dom.cursorInfo.textContent = `行 ${info.line}, 列 ${info.column}`;
  dom.charInfo.textContent = `${formatNumber(info.length)} 字符`;
}

function updateEditorFontUi() {
  const size = state.editorFontSize.toFixed(1);
  dom.editorFontSize.textContent = size;
  dom.editorFontBtn.title = `代码字体 ${size} px · Ctrl+滚轮调整，点击重置`;
  dom.editorFontBtn.setAttribute('aria-label', `代码字体 ${size} 像素，点击重置`);
}

function updateRenderButton() {
  dom.renderBtn.classList.toggle('has-changes', state.pendingChanges && !state.isRendering);
  dom.renderBtn.setAttribute('aria-busy', String(state.isRendering));
}

function updateActions() {
  const canExport = state.currentValid && !state.exporting;
  dom.copyImageBtn.disabled = !canExport;
  dom.copyOptionsBtn.disabled = !canExport;
  dom.exportPngBtn.disabled = !canExport;
  dom.exportSvgBtn.disabled = !canExport;
  dom.exportOptionsBtn.disabled = !canExport;
  const hasDiagram = Boolean(preview?.hasDiagram);
  dom.zoomInBtn.disabled = !hasDiagram;
  dom.zoomOutBtn.disabled = !hasDiagram;
  dom.zoomValueBtn.disabled = !hasDiagram;
  dom.fitBtn.disabled = !hasDiagram;
  updatePngLabels();
}

function updatePngLabels() {
  const suffix = `${state.pngScale}× · ${state.transparent ? '透明背景' : '纯白背景'}`;
  dom.exportPngBtn.title = `导出 PNG (${suffix}) · Ctrl+Shift+P`;
  dom.exportOptionsBtn.title = `导出设置（PNG / SVG / 复制图片） · ${state.transparent ? '透明背景' : '纯白背景'}`;
  dom.copyImageBtn.title = `复制 PNG 图片 (${suffix}) · Ctrl+Shift+C`;
  dom.copyOptionsBtn.title = '复制选项：PNG 图片 / SVG 源码';
}

function toast(message, type = 'success', duration = 2800) {
  const icon = type === 'error' ? 'i-alert' : type === 'info' ? 'i-info' : 'i-check';
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `<svg class="icon"><use href="#${icon}"></use></svg><span></span>`;
  element.querySelector('span').textContent = message;
  dom.toastStack.appendChild(element);
  while (dom.toastStack.children.length > 3) dom.toastStack.firstElementChild.remove();
  setTimeout(() => {
    element.classList.add('is-leaving');
    setTimeout(() => element.remove(), 200);
  }, duration);
}

async function copyText(text) {
  try {
    if (bridge) {
      const result = await bridge.copyText(String(text));
      if (result?.ok) return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hideErrorCard() {
  dom.errorCard.hidden = true;
  state.lastError = null;
  preview?.showError(false);
}

function showErrorCard(error) {
  state.lastError = error;
  const engine = error.engine || engineLabel(state.language);
  const title =
    error.kind === 'syntax'
      ? `${engine} 语法错误`
      : error.kind === 'engine'
        ? `${engine} 引擎错误`
        : `${engine} 渲染失败`;
  dom.errorTitle.textContent = title;
  if (Number.isFinite(error.line) && error.line > 0) {
    dom.errorLine.hidden = false;
    dom.errorLine.textContent = `第 ${error.line} 行`;
  } else {
    dom.errorLine.hidden = true;
    dom.errorLine.textContent = '';
  }
  const parts = [];
  if (error.message) parts.push(error.message);
  if (error.details && error.details !== error.message) parts.push(error.details);
  dom.errorMessage.textContent = parts.join('\n\n') || '未知错误';
  dom.errorCard.hidden = false;
  preview?.showError(true);
}

/* -------------------------------------------------------------------------- */
/* Theme and split                                                            */
/* -------------------------------------------------------------------------- */

function applyTheme(theme, options = {}) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  dom.themeBtn.title = state.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
  editor?.setTheme(state.theme === 'dark');
  if (bridge?.setTheme) bridge.setTheme(state.theme).catch(() => {});
  if (options.rerender && state.codes[state.language].trim()) {
    state.revision += 1;
    state.currentValid = false;
    updateActions();
    void renderNow({ force: true });
  }
}

function toggleTheme() {
  closePopover();
  applyTheme(state.theme === 'dark' ? 'light' : 'dark', { rerender: true });
  persistNow();
}

function setPreviewOnly(active) {
  const next = Boolean(active);
  if (next === state.previewOnly) return;
  state.previewOnly = next;
  document.body.classList.toggle('is-preview-only', next);
  dom.previewOnlyBtn.setAttribute('aria-pressed', String(next));
  dom.previewOnlyBtn.title = next ? '退出全屏预览 (F11)' : '全屏预览 (F11)';
  dom.previewOnlyBtn.setAttribute('aria-label', next ? '退出全屏预览' : '全屏预览');

  if (next) {
    closePopover();
    dom.previewOnlyBtn.focus({ preventScroll: true });
  } else {
    // Returning to the editor is the natural next step after leaving focus mode.
    editor?.focus();
  }
}

function togglePreviewOnly() {
  setPreviewOnly(!state.previewOnly);
}

function applySplit(percent) {
  state.split = clamp(percent, 26, 74);
  dom.editorPane.style.width = `${state.split}%`;
}

function setupSplitter() {
  let dragging = false;
  let pointerId = null;

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    pointerId = null;
    document.body.classList.remove('is-resizing');
    persistNow();
  };

  dom.splitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    dom.splitter.setPointerCapture(event.pointerId);
    document.body.classList.add('is-resizing');
    event.preventDefault();
  });

  dom.splitter.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const rect = dom.workspace.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    applySplit(percent);
  });

  dom.splitter.addEventListener('pointerup', finish);
  dom.splitter.addEventListener('pointercancel', finish);

  dom.splitter.addEventListener('dblclick', () => {
    applySplit(48);
    persistNow();
  });

  dom.splitter.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      applySplit(state.split + (event.key === 'ArrowLeft' ? -2 : 2));
      persistNow();
    } else if (event.key === 'Home') {
      event.preventDefault();
      applySplit(48);
      persistNow();
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function clearRenderIndicators() {
  clearTimeout(state.progressTimer);
  clearTimeout(state.loadingTimer);
  state.progressTimer = null;
  state.loadingTimer = null;
  dom.previewProgress.hidden = true;
  dom.previewLoading.hidden = true;
}

function invalidateInFlight() {
  state.renderToken += 1;
  state.isRendering = false;
  dom.renderBtn.classList.remove('is-rendering');
  clearRenderIndicators();
  updateRenderButton();
}

function resetPreviewForLanguage(language) {
  state.currentValid = false;
  state.lastSvg = null;
  state.lastResult = null;
  state.lastDims = null;
  preview?.clear();
  preview?.showError(false);
  dom.previewPlaceholder.hidden = true;
  dom.diagramSize.textContent = '— × —';
  dom.renderTime.textContent = '';
  dom.engineInfo.textContent = `${engineLabel(language)} · 本地 JS 引擎`;
  updateActions();
}

function showEmptyState() {
  invalidateInFlight();
  clearTimeout(state.renderTimer);
  state.renderTimer = null;
  state.currentValid = false;
  state.lastSvg = null;
  state.lastResult = null;
  state.lastDims = null;
  state.pendingChanges = false;
  state.fitNext = true;
  preview?.clear();
  hideErrorCard();
  dom.previewPlaceholder.hidden = false;
  dom.diagramSize.textContent = '— × —';
  dom.renderTime.textContent = '';
  dom.engineInfo.textContent = `${engineLabel(state.language)} · 本地 JS 引擎`;
  setStatus('idle', '等待输入');
  updateActions();
  updateRenderButton();
}

function scheduleRender() {
  if (!state.live) {
    state.pendingChanges = true;
    setStatus('paused', '已暂停', '按 Ctrl+Enter 渲染');
    updateRenderButton();
    return;
  }
  setStatus('idle', '等待渲染');
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(() => {
    state.renderTimer = null;
    void renderNow();
  }, 360);
}

async function renderNow(options = {}) {
  const force = options.force === true;
  clearTimeout(state.renderTimer);
  state.renderTimer = null;

  const code = state.codes[state.language];
  if (!code.trim()) {
    showEmptyState();
    return { ok: false, empty: true };
  }
  if (!state.live && !force) {
    state.pendingChanges = true;
    setStatus('paused', '已暂停', '按 Ctrl+Enter 渲染');
    updateRenderButton();
    return { ok: false, paused: true };
  }

  const language = state.language;
  const dark = state.theme === 'dark';
  const revision = state.revision;
  const token = ++state.renderToken;
  const firstAttempt = !state.engineReady[language];
  const started = performance.now();

  state.isRendering = true;
  state.pendingChanges = false;
  state.currentValid = false;
  state.lastError = null;
  dom.previewPlaceholder.hidden = true;
  dom.renderBtn.classList.add('is-rendering');
  dom.renderBtn.classList.remove('has-changes');
  updateActions();
  setStatus('rendering', firstAttempt ? `正在启动 ${engineLabel(language)}` : '正在渲染');
  clearRenderIndicators();

  state.progressTimer = setTimeout(() => {
    if (token === state.renderToken) dom.previewProgress.hidden = false;
  }, 120);

  if (firstAttempt) {
    dom.previewLoadingText.textContent = `正在加载 ${engineLabel(language)} 引擎…`;
    state.loadingTimer = setTimeout(() => {
      if (token === state.renderToken && state.isRendering) dom.previewLoading.hidden = false;
    }, 260);
  }

  try {
    const result =
      language === 'mermaid'
        ? await renderMermaid(code, { dark })
        : await renderPlantUml(code, { dark });

    if (token !== state.renderToken || revision !== state.revision) {
      return { ok: false, stale: true };
    }

    state.engineReady[language] = true;
    state.lastSvg = result.svg;
    state.lastResult = result;
    state.currentValid = true;
    state.lastError = null;

    const dimensions = preview.setDiagram(result.svg, { fit: state.fitNext });
    state.fitNext = false;
    state.lastDims = { width: dimensions.width, height: dimensions.height };
    state.pendingChanges = false;

    dom.diagramSize.textContent = `${Math.round(dimensions.width)} × ${Math.round(dimensions.height)} px`;
    dom.engineInfo.textContent = `${result.engine} ${result.version} · 本地 JS 引擎`;
    const elapsed = result.duration ?? Math.round(performance.now() - started);
    setStatus('ok', state.live ? '实时预览' : '已暂停实时渲染', `${elapsed} ms`);
    hideErrorCard();
    updateActions();
    updateRenderButton();
    return { ok: true, duration: elapsed, ...dimensions };
  } catch (error) {
    if (token !== state.renderToken || revision !== state.revision) {
      return { ok: false, stale: true, error };
    }
    state.currentValid = false;
    state.pendingChanges = false;
    state.lastDims = null;
    if (error?.kind !== 'engine') state.engineReady[language] = true;
    showErrorCard(error);
    dom.diagramSize.textContent = '— × —';
    dom.renderTime.textContent = '';
    dom.engineInfo.textContent = `${engineLabel(language)} ${engineVersion(language)} · 本地 JS 引擎`;
    setStatus('error', '渲染失败');
    updateActions();
    updateRenderButton();
    return { ok: false, error };
  } finally {
    if (token === state.renderToken) {
      state.isRendering = false;
      dom.renderBtn.classList.remove('is-rendering');
      clearRenderIndicators();
      updateRenderButton();
    }
  }
}

function onCodeChange(value) {
  state.codes[state.language] = value;
  state.revision += 1;
  state.currentValid = false;
  updateActions();

  if (!value.trim()) {
    state.pendingChanges = false;
    showEmptyState();
    schedulePersist();
    return;
  }

  state.pendingChanges = true;
  schedulePersist();
  scheduleRender();
}

/* -------------------------------------------------------------------------- */
/* Language and source switching                                              */
/* -------------------------------------------------------------------------- */

function activateSource({
  language,
  code,
  name,
  filePath = null,
  templateId = null,
  render = true,
  quiet = false,
}) {
  const sameLanguage = state.language === language;
  state.codes[language] = code;
  state.names[language] = name;
  state.templateIds[language] = templateId;
  filePaths[language] = filePath;
  state.language = language;
  state.revision += 1;
  state.currentValid = false;
  state.fitNext = true;
  state.pendingChanges = false;

  if (!sameLanguage || !editor) {
    editor?.setDocument(code, language, state.theme === 'dark');
  } else {
    editor?.setValue(code);
  }

  hideErrorCard();
  if (!sameLanguage) resetPreviewForLanguage(language);
  updateLanguageUi();
  updateDocName();
  updateActions();
  updateRenderButton();
  persistNow();

  if (!code.trim()) {
    showEmptyState();
    if (!quiet) toast(language === 'mermaid' ? '已切换到 Mermaid' : '已切换到 PlantUML', 'info', 1600);
    return null;
  }

  if (render) {
    return renderNow({ force: true });
  }
  setStatus('paused', '已暂停', '按 Ctrl+Enter 渲染');
  return null;
}

function switchLanguage(language) {
  if (language === state.language) return;
  closePopover();
  const code = state.codes[language];
  state.language = language;
  state.revision += 1;
  state.fitNext = true;
  state.pendingChanges = true;
  editor?.setDocument(code, language, state.theme === 'dark');
  hideErrorCard();
  resetPreviewForLanguage(language);
  updateLanguageUi();
  updateDocName();
  persistNow();

  if (!code.trim()) {
    showEmptyState();
    return;
  }
  void renderNow({ force: true });
}

function newDiagram() {
  closePopover();
  const language = state.language;
  activateSource({
    language,
    code: '',
    name: '未命名图表',
    filePath: null,
    templateId: null,
    render: false,
  });
  editor?.focus();
}

function loadTemplate(template) {
  if (!template) return Promise.resolve(null);
  closePopover();
  return activateSource({
    language: template.language,
    code: template.code,
    name: template.name,
    filePath: null,
    templateId: template.id,
    render: true,
    quiet: true,
  });
}

function onLiveToggle() {
  state.live = !state.live;
  dom.liveToggle.classList.toggle('is-on', state.live);
  dom.liveToggle.setAttribute('aria-checked', String(state.live));
  dom.liveToggle.title = state.live ? '关闭实时渲染' : '开启实时渲染';
  persistNow();
  if (state.live) {
    if (state.codes[state.language].trim()) void renderNow({ force: true });
  } else {
    clearTimeout(state.renderTimer);
    state.renderTimer = null;
    state.pendingChanges = Boolean(state.codes[state.language].trim());
    if (!state.isRendering) {
      setStatus('paused', '已暂停', '按 Ctrl+Enter 渲染');
      updateRenderButton();
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Source files                                                               */
/* -------------------------------------------------------------------------- */

function suggestBaseName() {
  const path = filePaths[state.language];
  const raw = path ? basename(path) : state.names[state.language];
  const base = stripKnownExtension(raw || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .trim()
    .slice(0, 80);
  return base || (state.language === 'mermaid' ? 'mermaid-diagram' : 'plantuml-diagram');
}

function suggestFileName(extension) {
  return `${suggestBaseName()}.${extension}`;
}

async function openFile() {
  closePopover();
  if (!bridge) {
    toast('打开文件仅在桌面应用中可用。', 'error');
    return;
  }
  try {
    const result = await bridge.openFile();
    if (!result || result.canceled) return;
    const path = result.filePath;
    const content = String(result.content ?? '');
    const language =
      languageFromPath(path) || detectLanguageFromContent(content) || state.language;
    activateSource({
      language,
      code: content,
      name: basename(path),
      filePath: path,
      templateId: null,
      render: true,
      quiet: true,
    });
    toast(`已打开 ${basename(path)}`, 'success');
  } catch (error) {
    toast(`打开失败：${error?.message ?? error}`, 'error', 4200);
  }
}

async function saveSource({ saveAs = false } = {}) {
  closePopover();
  const language = state.language;
  const code = state.codes[language];
  const existingPath = saveAs ? null : filePaths[language];
  const filters =
    language === 'mermaid'
      ? [{ name: 'Mermaid source', extensions: ['mmd', 'mermaid'] }]
      : [{ name: 'PlantUML source', extensions: ['puml', 'plantuml', 'pu', 'uml'] }];

  try {
    if (!bridge) {
      const name = suggestFileName(sourceExtension(language));
      downloadBlob(new Blob([code], { type: 'text/plain;charset=utf-8' }), name);
      toast(`已下载 ${name}`);
      return;
    }
    const result = await bridge.saveFile({
      filePath: existingPath ?? undefined,
      defaultName: suggestFileName(sourceExtension(language)),
      filters,
      data: code,
      encoding: 'utf8',
    });
    if (!result || result.canceled) return;
    filePaths[language] = result.filePath;
    state.names[language] = basename(result.filePath);
    state.templateIds[language] = null;
    updateDocName();
    persistNow();
    toast(`源码已保存 · ${basename(result.filePath)}`);
  } catch (error) {
    toast(`保存失败：${error?.message ?? error}`, 'error', 4200);
  }
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

function exportBackground(options = {}) {
  const transparent = options.transparent ?? state.transparent;
  return transparent ? 'transparent' : '#ffffff';
}

/**
 * White-background exports use the light diagram palette so they remain
 * readable when inserted into documents. Transparent exports keep the palette
 * that is currently visible in the preview.
 */
async function getExportSvg({ transparent = state.transparent } = {}) {
  if (transparent || state.theme !== 'dark' || !state.lastSvg) {
    return state.lastSvg;
  }
  const language = state.language;
  const code = state.codes[language];
  const result =
    language === 'mermaid'
      ? await renderMermaid(code, { dark: false })
      : await renderPlantUml(code, { dark: false });
  return result.svg;
}

async function exportSvg(options = {}) {
  if (!state.currentValid || !state.lastSvg) {
    if (!options.quiet) toast('当前没有可导出的图表。', 'error');
    return { ok: false, reason: 'empty' };
  }
  try {
    const background = exportBackground();
    const svg = await getExportSvg();
    const prepared = prepareSvg(svg);
    const markup = withXmlDeclaration(
      background === 'transparent' ? prepared.markup : addSvgBackground(prepared.markup, background),
    );
    const defaultName = suggestFileName('svg');
    document.body.classList.add('is-exporting');
    if (bridge) {
      const result = await bridge.saveFile({
        filePath: options.filePath,
        defaultName,
        filters: [{ name: 'SVG image', extensions: ['svg'] }],
        data: markup,
        encoding: 'utf8',
      });
      if (!result || result.canceled) return { ok: false, canceled: true };
      if (!options.quiet) toast(`已导出 SVG · ${basename(result.filePath)}`);
      return { ok: true, filePath: result.filePath, width: prepared.width, height: prepared.height };
    }
    downloadBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), defaultName);
    if (!options.quiet) toast(`已导出 ${defaultName}`);
    return { ok: true, filePath: null, width: prepared.width, height: prepared.height };
  } catch (error) {
    if (!options.quiet) toast(`SVG 导出失败：${error?.message ?? error}`, 'error', 4500);
    return { ok: false, error: String(error?.message ?? error) };
  } finally {
    document.body.classList.remove('is-exporting');
  }
}

async function exportPng(options = {}) {
  if (!state.currentValid || !state.lastSvg) {
    if (!options.quiet) toast('当前没有可导出的图表。', 'error');
    return { ok: false, reason: 'empty' };
  }
  try {
    document.body.classList.add('is-exporting');
    const scale = options.scale ?? state.pngScale;
    const transparent = options.transparent ?? state.transparent;
    const svg = await getExportSvg({ transparent });
    const render = await renderPng(svg, {
      scale,
      background: exportBackground({ transparent }),
    });
    if (render.scale + 0.01 < scale && !options.quiet) {
      toast('图表尺寸过大，已自动降低 PNG 分辨率。', 'info', 3200);
    }
    const defaultName = suggestFileName('png');
    if (bridge) {
      const result = await bridge.saveFile({
        filePath: options.filePath,
        defaultName,
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: render.bytes,
      });
      if (!result || result.canceled) return { ok: false, canceled: true };
      if (!options.quiet) {
        toast(`已导出 PNG ${render.width} × ${render.height} · ${basename(result.filePath)}`);
      }
      return {
        ok: true,
        filePath: result.filePath,
        width: render.width,
        height: render.height,
        scale: render.scale,
      };
    }
    downloadBlob(render.blob, defaultName);
    if (!options.quiet) toast(`已导出 ${defaultName}`);
    return { ok: true, filePath: null, width: render.width, height: render.height };
  } catch (error) {
    if (!options.quiet) toast(`PNG 导出失败：${error?.message ?? error}`, 'error', 4500);
    return { ok: false, error: String(error?.message ?? error) };
  } finally {
    document.body.classList.remove('is-exporting');
  }
}

async function copyImage(options = {}) {
  if (!state.currentValid || !state.lastSvg) {
    if (!options.quiet) toast('当前没有可复制的图表。', 'error');
    return { ok: false, reason: 'empty' };
  }
  try {
    document.body.classList.add('is-exporting');
    const scale = options.scale ?? state.pngScale;
    const transparent = options.transparent ?? state.transparent;
    const svg = await getExportSvg({ transparent });
    const render = await renderPng(svg, {
      scale,
      background: exportBackground({ transparent }),
    });
    if (bridge) {
      const result = await bridge.copyImage(render.bytes);
      if (!result?.ok) throw new Error(result?.error || '剪贴板写入失败');
      if (!options.quiet) toast(`图片已复制 · ${result.width} × ${result.height}px`);
      return { ok: true, width: result.width, height: result.height };
    }
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': render.blob })]);
      if (!options.quiet) toast(`图片已复制 · ${render.width} × ${render.height}px`);
      return { ok: true, width: render.width, height: render.height };
    }
    throw new Error('当前环境不支持图片剪贴板');
  } catch (error) {
    if (!options.quiet) toast(`复制图片失败：${error?.message ?? error}`, 'error', 4200);
    return { ok: false, error: String(error?.message ?? error) };
  } finally {
    document.body.classList.remove('is-exporting');
  }
}

async function copySvgSource(options = {}) {
  if (!state.currentValid || !state.lastSvg) {
    if (!options.quiet) toast('当前没有可复制的图表。', 'error');
    return { ok: false, reason: 'empty' };
  }
  try {
    document.body.classList.add('is-exporting');
    const background = exportBackground();
    const svg = await getExportSvg();
    const prepared = prepareSvg(svg);
    const markup = withXmlDeclaration(
      background === 'transparent' ? prepared.markup : addSvgBackground(prepared.markup, background),
    );
    if (!(await copyText(markup))) throw new Error('剪贴板写入失败');
    if (!options.quiet) {
      toast(`已复制 SVG 矢量源码 · ${prepared.width} × ${prepared.height}px`);
    }
    return { ok: true, width: prepared.width, height: prepared.height };
  } catch (error) {
    if (!options.quiet) toast(`复制 SVG 源码失败：${error?.message ?? error}`, 'error', 4200);
    return { ok: false, error: String(error?.message ?? error) };
  } finally {
    document.body.classList.remove('is-exporting');
  }
}

async function runExportAction(button, action) {
  if (state.exporting) return;
  state.exporting = true;
  updateActions();
  try {
    await action();
  } finally {
    state.exporting = false;
    updateActions();
  }
  void button;
}

/* -------------------------------------------------------------------------- */
/* Popovers                                                                   */
/* -------------------------------------------------------------------------- */

function closePopover() {
  if (openPopover) openPopover.remove();
  openPopover = null;
  popoverAnchor = null;
  if (removePopoverListeners) removePopoverListeners();
  removePopoverListeners = null;
}

function positionPopover(menu, anchor) {
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const gap = 8;
  const padding = 10;
  let left = rect.right - menuRect.width;
  left = clamp(left, padding, window.innerWidth - menuRect.width - padding);
  let top = rect.bottom + gap;
  if (top + menuRect.height > window.innerHeight - padding) {
    top = Math.max(padding, rect.top - menuRect.height - gap);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function showPopover(menu, anchor) {
  closePopover();
  openPopover = menu;
  popoverAnchor = anchor;
  positionPopover(menu, anchor);
  const onPointerDown = (event) => {
    if (menu.contains(event.target) || anchor.contains(event.target)) return;
    closePopover();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePopover();
      anchor.focus?.();
    }
  };
  const onBlur = () => closePopover();
  const onResize = () => closePopover();
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  removePopoverListeners = () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
  };
}

function createMenu(className = '') {
  const menu = document.createElement('div');
  menu.className = `popover ${className}`.trim();
  menu.setAttribute('role', 'menu');
  return menu;
}

function openTemplatesMenu(anchor) {
  if (openPopover && popoverAnchor === anchor) {
    closePopover();
    return;
  }
  const menu = createMenu('templates-popover');
  const head = document.createElement('div');
  head.className = 'templates-head';
  head.innerHTML = `<strong>从模板开始</strong><span>保留当前语言的内容，随时可以切换回来</span>`;
  menu.appendChild(head);

  const columns = document.createElement('div');
  columns.className = 'templates-columns';
  for (const language of ['plantuml', 'mermaid']) {
    const group = document.createElement('div');
    group.className = 'template-group';
    const heading = document.createElement('div');
    heading.className = 'template-group-head';
    heading.innerHTML = `<span class="lang-dot ${language}"></span>${engineLabel(language)}`;
    group.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'template-list';
    for (const template of templatesFor(language)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'template-item';
      if (state.language === language && state.templateIds[language] === template.id) {
        item.classList.add('is-current');
      }
      const name = document.createElement('strong');
      name.textContent = template.name;
      const description = document.createElement('span');
      description.textContent = template.description;
      item.append(name, description);
      item.addEventListener('click', () => loadTemplate(template));
      list.appendChild(item);
    }
    group.appendChild(list);
    columns.appendChild(group);
  }
  menu.appendChild(columns);
  showPopover(menu, anchor);
}

function addMenuItem(menu, { icon, label, shortcut, danger = false, onClick }) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `menu-item${danger ? ' is-danger' : ''}`;
  item.setAttribute('role', 'menuitem');
  item.innerHTML = icon
    ? `<svg class="icon"><use href="#${icon}"></use></svg><span></span>`
    : `<span></span>`;
  item.querySelector('span').textContent = label;
  if (shortcut) {
    const hint = document.createElement('span');
    hint.className = 'menu-shortcut';
    hint.textContent = shortcut;
    item.appendChild(hint);
  }
  item.addEventListener('click', () => {
    closePopover();
    void onClick();
  });
  menu.appendChild(item);
  return item;
}

function openFileMenu(anchor) {
  if (openPopover && popoverAnchor === anchor) {
    closePopover();
    return;
  }
  const menu = createMenu();
  const heading = document.createElement('div');
  heading.className = 'menu-heading';
  heading.textContent = '文件';
  menu.appendChild(heading);
  addMenuItem(menu, { icon: 'i-sparkles', label: '新建空白图表', shortcut: 'Ctrl N', onClick: newDiagram });
  addMenuItem(menu, { icon: 'i-folder', label: '打开源码…', shortcut: 'Ctrl O', onClick: openFile });
  addMenuItem(menu, { icon: 'i-save', label: '保存源码', shortcut: 'Ctrl S', onClick: () => saveSource() });
  addMenuItem(menu, {
    icon: 'i-save',
    label: '源码另存为…',
    shortcut: 'Ctrl Shift S',
    onClick: () => saveSource({ saveAs: true }),
  });
  menu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-separator' }));
  addMenuItem(menu, {
    icon: 'i-copy',
    label: '复制 PNG 图片',
    shortcut: 'Ctrl Shift C',
    onClick: () => runExportAction(dom.copyImageBtn, () => copyImage()),
  });
  addMenuItem(menu, {
    icon: 'i-code',
    label: '复制 SVG 源码（矢量）',
    onClick: () => runExportAction(dom.copyImageBtn, () => copySvgSource()),
  });
  addMenuItem(menu, {
    icon: 'i-download',
    label: '导出 SVG（矢量图）',
    shortcut: 'Ctrl Shift E',
    onClick: () => runExportAction(dom.exportSvgBtn, () => exportSvg()),
  });
  addMenuItem(menu, {
    icon: 'i-download',
    label: '导出 PNG',
    shortcut: 'Ctrl Shift P',
    onClick: () => runExportAction(dom.exportPngBtn, () => exportPng()),
  });
  menu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-separator' }));
  addMenuItem(menu, { icon: 'i-keyboard', label: '键盘快捷键', shortcut: 'Ctrl /', onClick: openShortcutsModal });
  addMenuItem(menu, { icon: 'i-info', label: '关于 UML Live', onClick: openAboutModal });
  showPopover(menu, anchor);
}

function openCopyMenu(anchor) {
  if (openPopover && popoverAnchor === anchor) {
    closePopover();
    return;
  }
  const menu = createMenu();
  menu.style.minWidth = '286px';
  const heading = document.createElement('div');
  heading.className = 'menu-heading';
  heading.textContent = '复制';
  menu.appendChild(heading);

  addMenuItem(menu, {
    icon: 'i-image',
    label: '复制 PNG 图片',
    shortcut: `${state.pngScale}×`,
    onClick: () => runExportAction(dom.copyImageBtn, () => copyImage()),
  });
  addMenuItem(menu, {
    icon: 'i-code',
    label: '复制 SVG 源码（矢量）',
    onClick: () => runExportAction(dom.copyImageBtn, () => copySvgSource()),
  });

  const note = document.createElement('div');
  note.className = 'menu-heading';
  note.style.paddingTop = '7px';
  note.style.textTransform = 'none';
  note.style.letterSpacing = '0';
  note.style.fontWeight = '400';
  note.style.fontSize = '9.5px';
  note.style.lineHeight = '1.5';
  note.textContent = 'SVG 以源码形式复制，可保存为 .svg；系统剪贴板不保留矢量图像格式。';
  menu.appendChild(note);

  showPopover(menu, anchor);
}

function openExportOptionsMenu(anchor) {
  if (openPopover && popoverAnchor === anchor) {
    closePopover();
    return;
  }
  const menu = createMenu();
  menu.style.minWidth = '286px';
  const heading = document.createElement('div');
  heading.className = 'menu-heading';
  heading.textContent = '导出设置';
  menu.appendChild(heading);

  const scope = document.createElement('div');
  scope.className = 'menu-heading';
  scope.style.paddingTop = '0';
  scope.style.textTransform = 'none';
  scope.style.letterSpacing = '0';
  scope.style.fontSize = '10px';
  scope.textContent = '适用于 PNG / SVG / 复制图片';
  menu.appendChild(scope);

  const info = document.createElement('div');
  info.className = 'menu-heading';
  info.style.paddingTop = '3px';
  info.style.textTransform = 'none';
  info.style.letterSpacing = '0';
  info.style.fontSize = '9.5px';
  info.textContent = state.lastDims
    ? `当前画布 ${Math.round(state.lastDims.width)} × ${Math.round(state.lastDims.height)} px`
    : '完成渲染后可选择导出倍率';
  menu.appendChild(info);

  const scaleHeading = document.createElement('div');
  scaleHeading.className = 'menu-heading';
  scaleHeading.style.paddingTop = '7px';
  scaleHeading.textContent = 'PNG / 复制图片分辨率';
  menu.appendChild(scaleHeading);

  const scaleButtons = [];
  for (const scale of [1, 2, 3]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-radio';
    button.setAttribute('role', 'menuitemradio');
    const selected = state.pngScale === scale;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
    const dims = state.lastDims
      ? `${Math.round(state.lastDims.width * scale)} × ${Math.round(state.lastDims.height * scale)}`
      : `${scale}×`;
    button.innerHTML = `<span class="radio-dot"></span><span>${scale}× 分辨率</span><span class="menu-meta">${dims}</span>`;
    button.addEventListener('click', () => {
      state.pngScale = scale;
      scaleButtons.forEach((candidate) => {
        const isSelected = candidate.dataset.scale === String(scale);
        candidate.classList.toggle('is-selected', isSelected);
        candidate.setAttribute('aria-checked', String(isSelected));
      });
      updatePngLabels();
      persistNow();
    });
    button.dataset.scale = String(scale);
    scaleButtons.push(button);
    menu.appendChild(button);
  }

  menu.appendChild(Object.assign(document.createElement('div'), { className: 'menu-separator' }));

  const transparent = document.createElement('button');
  transparent.type = 'button';
  transparent.className = 'menu-radio';
  transparent.setAttribute('role', 'menuitemcheckbox');
  const checked = state.transparent;
  transparent.innerHTML = `<span class="menu-check${checked ? ' is-checked' : ''}"><svg class="icon"><use href="#i-check"></use></svg></span><span>透明背景</span><span class="menu-meta">PNG / SVG / 复制</span>`;
  transparent.setAttribute('aria-checked', String(checked));
  transparent.addEventListener('click', () => {
    state.transparent = !state.transparent;
    const isChecked = state.transparent;
    const check = transparent.querySelector('.menu-check');
    check?.classList.toggle('is-checked', isChecked);
    transparent.setAttribute('aria-checked', String(isChecked));
    updatePngLabels();
    persistNow();
  });
  menu.appendChild(transparent);

  const note = document.createElement('div');
  note.className = 'menu-heading';
  note.style.paddingTop = '7px';
  note.style.textTransform = 'none';
  note.style.letterSpacing = '0';
  note.style.fontWeight = '400';
  note.style.fontSize = '9.5px';
  note.style.lineHeight = '1.5';
  note.textContent =
    '默认导出为纯白背景，深色主题下会自动使用浅色图表配色；透明背景同时作用于 PNG、SVG 和复制图片。';
  menu.appendChild(note);

  showPopover(menu, anchor);
}

/* -------------------------------------------------------------------------- */
/* Modals                                                                     */
/* -------------------------------------------------------------------------- */

function shortcutKeys(labels) {
  return `<span class="shortcut-keys">${labels.map((label) => `<kbd>${label}</kbd>`).join('')}</span>`;
}

function shortcutSection(title, rows) {
  return `<section class="shortcut-section"><h3>${title}</h3>${rows
    .map(
      ([label, keys]) =>
        `<div class="shortcut-row"><span>${label}</span>${shortcutKeys(keys)}</div>`,
    )
    .join('')}</section>`;
}

function openShortcutsModal() {
  closePopover();
  const left = [
    shortcutSection('编辑', [
      ['立即渲染当前图表', ['Ctrl', 'Enter']],
      ['打开源码文件', ['Ctrl', 'O']],
      ['新建空白图表', ['Ctrl', 'N']],
      ['保存源码', ['Ctrl', 'S']],
      ['源码另存为', ['Ctrl', 'Shift', 'S']],
      ['查找 / 替换', ['Ctrl', 'F']],
      ['调整代码字体大小', ['Ctrl', '滚轮']],
    ]),
    shortcutSection('导出', [
      ['导出 SVG', ['Ctrl', 'Shift', 'E']],
      ['导出 PNG', ['Ctrl', 'Shift', 'P']],
      ['复制图片到剪贴板', ['Ctrl', 'Shift', 'C']],
    ]),
  ].join('');
  const right = [
    shortcutSection('视图', [
      ['切换 PlantUML', ['Ctrl', '1']],
      ['切换 Mermaid', ['Ctrl', '2']],
      ['放大预览', ['Ctrl', '+']],
      ['缩小预览', ['Ctrl', '-']],
      ['恢复 100% 并居中', ['Ctrl', '0']],
      ['全屏预览 / 退出', ['F11']],
      ['切换浅色 / 深色主题', ['Ctrl', 'Shift', 'L']],
    ]),
    shortcutSection('帮助', [
      ['显示快捷键', ['Ctrl', '/']],
      ['关闭菜单 / 弹窗', ['Esc']],
    ]),
  ].join('');
  openModal(
    '键盘快捷键',
    `<div class="shortcut-grid"><div class="shortcut-col">${left}</div><div class="shortcut-col">${right}</div></div>`,
  );
}

function openAboutModal() {
  closePopover();
  const info = state.info;
  const rows = [
    ['应用版本', `v${APP_VERSION}`],
    ['Electron', info?.electron ?? '—'],
    ['Chromium', info?.chrome ?? '—'],
    ['PlantUML 引擎', PLANTUML_VERSION],
    ['Mermaid 引擎', MERMAID_VERSION],
    ['许可协议', 'MIT'],
  ];
  const body = `
    <div class="about-hero">
      <img class="about-logo" src="./favicon.svg" alt="" />
      <div>
        <h3>UML Live</h3>
        <p>PlantUML 与 Mermaid 的实时本地预览工具</p>
      </div>
    </div>
    <div class="about-grid">
      ${rows
        .map(
          ([label, value]) =>
            `<div><span class="label">${label}</span><span class="value">${value}</span></div>`,
        )
        .join('')}
    </div>
    <p class="about-note">
      <strong>完全本地渲染。</strong>PlantUML 使用官方的 TeaVM JavaScript 引擎，
      Mermaid 使用纯 JavaScript 渲染器；不依赖 Java、Graphviz 可执行文件或任何渲染服务器。
      图表源码只保存在本机浏览器存储中。
    </p>
    <p class="about-note" style="margin-top:10px">
      了解更多：
      <a href="https://plantuml.com/" data-external class="external-link" style="color:var(--accent);text-decoration:none">plantuml.com</a>
      &nbsp;·&nbsp;
      <a href="https://mermaid.js.org/" data-external class="external-link" style="color:var(--accent);text-decoration:none">mermaid.js.org</a>
    </p>`;
  openModal('关于 UML Live', body);
}

function openModal(title, bodyHtml) {
  closePopover();
  lastFocused = document.activeElement;
  dom.modalTitle.textContent = title;
  dom.modalBody.innerHTML = bodyHtml;
  dom.modalBackdrop.hidden = false;
  dom.modalBody.querySelectorAll('a[data-external]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      bridge?.openExternal(anchor.href).catch(() => {});
    });
  });
  requestAnimationFrame(() => dom.modalCloseBtn.focus());
}

function closeModal() {
  if (dom.modalBackdrop.hidden) return;
  dom.modalBackdrop.hidden = true;
  dom.modalBody.innerHTML = '';
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
  lastFocused = null;
}

function setupModal() {
  dom.modalCloseBtn.addEventListener('click', closeModal);
  dom.modalBackdrop.addEventListener('pointerdown', (event) => {
    if (event.target === dom.modalBackdrop) closeModal();
  });
  dom.modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [
      ...dom.modal.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function showCloseDialog(token) {
  if (closeDialogOpen) return;
  closePopover();
  if (!dom.modalBackdrop.hidden) closeModal();
  closeDialogOpen = true;
  closeDialogToken = token ?? null;
  closeDialogPreviousFocus = document.activeElement;
  dom.closeDialogBackdrop.hidden = false;
  document.body.classList.add('has-close-dialog');
  requestAnimationFrame(() => dom.closeDialogTray.focus({ preventScroll: true }));
}

function hideCloseDialog({ restoreFocus = true } = {}) {
  if (!closeDialogOpen) return;
  closeDialogOpen = false;
  closeDialogToken = null;
  dom.closeDialogBackdrop.hidden = true;
  document.body.classList.remove('has-close-dialog');
  if (restoreFocus && closeDialogPreviousFocus?.isConnected) {
    closeDialogPreviousFocus.focus({ preventScroll: true });
  }
  closeDialogPreviousFocus = null;
}

async function respondCloseDialog(action) {
  if (!closeDialogOpen) return;
  const token = closeDialogToken;
  hideCloseDialog();
  try {
    const result = await bridge?.respondClosePrompt?.(token, action);
    if (result && result.ok === false && !result.stale) {
      toast(result.error || '关闭操作失败。', 'error', 4200);
    }
  } catch (error) {
    toast(`关闭操作失败：${error?.message ?? error}`, 'error', 4200);
  }
}

function setupClosePrompt() {
  bridge?.onCloseRequest?.((token) => showCloseDialog(token));
  bridge?.onCloseRequestCancelled?.(() => hideCloseDialog());
  dom.closeDialogTray.addEventListener('click', () => void respondCloseDialog('tray'));
  dom.closeDialogQuit.addEventListener('click', () => void respondCloseDialog('quit'));
}

/* -------------------------------------------------------------------------- */
/* Keyboard and drag & drop                                                   */
/* -------------------------------------------------------------------------- */

function handleGlobalShortcut(event) {
  // The close confirmation is a real modal: only Tab/Enter/Space/Esc operate
  // while it is open, and Escape chooses the default (minimize to tray).
  if (closeDialogOpen) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void respondCloseDialog('tray');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = [dom.closeDialogQuit, dom.closeDialogTray];
      const currentIndex = buttons.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex === -1 ? 0 : (currentIndex + step + buttons.length) % buttons.length;
      buttons[nextIndex].focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const action = document.activeElement === dom.closeDialogQuit ? 'quit' : 'tray';
      void respondCloseDialog(action);
    } else {
      event.preventDefault();
    }
    event.stopPropagation();
    return;
  }

  // A desktop diagram tool should not lose the current view to a browser reload
  // or print dialog triggered from muscle memory.
  if (event.key === 'F5') {
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape') {
    if (!dom.modalBackdrop.hidden) {
      closeModal();
      event.preventDefault();
      return;
    }
    if (openPopover) {
      closePopover();
      event.preventDefault();
      return;
    }
    if (state.previewOnly) {
      setPreviewOnly(false);
      event.preventDefault();
    }
    return;
  }

  if (!dom.modalBackdrop.hidden) return;

  if (event.key === 'F11') {
    event.preventDefault();
    if (!event.repeat) togglePreviewOnly();
    return;
  }

  const modifier = isMac ? event.metaKey : event.ctrlKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  const shift = event.shiftKey;
  if (key === 'r' || (key === 'p' && !shift)) {
    event.preventDefault();
    return;
  }
  let handled = true;

  if (shift) {
    switch (key) {
      case 's':
        void saveSource({ saveAs: true });
        break;
      case 'e':
        void runExportAction(dom.exportSvgBtn, () => exportSvg());
        break;
      case 'p':
        void runExportAction(dom.exportPngBtn, () => exportPng());
        break;
      case 'c':
        void runExportAction(dom.copyImageBtn, () => copyImage());
        break;
      case 'l':
        toggleTheme();
        break;
      case '/':
        openShortcutsModal();
        break;
      default:
        handled = false;
    }
  } else {
    switch (key) {
      case 'enter':
        void renderNow({ force: true });
        break;
      case 's':
        void saveSource();
        break;
      case 'o':
        void openFile();
        break;
      case 'n':
        newDiagram();
        break;
      case '/':
        openShortcutsModal();
        break;
      case '1':
        switchLanguage('plantuml');
        break;
      case '2':
        switchLanguage('mermaid');
        break;
      case '=':
      case '+':
        preview.zoomBy(1.2);
        break;
      case '-':
        preview.zoomBy(1 / 1.2);
        break;
      case '0':
        preview.centerAt100();
        break;
      default:
        handled = false;
    }
  }

  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function setupDropZone() {
  let dragDepth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');

  window.addEventListener(
    'dragenter',
    (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      dom.dropOverlay.hidden = false;
    },
    true,
  );
  window.addEventListener(
    'dragover',
    (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    true,
  );
  window.addEventListener(
    'dragleave',
    (event) => {
      if (!hasFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dom.dropOverlay.hidden = true;
    },
    true,
  );
  window.addEventListener(
    'drop',
    async (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      dom.dropOverlay.hidden = true;
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast('文件过大，仅支持 5 MB 以内的源码。', 'error');
        return;
      }
      try {
        const content = await file.text();
        const language =
          languageFromPath(file.name) || detectLanguageFromContent(content) || state.language;
        activateSource({
          language,
          code: content,
          name: file.name,
          filePath: null,
          templateId: null,
          render: true,
          quiet: true,
        });
        toast(`已载入 ${file.name}`);
      } catch (error) {
        toast(`读取文件失败：${error?.message ?? error}`, 'error');
      }
    },
    true,
  );
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

function setupUiEvents() {
  dom.languageSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('.seg-btn');
    if (!button) return;
    switchLanguage(button.dataset.language);
  });

  dom.liveToggle.addEventListener('click', onLiveToggle);
  dom.renderBtn.addEventListener('click', () => {
    hideErrorCard();
    void renderNow({ force: true });
  });
  dom.templatesBtn.addEventListener('click', () => openTemplatesMenu(dom.templatesBtn));
  dom.placeholderTemplatesBtn.addEventListener('click', () =>
    openTemplatesMenu(dom.placeholderTemplatesBtn),
  );
  dom.fileMenuBtn.addEventListener('click', () => openFileMenu(dom.fileMenuBtn));
  dom.exportOptionsBtn.addEventListener('click', () => openExportOptionsMenu(dom.exportOptionsBtn));
  dom.copyOptionsBtn.addEventListener('click', () => openCopyMenu(dom.copyOptionsBtn));
  dom.themeBtn.addEventListener('click', toggleTheme);
  dom.shortcutsBtn.addEventListener('click', openShortcutsModal);
  dom.footerShortcutsBtn.addEventListener('click', openShortcutsModal);
  dom.editorFontBtn.addEventListener('click', () => {
    if (editor.setFontSize(EDITOR_FONT_DEFAULT)) {
      toast(`代码字体已重置为 ${EDITOR_FONT_DEFAULT} px`, 'info', 1600);
    }
  });

  dom.exportSvgBtn.addEventListener('click', () => {
    void runExportAction(dom.exportSvgBtn, () => exportSvg());
  });
  dom.exportPngBtn.addEventListener('click', () => {
    void runExportAction(dom.exportPngBtn, () => exportPng());
  });
  dom.copyImageBtn.addEventListener('click', () => {
    void runExportAction(dom.copyImageBtn, () => copyImage());
  });

  dom.zoomInBtn.addEventListener('click', () => preview.zoomBy(1.2));
  dom.zoomOutBtn.addEventListener('click', () => preview.zoomBy(1 / 1.2));
  dom.zoomValueBtn.addEventListener('click', () => preview.centerAt100());
  dom.fitBtn.addEventListener('click', () => preview.centerAt100());
  dom.previewOnlyBtn.addEventListener('click', togglePreviewOnly);

  dom.errorCloseBtn.addEventListener('click', () => {
    dom.errorCard.hidden = true;
  });
  dom.errorCopyBtn.addEventListener('click', async () => {
    if (!state.lastError) return;
    const error = state.lastError;
    const text = [error.message, error.details].filter(Boolean).join('\n\n');
    if (await copyText(text)) toast('错误信息已复制');
    else toast('复制失败', 'error');
  });

  document.addEventListener('keydown', handleGlobalShortcut, true);
  setupModal();
  setupClosePrompt();
  setupDropZone();

  window.addEventListener('beforeunload', persistNow);
  window.addEventListener('resize', () => {
    if (window.innerWidth < 820) closePopover();
  });
  window.addEventListener('error', (event) => {
    console.error(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
  });
}

function setupDebugApi() {
  const enabled = new URLSearchParams(window.location.search).get('debug') === '1';
  if (!enabled) return;
  window.__umlLive = {
    getState: () => ({
      language: state.language,
      theme: state.theme,
      live: state.live,
      isRendering: state.isRendering,
      currentValid: state.currentValid,
      pendingChanges: state.pendingChanges,
      lastError: state.lastError
        ? { message: state.lastError.message, details: state.lastError.details, line: state.lastError.line }
        : null,
      lastDims: state.lastDims,
      zoom: preview.getZoomPercent(),
      editorFontSize: state.editorFontSize,
      engineReady: { ...state.engineReady },
    }),
    setCode: async (language, code) => {
      if (!['plantuml', 'mermaid'].includes(language)) language = state.language;
      if (language !== state.language) {
        state.codes[language] = code;
        state.names[language] = state.names[language] || 'debug';
        filePaths[language] = null;
        state.language = language;
        state.revision += 1;
        editor.setDocument(code, language, state.theme === 'dark');
        updateLanguageUi();
        updateDocName();
        hideErrorCard();
        resetPreviewForLanguage(language);
      } else {
        state.codes[language] = code;
        editor.setValue(code);
        state.revision += 1;
        hideErrorCard();
      }
      state.fitNext = true;
      updateDocName();
      persistNow();
      return renderNow({ force: true });
    },
    setTheme: async (theme) => {
      applyTheme(theme, { rerender: false });
      persistNow();
      if (state.codes[state.language].trim()) return renderNow({ force: true });
      return true;
    },
    loadTemplate: async (id) => {
      const template = getTemplate(id);
      if (!template) return { ok: false, error: 'unknown template' };
      return loadTemplate(template);
    },
    render: async () => renderNow({ force: true }),
    exportSvg: async (filePath) => exportSvg({ filePath, quiet: true }),
    exportPng: async (filePath, options = {}) =>
      exportPng({ filePath, quiet: true, ...options }),
    copyImage: async (options = {}) => copyImage({ quiet: true, ...options }),
    copySvgSource: async (options = {}) => copySvgSource({ quiet: true, ...options }),
    getLastSvg: () => state.lastSvg,
    getEditorFontSize: () => editor.getFontSize(),
    setEditorFontSize: (size) => {
      const changed = editor.setFontSize(size);
      return { ok: true, changed, size: editor.getFontSize() };
    },
    getTemplates: () => templates.map(({ id, language, name }) => ({ id, language, name })),
  };
}

function boot() {
  applyTheme(state.theme);
  applySplit(state.split);

  editor = new CodeEditor(dom.editorHost, {
    doc: state.codes[state.language],
    language: state.language,
    dark: state.theme === 'dark',
    fontSize: state.editorFontSize,
    onChange: onCodeChange,
    onCursor: updateCursorInfo,
    onFontSize: (size) => {
      state.editorFontSize = size;
      updateEditorFontUi();
      schedulePersist();
    },
  });
  updateEditorFontUi();

  preview = new PreviewController({
    viewport: dom.previewViewport,
    layer: dom.diagramLayer,
    svgHost: dom.diagramSvg,
    onZoomChange: (percent) => {
      dom.zoomValueBtn.textContent = `${percent}%`;
    },
  });

  setupUiEvents();
  setupSplitter();
  updateLanguageUi();
  updateDocName();
  updateActions();
  setStatus('idle', '正在启动');
  setSaveState('saved');
  setDocDot('idle');
  dom.zoomValueBtn.textContent = '100%';

  if (bridge?.getInfo) {
    bridge
      .getInfo()
      .then((info) => {
        state.info = info;
      })
      .catch(() => {});
  }

  setupDebugApi();

  if (!state.codes[state.language].trim()) {
    showEmptyState();
  } else {
    requestAnimationFrame(() => {
      void renderNow({ force: true });
    });
  }

  // Warm the PlantUML engine (and Graphviz wasm) while the user is idle so the
  // first switch to it does not feel slow.
  setTimeout(() => {
    if (state.language !== 'plantuml') preloadPlantUml().catch(() => {});
  }, 2200);
}

boot();
