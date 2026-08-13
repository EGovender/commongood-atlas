import { describe, it, expect } from 'vitest';
import {
  computeEntityBoxLayout,
  intersectRayWithBox,
  truncateLabel,
  ENTITY_BOX_WIDTH,
  ENTITY_HEADER_HEIGHT,
  ENTITY_ROW_HEIGHT,
  ENTITY_BOX_PADDING,
} from '../entity-shapes';

describe('computeEntityBoxLayout', () => {
  it('sizes a zero-attribute box to just the header plus padding', () => {
    const layout = computeEntityBoxLayout(0);
    expect(layout.width).toBe(ENTITY_BOX_WIDTH);
    expect(layout.height).toBe(ENTITY_HEADER_HEIGHT + ENTITY_BOX_PADDING * 2);
    expect(layout.attributeRowY).toHaveLength(0);
  });

  it('grows height linearly with attribute count, one row per attribute', () => {
    const one = computeEntityBoxLayout(1);
    const many = computeEntityBoxLayout(13);
    expect(one.attributeRowY).toHaveLength(1);
    expect(many.attributeRowY).toHaveLength(13);
    expect(many.height - one.height).toBe(12 * ENTITY_ROW_HEIGHT);
  });

  it('places every row strictly below the header and in increasing order', () => {
    const layout = computeEntityBoxLayout(5);
    for (const y of layout.attributeRowY) expect(y).toBeGreaterThan(ENTITY_HEADER_HEIGHT);
    for (let i = 1; i < layout.attributeRowY.length; i++) {
      expect(layout.attributeRowY[i]).toBeGreaterThan(layout.attributeRowY[i - 1]);
    }
  });
});

describe('intersectRayWithBox', () => {
  const halfWidth = 100;
  const halfHeight = 50;

  it('exits through the right edge when the ray points straight right', () => {
    const { ox, oy } = intersectRayWithBox(1, 0, halfWidth, halfHeight);
    expect(ox).toBeCloseTo(halfWidth);
    expect(oy).toBeCloseTo(0);
  });

  it('exits through the bottom edge when the ray points straight down', () => {
    const { ox, oy } = intersectRayWithBox(0, 1, halfWidth, halfHeight);
    expect(ox).toBeCloseTo(0);
    expect(oy).toBeCloseTo(halfHeight);
  });

  it('exits through the shorter side for a diagonal ray (wide box, so the top/bottom edge)', () => {
    // 45-degree ray on a box twice as wide as it is tall exits the top/bottom edge first.
    const { ox, oy } = intersectRayWithBox(1, 1, halfWidth, halfHeight);
    expect(Math.abs(oy)).toBeCloseTo(halfHeight);
    expect(Math.abs(ox)).toBeLessThan(halfWidth);
  });

  it('returns the origin for a zero-length ray rather than dividing by zero', () => {
    expect(intersectRayWithBox(0, 0, halfWidth, halfHeight)).toEqual({ ox: 0, oy: 0 });
  });
});

describe('truncateLabel', () => {
  it('leaves short text untouched', () => {
    expect(truncateLabel('Award', 20)).toBe('Award');
  });

  it('truncates long text with a trailing ellipsis, respecting the character budget', () => {
    const truncated = truncateLabel('Normalization Status', 10);
    expect(truncated).toHaveLength(10);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('handles a degenerate budget of 1 or fewer characters without throwing', () => {
    expect(truncateLabel('Award', 1)).toBe('…');
    expect(truncateLabel('', 1)).toBe('');
  });
});
