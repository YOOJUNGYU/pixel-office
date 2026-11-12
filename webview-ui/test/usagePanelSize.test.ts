import { describe, expect, it } from 'vitest';

import { USAGE_PANEL_MIN_H_PX, USAGE_PANEL_MIN_W_PX } from '../src/constants.js';
import { clampSize, dragSize } from '../src/lan/usagePanelSize.js';

const MAX = { w: 1000, h: 800 };

describe('usage panel size', () => {
  it('the right edge changes only the width, the bottom only the height, the corner both', () => {
    const start = { w: 600, h: 500 };
    expect(dragSize(start, 'right', 50, 70, MAX)).toEqual({ w: 650, h: 500 });
    expect(dragSize(start, 'bottom', 50, 70, MAX)).toEqual({ w: 600, h: 570 });
    expect(dragSize(start, 'corner', 50, 70, MAX)).toEqual({ w: 650, h: 570 });
  });

  it('never below the minimum, never past the viewport room', () => {
    const start = { w: 600, h: 500 };
    expect(dragSize(start, 'corner', -1000, -1000, MAX)).toEqual({
      w: USAGE_PANEL_MIN_W_PX,
      h: USAGE_PANEL_MIN_H_PX,
    });
    expect(dragSize(start, 'corner', 1000, 1000, MAX)).toEqual(MAX);
  });

  it('a viewport smaller than the minimum wins', () => {
    expect(clampSize({ w: 500, h: 500 }, { w: 200, h: 100 })).toEqual({ w: 200, h: 100 });
  });

  it('rounds to whole pixels', () => {
    expect(dragSize({ w: 600, h: 500 }, 'corner', 0.4, 0.6, MAX)).toEqual({ w: 600, h: 501 });
  });
});
