// Only the PC straight in front of a working seat glows (not the ones beside it).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { decodeAllFurniture } from '../../core/src/assets/loader.ts';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import type { OfficeLayout } from '../src/office/types.js';
import { Direction, TILE_SIZE } from '../src/office/types.js';

const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');
const catalog = buildFurnitureCatalog(assetsDir);
buildDynamicCatalog({ catalog, sprites: decodeAllFurniture(assetsDir, catalog) });
const layout = JSON.parse(
  fs.readFileSync(path.join(assetsDir, 'default-layout-1.json'), 'utf-8'),
) as OfficeLayout;

function glowsFor(area: string, facing: number) {
  const os = new OfficeState(layout);
  const seat = [...os.seats.entries()].find(
    ([uid, s]) => s.facingDir === facing && os.seatZone(uid) === area,
  );
  assert.ok(seat, `a ${area} seat`);
  const [uid, s] = seat;
  os.addAgent(1);
  const ch = os.characters.get(1)!;
  ch.seatId = uid;
  s.assigned = true;
  ch.tileCol = s.seatCol;
  ch.tileRow = s.seatRow;
  ch.screen = 'code';
  os.setAgentActive(1, true);
  const glows = os.furniture.filter((f) => f.raw);
  return { glows, seat: s };
}

test('coding room: one glow, on the PC in the seat column', () => {
  const { glows, seat } = glowsFor('코딩실', Direction.UP);
  assert.equal(glows.length, 1);
  // the halo is PC_GLOW_RADIUS px left of its PC
  assert.equal(Math.floor((glows[0].x + 2) / TILE_SIZE), seat.seatCol);
});

test('server room: one glow, on the side PC the seat faces', () => {
  const { glows, seat } = glowsFor('서버실', Direction.RIGHT);
  assert.equal(glows.length, 1);
  assert.equal(Math.floor((glows[0].x + 2) / TILE_SIZE), seat.seatCol + 1);
});
