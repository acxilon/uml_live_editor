export class DiagramError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'DiagramError';
    this.engine = options.engine ?? '';
    this.kind = options.kind ?? 'syntax';
    this.line = Number.isFinite(options.line) ? options.line : null;
    this.details = options.details ?? '';
    this.raw = options.raw ?? null;
  }
}

export function toDiagramError(error, fallback) {
  if (error instanceof DiagramError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DiagramError(message || fallback || '渲染失败');
}
