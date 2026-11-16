import { describe, expect, it } from 'vitest';

import { GAME_FP } from '../../core/src/constants.js';
import { newTower, towerDrop } from '../../core/src/games/tower.js';
import { towerCamera, TowerView } from '../src/lan/games/towerView.js';

const always = (v: number) => () => v;

describe('TowerView', () => {
  it('a cut drops the cut-off piece away from the stack; it falls out of view', () => {
    const s = newTower(always(0));
    const view = new TowerView();
    s.x = (s.stack[0].x + 10) * GAME_FP; // 10 px too far right
    towerDrop(s);
    for (const f of s.fx) view.onFx(s, f);
    expect(view.debris).toHaveLength(1);
    const d = view.debris[0];
    expect(d.x).toBe(s.stack[0].x + s.stack[0].w);
    expect(d.w).toBe(10);
    expect(d.vx).toBeGreaterThan(0);
    expect(view.flashMs).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) view.update(s, 16);
    expect(view.debris).toHaveLength(0);
    expect(view.flashMs).toBe(0);
  });

  it('a perfect rings; the camera glides to the stack', () => {
    const s = newTower(always(0));
    const view = new TowerView();
    for (let i = 0; i < 20; i++) {
      s.x = s.stack.at(-1)!.x * GAME_FP;
      towerDrop(s);
    }
    for (const f of s.fx.splice(0)) view.onFx(s, f);
    expect(view.ringMs).toBeGreaterThan(0);
    expect(view.debris).toHaveLength(0);
    view.update(s, 16);
    expect(view.cam).toBeGreaterThan(0);
    expect(view.cam).toBeLessThan(towerCamera(s));
    for (let i = 0; i < 200; i++) view.update(s, 16);
    expect(view.cam).toBe(towerCamera(s));
  });
});
