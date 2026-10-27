import { DiagramError } from '../errors.js';

const VERSION = typeof __PLANTUML_VERSION__ === 'string' ? __PLANTUML_VERSION__ : 'local';

let enginePromise = null;
let warmupPromise = null;

function engineUrl() {
  return new URL('plantuml.js', document.baseURI).href;
}

export function plantumlVersion() {
  return VERSION;
}

export function isPlantUmlLoaded() {
  return enginePromise !== null;
}

export async function preloadPlantUml() {
  if (warmupPromise) return warmupPromise;
  await loadEngine();
  warmupPromise = (async () => {
    const viz = globalThis.Viz;
    if (!viz || typeof viz.instance !== 'function') return;
    globalThis.PLANTUML_VIZ = viz;
    if (globalThis.__plantumlVizInstance) return;
    try {
      const instance = await viz.instance();
      if (instance && typeof instance.renderString === 'function') {
        globalThis.__plantumlVizInstance = instance;
      }
    } catch {
      // The engine reports a useful error later if a diagram really needs Viz.
    }
  })();
  return warmupPromise;
}

async function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    let module;
    try {
      module = await import(/* @vite-ignore */ engineUrl());
    } catch (error) {
      enginePromise = null;
      throw new DiagramError(
        `PlantUML 引擎加载失败。请确认安装目录中的 plantuml.js 与 viz-global.js 文件完整。`,
        { engine: 'PlantUML', kind: 'engine', raw: error },
      );
    }
    if (typeof module.renderToString !== 'function') {
      enginePromise = null;
      throw new DiagramError('PlantUML 引擎文件无效：缺少 renderToString 导出。', {
        engine: 'PlantUML',
        kind: 'engine',
      });
    }
    return module;
  })();
  return enginePromise;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function inspectErrorSvg(svg, code) {
  if (!svg.includes('Syntax Error?')) return null;
  const plain = decodeEntities(svg.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  const lineMatch = /\(line\s+(\d+)\)/i.exec(plain);
  const assumedMatch = /Assumed diagram type:\s*([^)]+)/i.exec(plain);
  const line = lineMatch ? Number(lineMatch[1]) : null;
  const assumed = assumedMatch ? assumedMatch[1].trim() : '';
  const sourceLines = String(code).split(/\r?\n/);
  const sourceLine = line && sourceLines[line - 1] ? sourceLines[line - 1].trim() : '';

  const details = [];
  if (sourceLine) details.push(`第 ${line} 行：${sourceLine}`);
  if (assumed) details.push(`PlantUML 无法识别图表类型，暂按 ${assumed} 解析。`);
  details.push('提示：检查箭头、括号和 @startuml / @enduml 是否配对。');

  return new DiagramError('PlantUML 解析失败，请检查图中的语法。', {
    engine: 'PlantUML',
    kind: 'syntax',
    line,
    details: details.join('\n'),
    raw: plain.slice(0, 2000),
  });
}

function friendlyError(error, code) {
  if (error instanceof DiagramError) return error;
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw || '未知错误';

  if (/Viz is not loaded|Graphviz/i.test(message)) {
    return new DiagramError('Graphviz 布局引擎不可用，无法绘制该类型图表。', {
      engine: 'PlantUML',
      kind: 'engine',
      details: message,
      raw: error,
    });
  }
  if (/maxSvgSize|too (?:large|big)/i.test(message)) {
    return new DiagramError('图表尺寸过大，PlantUML 拒绝生成 SVG。', {
      engine: 'PlantUML',
      kind: 'render',
      details: message,
      raw: error,
    });
  }
  if (/Cannot find theme/i.test(message)) {
    return new DiagramError('找不到指定的 PlantUML 主题。', {
      engine: 'PlantUML',
      kind: 'theme',
      details: message,
      raw: error,
    });
  }
  void code;
  return new DiagramError('PlantUML 渲染失败。', {
    engine: 'PlantUML',
    kind: 'render',
    details: message,
    raw: error,
  });
}

/**
 * Render PlantUML entirely in JavaScript (TeaVM build) — no Java, no server.
 */
export async function renderPlantUml(code, options = {}) {
  const source = String(code ?? '');
  const module = await loadEngine();
  const started = performance.now();
  const lines = source.split(/\r\n|\r|\n/);

  let timer;
  let svg;
  try {
    svg = await Promise.race([
      new Promise((resolve, reject) => {
        try {
          module.renderToString(
            lines,
            resolve,
            reject,
            { dark: options.dark === true, maxSvgSize: 16384 },
          );
        } catch (error) {
          reject(error);
        }
      }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('PlantUML 渲染超时。')), 45_000);
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (error) {
    throw friendlyError(error, source);
  }

  const duration = Math.round(performance.now() - started);
  if (typeof svg !== 'string' || !svg.trim()) {
    throw new DiagramError('PlantUML 没有返回任何内容。', {
      engine: 'PlantUML',
      kind: 'render',
    });
  }

  const syntaxError = inspectErrorSvg(svg, source);
  if (syntaxError) {
    syntaxError.duration = duration;
    throw syntaxError;
  }

  return {
    svg,
    duration,
    engine: 'PlantUML',
    version: VERSION,
    meta: { dark: options.dark === true },
  };
}
