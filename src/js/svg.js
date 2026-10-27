/**
 * SVG normalisation, light sanitising, measuring and rasterisation helpers.
 * The diagram preview and every export path share these functions so that the
 * exported image matches what is on screen.
 */

function numericLength(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.endsWith('%')) return null;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function viewBoxSize(root) {
  const raw = root.getAttribute('viewBox');
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [, , width, height] = parts;
  return width > 0 && height > 0 ? { width, height } : null;
}

const EVENT_ATTRIBUTE = /^on/i;

/**
 * Parse an SVG string, strip active content and force an explicit pixel size.
 * Returns the live SVG element plus its intrinsic dimensions.
 */
export function prepareSvg(markup) {
  if (typeof markup !== 'string' || !markup.trim()) {
    throw new Error('渲染结果为空。');
  }
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement?.localName !== 'svg') {
    throw new Error('渲染引擎返回了无效的 SVG。');
  }

  const root = doc.documentElement;

  for (const script of [...root.querySelectorAll('script')]) script.remove();
  // PlantUML appends a compressed <?plantuml-src ...?> processing instruction.
  // It is not needed for rendering and only bloats exported files.
  for (const node of [...root.childNodes]) {
    if (node.nodeType === 7) root.removeChild(node);
  }

  const elements = [root, ...root.querySelectorAll('*')];
  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      if (EVENT_ATTRIBUTE.test(attribute.name)) element.removeAttribute(attribute.name);
      if (
        (attribute.name === 'href' || attribute.name === 'xlink:href') &&
        /^\s*javascript:/i.test(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.localName === 'image') {
      const href = element.getAttribute('href') || element.getAttribute('xlink:href') || '';
      if (/^\s*https?:/i.test(href)) element.remove();
    }
  }

  const box = viewBoxSize(root);
  let width = numericLength(root.getAttribute('width'));
  let height = numericLength(root.getAttribute('height'));

  if (box) {
    width = box.width;
    height = box.height;
  } else if (!width || !height) {
    width = 900;
    height = 600;
  }

  root.setAttribute('width', String(Math.round(width)));
  root.setAttribute('height', String(Math.round(height)));
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!root.getAttribute('xmlns:xlink')) {
    root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  root.style.maxWidth = 'none';
  root.style.minWidth = '0';
  root.style.minHeight = '0';
  root.style.width = `${Math.round(width)}px`;
  root.style.height = `${Math.round(height)}px`;
  root.style.display = 'block';
  root.style.overflow = 'visible';

  const serialized = new XMLSerializer().serializeToString(root);
  return {
    element: root,
    markup: serialized,
    width,
    height,
  };
}

export function withXmlDeclaration(markup) {
  const body = String(markup).replace(/^\uFEFF/, '').replace(/^<\?xml[^>]*\?>\s*/i, '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
}

/**
 * Insert a solid background rect into an SVG so a dark-theme diagram remains
 * readable when the file is opened on a white page.
 */
export function addSvgBackground(markup, color) {
  if (!color || color === 'transparent') return markup;
  const { element } = prepareSvg(markup);
  const doc = element.ownerDocument;
  const rawViewBox = (element.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const [minX, minY, vbWidth, vbHeight] =
    rawViewBox.length === 4 && rawViewBox.every(Number.isFinite)
      ? rawViewBox
      : [0, 0, Number(element.getAttribute('width')) || 900, Number(element.getAttribute('height')) || 600];
  const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(minX));
  rect.setAttribute('y', String(minY));
  rect.setAttribute('width', String(vbWidth));
  rect.setAttribute('height', String(vbHeight));
  rect.setAttribute('fill', color);
  element.insertBefore(rect, element.firstChild);
  return new XMLSerializer().serializeToString(element);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG 图片加载失败。'));
    image.src = url;
  });
}

/**
 * Rasterise an SVG string into a PNG. The scale is reduced automatically for
 * very large diagrams to stay within Chromium's canvas limits.
 */
export async function renderPng(markup, options = {}) {
  const { width, height, markup: normalized } = prepareSvg(markup);
  const requestedScale = Math.max(0.25, Math.min(4, Number(options.scale) || 2));
  const maxSide = 16384;
  const maxPixels = 80_000_000;
  const limitScale = Math.min(
    maxSide / width,
    maxSide / height,
    Math.sqrt(maxPixels / (width * height)),
  );
  const scale = Math.max(0.1, Math.min(requestedScale, limitScale));
  const canvasWidth = Math.max(1, Math.round(width * scale));
  const canvasHeight = Math.max(1, Math.round(height * scale));

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  const blob = new Blob([normalized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  let image;
  try {
    image = await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('无法创建画布。');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const background = options.background;
  if (background && background !== 'transparent') {
    context.fillStyle = background;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  try {
    context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
  } catch {
    throw new Error('图中包含无法离线访问的外部资源，PNG 导出被浏览器拦截。');
  }

  const pngBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('PNG 编码失败。'));
    }, 'image/png');
  });

  const bytes = new Uint8Array(await pngBlob.arrayBuffer());
  return {
    bytes,
    blob: pngBlob,
    width: canvasWidth,
    height: canvasHeight,
    scale,
    nativeWidth: width,
    nativeHeight: height,
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
