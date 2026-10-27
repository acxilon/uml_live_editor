import { prepareSvg } from './svg.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class PreviewController {
  constructor(options) {
    this.viewport = options.viewport;
    this.layer = options.layer;
    this.svgHost = options.svgHost;
    this.onZoomChange = options.onZoomChange ?? (() => {});

    this.zoom = 1;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.hasDiagram = false;
    this.userAdjusted = false;
    this.centeredAt100 = false;
    this.panning = false;
    this.drag = null;
    this._raf = 0;

    this._bind();
    this._resizeObserver = new ResizeObserver(() => {
      this._scheduleResize();
    });
    this._resizeObserver.observe(this.viewport);
  }

  _bind() {
    this.viewport.addEventListener('wheel', (event) => this._onWheel(event), { passive: false });
    this.viewport.addEventListener('pointerdown', (event) => this._onPointerDown(event));
    this.viewport.addEventListener('pointermove', (event) => this._onPointerMove(event));
    this.viewport.addEventListener('pointerup', (event) => this._onPointerUp(event));
    this.viewport.addEventListener('pointercancel', (event) => this._onPointerUp(event));
    this.viewport.addEventListener('dblclick', (event) => {
      if (this._isInteractive(event.target)) return;
      this.fit();
    });
  }

  _isInteractive(target) {
    return Boolean(
      target instanceof Element &&
        target.closest(
          '.error-card, .preview-placeholder, .preview-loading, .drop-overlay, button, a, input, select, textarea',
        ),
    );
  }

  _scheduleResize() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (!this.hasDiagram) return;
      if (!this.userAdjusted) this.fit();
      else if (this.centeredAt100) this.centerAt100();
      else this._apply();
    });
  }

  _onWheel(event) {
    if (!this.hasDiagram) return;

    // Normal vertical wheel/trackpad scrolling zooms in and out, anchored at
    // the pointer. Panning stays available by dragging the canvas.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewport.clientHeight : 1;
    const delta = event.deltaY * unit;
    if (!delta) return;
    event.preventDefault();
    const factor = clamp(Math.exp(-delta * 0.0018), 0.5, 2);
    this.zoomAt(factor, event.clientX, event.clientY);
  }

  _onPointerDown(event) {
    if (event.button !== 0 || !this.hasDiagram || this._isInteractive(event.target)) return;
    if (event.ctrlKey || event.metaKey) return;
    this.panning = true;
    this.userAdjusted = true;
    this.centeredAt100 = false;
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: this.x,
      originY: this.y,
      moved: false,
    };
    this.viewport.setPointerCapture(event.pointerId);
    this.viewport.classList.add('is-panning');
  }

  _onPointerMove(event) {
    if (!this.panning || !this.drag || event.pointerId !== this.drag.pointerId) return;
    const dx = event.clientX - this.drag.startX;
    const dy = event.clientY - this.drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.drag.moved = true;
    this.x = this.drag.originX + dx;
    this.y = this.drag.originY + dy;
    this._apply();
  }

  _onPointerUp(event) {
    if (!this.panning || !this.drag || event.pointerId !== this.drag.pointerId) return;
    try {
      this.viewport.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released.
    }
    this.panning = false;
    this.drag = null;
    this.viewport.classList.remove('is-panning');
  }

  setDiagram(markup, options = {}) {
    const prepared = prepareSvg(markup);
    const node = document.importNode(prepared.element, true);
    this.svgHost.replaceChildren(node);
    this.width = prepared.width;
    this.height = prepared.height;
    this.layer.style.width = `${prepared.width}px`;
    this.layer.style.height = `${prepared.height}px`;
    this.hasDiagram = true;
    this.viewport.classList.remove('is-empty');
    if (options.fit || !this.userAdjusted) {
      this.fit();
    } else if (this.centeredAt100) {
      this.centerAt100();
    } else {
      this._apply();
    }
    return { width: prepared.width, height: prepared.height, markup: prepared.markup };
  }

  clear() {
    this.svgHost.replaceChildren();
    this.layer.style.width = '0';
    this.layer.style.height = '0';
    this.hasDiagram = false;
    this.userAdjusted = false;
    this.centeredAt100 = false;
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
    this.viewport.classList.add('is-empty');
    this._apply();
    this._emitZoom();
  }

  showError(show) {
    this.viewport.classList.toggle('has-error', Boolean(show));
  }

  fit() {
    if (!this.hasDiagram) return;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const padding = clamp(Math.min(rect.width, rect.height) * 0.07, 24, 48);
    const availableWidth = Math.max(40, rect.width - padding * 2);
    const availableHeight = Math.max(40, rect.height - padding * 2);
    const zoom = clamp(Math.min(availableWidth / this.width, availableHeight / this.height), MIN_ZOOM, 1.25);
    this.zoom = zoom;
    this.x = (rect.width - this.width * zoom) / 2;
    this.y = (rect.height - this.height * zoom) / 2;
    this.userAdjusted = false;
    this.centeredAt100 = false;
    this._apply();
    this._emitZoom();
  }

  /**
   * Reset the canvas to 100% and center the diagram in the viewport.
   * This is the behavior of the toolbar "fit" button, the percentage label and
   * Ctrl+0. Actual scale-to-fit remains available via double-click.
   */
  centerAt100() {
    if (!this.hasDiagram) return;
    const rect = this.viewport.getBoundingClientRect();
    this.zoom = 1;
    this.x = (rect.width - this.width) / 2;
    this.y = (rect.height - this.height) / 2;
    this.userAdjusted = true;
    this.centeredAt100 = true;
    this._apply();
    this._emitZoom();
  }

  zoomTo(targetZoom, anchor = null) {
    if (!this.hasDiagram) return;
    const rect = this.viewport.getBoundingClientRect();
    const ax = anchor?.x ?? rect.width / 2;
    const ay = anchor?.y ?? rect.height / 2;
    const next = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    const contentX = (ax - this.x) / this.zoom;
    const contentY = (ay - this.y) / this.zoom;
    this.zoom = next;
    this.x = ax - contentX * next;
    this.y = ay - contentY * next;
    this.userAdjusted = true;
    this.centeredAt100 = false;
    this._apply();
    this._emitZoom();
  }

  zoomAt(factor, clientX, clientY) {
    if (!this.hasDiagram) return;
    const rect = this.viewport.getBoundingClientRect();
    this.zoomTo(this.zoom * factor, {
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
  }

  zoomBy(factor) {
    this.zoomTo(this.zoom * factor);
  }

  resetZoom() {
    this.centerAt100();
  }

  _apply() {
    this.layer.style.transform = `translate(${this.x.toFixed(2)}px, ${this.y.toFixed(2)}px) scale(${this.zoom.toFixed(4)})`;
  }

  _emitZoom() {
    this.onZoomChange(Math.round(this.zoom * 100));
  }

  getZoomPercent() {
    return Math.round(this.zoom * 100);
  }

  destroy() {
    this._resizeObserver?.disconnect();
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}
