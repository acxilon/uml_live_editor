import { DiagramError } from '../errors.js';

const VERSION = typeof __MERMAID_VERSION__ === 'string' ? __MERMAID_VERSION__ : 'local';
const UI_FONT = '"Segoe UI", "Segoe UI Variable Text", "Microsoft YaHei UI", system-ui, sans-serif';

let mermaidPromise = null;
let renderChain = Promise.resolve();
let renderCounter = 0;

const DARK_VARS = {
  fontFamily: UI_FONT,
  fontSize: '14px',
  background: '#0b0f17',
  primaryColor: '#1b2436',
  primaryTextColor: '#e8eef8',
  primaryBorderColor: '#43516b',
  secondaryColor: '#162030',
  tertiaryColor: '#111824',
  lineColor: '#8497b3',
  textColor: '#dfe7f3',
  mainBkg: '#1b2436',
  nodeBorder: '#43516b',
  nodeTextColor: '#e8eef8',
  clusterBkg: '#121a27',
  clusterBorder: '#2b374b',
  edgeLabelBackground: '#101722',
  titleColor: '#f2f6fd',
  actorBkg: '#1b2436',
  actorBorder: '#43516b',
  actorTextColor: '#e8eef8',
  actorLineColor: '#43516b',
  signalColor: '#b3c2d8',
  signalTextColor: '#e8eef8',
  labelBoxBkgColor: '#1b2436',
  labelBoxBorderColor: '#43516b',
  labelTextColor: '#e8eef8',
  loopTextColor: '#dfe7f3',
  noteBkgColor: '#2b2414',
  noteTextColor: '#f7df9c',
  noteBorderColor: '#6b5a28',
  activationBkgColor: '#24314a',
  activationBorderColor: '#5b7094',
  sequenceNumberColor: '#0b0f17',
  sectionBkgColor: '#121a27',
  altSectionBkgColor: '#0f1621',
  sectionBkgColor2: '#121a27',
  taskBkgColor: '#2a3a57',
  taskBorderColor: '#4f638a',
  taskTextColor: '#eef4ff',
  taskTextOutsideColor: '#dfe7f3',
  taskTextLightColor: '#eef4ff',
  taskTextDarkColor: '#0b0f17',
  activeTaskBkgColor: '#4f6cff',
  activeTaskBorderColor: '#7c93ff',
  gridColor: '#2a3548',
  doneTaskBkgColor: '#24314a',
  doneTaskBorderColor: '#3d4e6c',
  critBkgColor: '#7f1d3a',
  critBorderColor: '#fb7185',
  todayLineColor: '#fb7185',
  pie1: '#7c93ff',
  pie2: '#22d3ee',
  pie3: '#34d399',
  pie4: '#fbbf24',
  pie5: '#fb7185',
  pie6: '#c4b5fd',
  pie7: '#94a3b8',
  pie8: '#2dd4bf',
};

const LIGHT_VARS = {
  fontFamily: UI_FONT,
  fontSize: '14px',
  background: '#ffffff',
  primaryColor: '#eef2ff',
  primaryTextColor: '#111a2c',
  primaryBorderColor: '#a5b4fc',
  secondaryColor: '#f4f7fb',
  tertiaryColor: '#ffffff',
  lineColor: '#64748b',
  textColor: '#1e293b',
  mainBkg: '#eef2ff',
  nodeBorder: '#a5b4fc',
  nodeTextColor: '#1e293b',
  clusterBkg: '#f8fafc',
  clusterBorder: '#d9e2ef',
  edgeLabelBackground: '#ffffff',
  titleColor: '#0f172a',
  actorBkg: '#eef2ff',
  actorBorder: '#a5b4fc',
  actorTextColor: '#111a2c',
  actorLineColor: '#cbd5e1',
  signalColor: '#475569',
  signalTextColor: '#1e293b',
  labelBoxBkgColor: '#eef2ff',
  labelBoxBorderColor: '#a5b4fc',
  labelTextColor: '#1e293b',
  loopTextColor: '#334155',
  noteBkgColor: '#fffbeb',
  noteTextColor: '#78350f',
  noteBorderColor: '#fcd34d',
  activationBkgColor: '#e0e7ff',
  activationBorderColor: '#818cf8',
  sequenceNumberColor: '#ffffff',
  sectionBkgColor: '#f4f7fb',
  altSectionBkgColor: '#fbfcff',
  sectionBkgColor2: '#f4f7fb',
  taskBkgColor: '#dbe4ff',
  taskBorderColor: '#818cf8',
  taskTextColor: '#111a2c',
  taskTextOutsideColor: '#334155',
  taskTextLightColor: '#111a2c',
  taskTextDarkColor: '#ffffff',
  activeTaskBkgColor: '#4f46e5',
  activeTaskBorderColor: '#4338ca',
  gridColor: '#dbe3ee',
  doneTaskBkgColor: '#eef2f8',
  doneTaskBorderColor: '#cbd5e1',
  critBkgColor: '#fee2e2',
  critBorderColor: '#ef4444',
  todayLineColor: '#ef4444',
  pie1: '#6366f1',
  pie2: '#06b6d4',
  pie3: '#10b981',
  pie4: '#f59e0b',
  pie5: '#ef4444',
  pie6: '#8b5cf6',
  pie7: '#64748b',
  pie8: '#14b8a6',
};

function configFor(dark) {
  const vars = dark ? DARK_VARS : LIGHT_VARS;
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: dark ? 'dark' : 'default',
    darkMode: dark,
    fontFamily: UI_FONT,
    fontSize: 14,
    htmlLabels: false,
    themeVariables: vars,
    flowchart: {
      htmlLabels: false,
      useMaxWidth: false,
      curve: 'basis',
      padding: 16,
      nodeSpacing: 38,
      rankSpacing: 46,
      diagramPadding: 10,
    },
    sequence: {
      useMaxWidth: false,
      wrap: true,
      wrapPadding: 10,
      diagramMarginX: 26,
      diagramMarginY: 16,
      actorMargin: 46,
      width: 150,
      height: 56,
      boxMargin: 10,
      noteMargin: 10,
      messageMargin: 38,
      mirrorActors: true,
      bottomMarginAdj: 8,
    },
    class: { htmlLabels: false, useMaxWidth: false },
    state: { useMaxWidth: false },
    er: { useMaxWidth: false, diagramPadding: 20 },
    gantt: {
      useMaxWidth: false,
      barHeight: 24,
      barGap: 4,
      topPadding: 50,
      leftPadding: 85,
      gridLineStartPadding: 35,
      fontSize: 11,
      sectionFontSize: 11,
    },
    mindmap: { useMaxWidth: false, padding: 16 },
    journey: { useMaxWidth: false },
    pie: { useMaxWidth: false },
    requirement: { useMaxWidth: false },
    quadrantChart: { useMaxWidth: false },
    xychart: { useMaxWidth: false },
  };
}

export function mermaidVersion() {
  return VERSION;
}

async function loadMermaid() {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = (async () => {
    try {
      const module = await import('mermaid');
      const mermaid = module.default ?? module;
      if (!mermaid || typeof mermaid.render !== 'function') {
        throw new Error('mermaid 模块缺少 render() 导出');
      }
      return mermaid;
    } catch (error) {
      mermaidPromise = null;
      throw new DiagramError('Mermaid 引擎加载失败，请重新安装应用。', {
        engine: 'Mermaid',
        kind: 'engine',
        details: error instanceof Error ? error.message : String(error),
        raw: error,
      });
    }
  })();
  return mermaidPromise;
}

export function isMermaidLoaded() {
  return mermaidPromise !== null;
}

function cleanupMermaidDom(id) {
  for (const elementId of [id, `d${id}`]) {
    const element = document.getElementById(elementId);
    if (element && !element.closest('#diagramSvg')) element.remove();
  }
}

function cleanErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.replace(/^Error:\s*/i, '').replace(/\s+\n/g, '\n').trim();
  const lineMatch = /(?:parse error\s+on\s+line|line)\s+(\d+)/i.exec(text);
  return {
    message: text.length > 2400 ? `${text.slice(0, 2400)}…` : text,
    line: lineMatch ? Number(lineMatch[1]) : null,
  };
}

async function doRender(code, options) {
  const mermaid = await loadMermaid();
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  const dark = options.dark === true;
  const started = performance.now();
  const id = `uml-live-${++renderCounter}`;

  try {
    mermaid.initialize(configFor(dark));
    const result = await mermaid.render(id, String(code));
    cleanupMermaidDom(id);
    const duration = Math.round(performance.now() - started);
    if (!result || typeof result.svg !== 'string' || !result.svg.trim()) {
      throw new DiagramError('Mermaid 没有返回任何内容。', {
        engine: 'Mermaid',
        kind: 'render',
      });
    }
    return {
      svg: result.svg,
      duration,
      engine: 'Mermaid',
      version: VERSION,
      meta: { dark },
    };
  } catch (error) {
    cleanupMermaidDom(id);
    if (error instanceof DiagramError) throw error;
    const { message, line } = cleanErrorMessage(error);
    throw new DiagramError('Mermaid 解析失败，请检查图的语法。', {
      engine: 'Mermaid',
      kind: /loading|import|module/i.test(message) ? 'engine' : 'syntax',
      line,
      details: message,
      raw: error,
    });
  }
}

/**
 * Mermaid's renderer touches shared DOM state, so renders are serialised.
 */
export function renderMermaid(code, options = {}) {
  const run = () => doRender(code, options);
  const result = renderChain.then(run, run);
  renderChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
