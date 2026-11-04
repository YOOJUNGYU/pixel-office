import assert from 'node:assert/strict';

import { afterEach, test } from 'vitest';

import { ACTS } from '../../core/src/lan.js';
import { ELAPSED_WARN_MS, ELAPSED_WARN_PERMISSION_MS } from '../src/constants.js';
import { setLang } from '../src/i18n.js';
import { actIcon, ICONS } from '../src/lan/actIcons.js';
import {
  elapsedText,
  elapsedWarn,
  iconOnly,
  todoPercent,
  todoText,
} from '../src/lan/statusSignals.js';

afterEach(() => setLang('ko'));

test('every icon is 8×8', () => {
  for (const [id, rows] of Object.entries(ICONS)) {
    assert.equal(rows.length, 8, id);
    for (const r of rows) assert.match(r, /^[.#]{8}$/, id);
  }
});

test('every act has an icon except idle; thinking and hidden are told apart', () => {
  for (const act of ACTS) {
    const icon = actIcon({ act, target: 'x' });
    if (act === 'idle') assert.equal(icon, null);
    else assert.ok(icon && icon in ICONS, act);
  }
  assert.equal(actIcon({ act: 'tool', target: '' }), 'thinking');
  assert.equal(actIcon({ act: 'edit', target: 'a', hidden: true }), null);
});

test('elapsed text: nothing under a minute, minutes, hours', () => {
  setLang('ko');
  assert.equal(elapsedText(undefined), '');
  assert.equal(elapsedText(59), '');
  assert.equal(elapsedText(180), '3분');
  assert.equal(elapsedText(72 * 60), '1시간 12분');
  setLang('en');
  assert.equal(elapsedText(72 * 60), '1h 12m');
});

test('elapsed warning: waiting for me sooner than anything else', () => {
  const sec = (ms: number) => ms / 1000;
  assert.equal(elapsedWarn({ permission: true, ageSec: sec(ELAPSED_WARN_PERMISSION_MS) }), true);
  assert.equal(elapsedWarn({ permission: false, ageSec: sec(ELAPSED_WARN_PERMISSION_MS) }), false);
  assert.equal(elapsedWarn({ permission: false, ageSec: sec(ELAPSED_WARN_MS) }), true);
  assert.equal(elapsedWarn({ permission: true }), false);
});

test('todo text and fill; icon-only below the threshold', () => {
  assert.equal(todoText({ todo: { done: 3, total: 7 } }), '3/7');
  assert.equal(todoText({}), '');
  assert.equal(todoPercent({ todo: { done: 1, total: 3 } }), 33);
  assert.equal(iconOnly(0.5, 0.6), true);
  assert.equal(iconOnly(0.6, 0.6), false);
});

test('langColor: edit/read of a known file type only', async () => {
  const { langColor } = await import('../src/lan/statusSignals.js');
  const { LANG_ICON_COLORS } = await import('../src/constants.js');
  assert.equal(langColor({ act: 'edit', target: 'LanOverlay.tsx' }), LANG_ICON_COLORS.js);
  assert.equal(langColor({ act: 'read', target: 'main.py' }), LANG_ICON_COLORS.py);
  assert.equal(langColor({ act: 'edit', target: 'notes' }), undefined);
  assert.equal(langColor({ act: 'run', target: 'a.py' }), undefined);
  assert.equal(langColor({ act: 'edit', target: 'a.py', hidden: true }), undefined);
});

test('ctx chip text: my agents only carry ctx', async () => {
  const { ctxText, ctxPercent } = await import('../src/lan/statusSignals.js');
  assert.equal(ctxText({ ctx: { used: 294_000, window: 1_000_000 } }), '29%');
  assert.equal(ctxPercent({ ctx: { used: 300_000, window: 200_000 } }), 100);
  assert.equal(ctxText({}), '');
});
