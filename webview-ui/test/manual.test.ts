/**
 * ? manual: every entry has text in both languages and an animation; search.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { test } from 'vitest';

import { DICT } from '../src/i18n.js';
import { bodyKey, MANUAL, MANUAL_CATS, searchManual, titleKey } from '../src/lan/manual.js';
import { STEPS } from '../src/tour/steps.js';

// The scenes' keys, read from the source (the test build has no JSX).
const src = fs.readFileSync(new URL('../src/lan/ManualScenes.tsx', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('const scenes: Record<string, Scene> = {'));
const SCENE_IDS = [...body.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1]);

test('every entry: unique id, a known category, title + body in ko/en, a scene', () => {
  const ids = MANUAL.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of MANUAL) {
    assert.ok(MANUAL_CATS.includes(m.cat), m.id);
    for (const lang of ['ko', 'en'] as const) {
      assert.ok(DICT[lang][titleKey(m.id)], `${lang} title ${m.id}`);
      assert.ok(DICT[lang][bodyKey(m.id)], `${lang} body ${m.id}`);
    }
    assert.ok(SCENE_IDS.includes(m.id), `scene ${m.id}`);
  }
  assert.deepEqual([...SCENE_IDS].sort(), [...ids].sort(), 'no scene without an entry');
});

test('search: empty = all, words in either language, title hits first, none = []', () => {
  assert.equal(searchManual('').length, MANUAL.length);
  assert.equal(searchManual('   ').length, MANUAL.length);
  const chat = searchManual('상태 메시지');
  assert.equal(chat[0].id, 'chat');
  assert.equal(searchManual('status message')[0].id, 'chat'); // English word, any page language
  assert.equal(searchManual('STATUS MESSAGE')[0].id, 'chat');
  assert.ok(searchManual('PO2').some((m) => m.id === 'team'));
  assert.ok(searchManual('토큰 불꽃').some((m) => m.id === 'heat'));
  assert.deepEqual(searchManual('zzqqxx'), []);
  // A category name finds its entries.
  assert.ok(searchManual('레이아웃 편집').some((m) => m.cat === 'layout'));
});

test('the tour ends by pointing at the manual (where the tour is replayed)', () => {
  const ids = STEPS.map((s) => s.id);
  assert.equal(ids[ids.length - 2], 'manual');
  assert.ok(!Object.keys(DICT.ko).includes('settings.replayTour'));
});
