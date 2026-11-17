import { describe, expect, it } from 'vitest';

import { BLINK_GAP_MAX_SEC, BLINK_SHUT_SEC } from '../src/constants.js';
import {
  type Blinker,
  blinkGap,
  blinkWake,
  isShut,
  tickBlink,
} from '../src/office/engine/blink.js';

describe('blink', () => {
  it('starts a clock, shuts on wall time (however coarse the ticks), then opens again', () => {
    const b: Blinker = {};
    expect(blinkWake(b, 0)).toBe(Infinity);
    tickBlink(b, 100, false, () => 0.5);
    expect(isShut(b)).toBe(false);
    const at = b.blinkAt!;
    expect(blinkWake(b, 100)).toBeCloseTo(at - 100);
    tickBlink(b, at + 0.001, false, () => 0.5); // one tick, however long after
    expect(isShut(b)).toBe(true);
    expect(blinkWake(b, at)).toBeGreaterThanOrEqual(BLINK_SHUT_SEC[0]);
    tickBlink(b, at + 1, false, () => 0.5);
    expect(isShut(b)).toBe(false);
    expect(b.blinkAt).toBeGreaterThan(at + 1);
  });

  it('caps the gap and stretches it while focused', () => {
    expect(blinkGap(false, () => 0.999999)).toBe(BLINK_GAP_MAX_SEC);
    expect(blinkGap(true, () => 0.1)).toBeGreaterThan(blinkGap(false, () => 0.1));
  });
});
