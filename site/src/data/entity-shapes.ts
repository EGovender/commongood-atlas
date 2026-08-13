// Pure layout/geometry helpers for LogicalModelDiagram.tsx, kept separate
// from the component so the box-sizing and edge-intersection math can be
// reasoned about (and tested) independently of React/D3 wiring -- same
// discipline as graph-utils.ts for GraphExplorer.tsx. Not an extension of
// graph-shapes.ts: nodeShapePath() there returns one fixed-size symmetric
// shape per ConceptKind, with no notion of internal rows or variable
// height, which a boxy multi-attribute-row entity fundamentally needs.

export const ENTITY_BOX_WIDTH = 200;
export const ENTITY_HEADER_HEIGHT = 26;
export const ENTITY_ROW_HEIGHT = 16;
export const ENTITY_BOX_PADDING = 6;

export interface EntityBoxLayout {
  width: number;
  height: number;
  /** Each attribute row's baseline y-offset from the box's own top edge. */
  attributeRowY: number[];
}

/** All boxes share one width; only height (and where each attribute row
 * falls) varies with how many attributes the entity has. */
export function computeEntityBoxLayout(attributeCount: number): EntityBoxLayout {
  const height = ENTITY_HEADER_HEIGHT + attributeCount * ENTITY_ROW_HEIGHT + ENTITY_BOX_PADDING * 2;
  const attributeRowY = Array.from(
    { length: attributeCount },
    (_, i) => ENTITY_HEADER_HEIGHT + ENTITY_BOX_PADDING + i * ENTITY_ROW_HEIGHT + ENTITY_ROW_HEIGHT * 0.75
  );
  return { width: ENTITY_BOX_WIDTH, height, attributeRowY };
}

/**
 * Where a ray from a box's own center (direction dx,dy) exits its
 * rectangular boundary -- replaces ConceptualModelDiagram's circular
 * `sr = NODE_SIZE / 2` pullback (which assumes a symmetric bubble) for an
 * entity box, so association lines stop at the rectangle's edge rather than
 * a circle's. dx/dy need not be normalized; only their ratio matters.
 */
export function intersectRayWithBox(dx: number, dy: number, halfWidth: number, halfHeight: number): { ox: number; oy: number } {
  if (dx === 0 && dy === 0) return { ox: 0, oy: 0 };
  const scale = Math.min(dx !== 0 ? halfWidth / Math.abs(dx) : Infinity, dy !== 0 ? halfHeight / Math.abs(dy) : Infinity);
  return { ox: dx * scale, oy: dy * scale };
}

/** Plain SVG <text> has no CSS ellipsis/wrapping -- a simple char-budget
 * truncation instead, tuned by eye against the box width in practice. */
export function truncateLabel(text: string, maxChars: number): string {
  if (maxChars <= 1) return text.length > 0 ? '…' : text;
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}
