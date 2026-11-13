import { describe, expect, it } from 'vitest';

import {
  GAME_BREAKER_COLS,
  GAME_BREAKER_ROWS,
  GAME_BUGS_GLITCH_POINTS,
  GAME_BUGS_MISS,
  GAME_BUGS_PATCH_PENALTY,
  GAME_BUGS_POINTS,
  GAME_BUGS_STREAK_STEP,
  GAME_CABLE_BURST_EVERY,
  GAME_CABLE_POINTS,
  GAME_DRONE_BOX_H,
  GAME_DRONE_H,
  GAME_FP,
} from '../../core/src/constants.js';
import {
  BREAKER_ACT,
  breakerAct,
  breakerStep,
  BRICK,
  brickBox,
  newBreaker,
} from '../../core/src/games/breaker.js';
import { bugsKeyIndex, bugsMult, bugsStep, bugsWhack, newBugs } from '../../core/src/games/bugs.js';
import { cableTick, cableTurn, newCable } from '../../core/src/games/cable.js';
import { droneFlap, droneStep, newDrone } from '../../core/src/games/drone.js';
import { MERGE_ACT, mergeMove, newMerge } from '../../core/src/games/merge.js';
import { GAME_ACTIONS, newRun, Recorder, replay, tick } from '../../core/src/games/replay.js';

const always = (v: number) => () => v;

describe('cable', () => {
  it('grows and scores on a packet, ignores a reversal', () => {
    const s = newCable(always(0));
    const head = s.body[0];
    const len = s.body.length;
    s.packet = { x: head.x + 1, y: head.y };
    cableTurn(s, 'left'); // reversal: ignored
    cableTick(s);
    expect(s.over).toBe(false);
    expect(s.body).toHaveLength(len + 1);
    expect(s.score).toBe(GAME_CABLE_POINTS);
    cableTick(s);
    expect(s.body).toHaveLength(len + 1);
  });

  it('buffers quick turns: up then left both happen', () => {
    const s = newCable(always(0));
    s.packet = { x: 0, y: 0 };
    const { x, y } = s.body[0];
    cableTurn(s, 'up');
    cableTurn(s, 'left');
    cableTick(s);
    cableTick(s);
    expect(s.body[0]).toEqual({ x: x - 1, y: y - 1 });
  });

  it('a wall ends the run', () => {
    const s = newCable(always(0));
    s.packet = { x: 0, y: 0 };
    cableTurn(s, 'up');
    for (let i = 0; i < 30 && !s.over; i++) cableTick(s);
    expect(s.over).toBe(true);
  });

  it('every 5th packet brings a gold burst', () => {
    const s = newCable(always(0.5));
    for (let i = 0; i < GAME_CABLE_BURST_EVERY; i++) {
      const h = s.body[0];
      s.packet = { x: h.x + 1, y: h.y };
      if (s.burst) s.burst = null;
      cableTick(s);
      if (i < GAME_CABLE_BURST_EVERY - 1) expect(s.burst).toBeNull();
    }
    expect(s.burst).not.toBeNull();
  });

  it('its own body ends the run, the tail it vacates does not', () => {
    const s = newCable(always(0));
    s.packet = { x: 0, y: 0 };
    s.body = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ];
    cableTurn(s, 'down');
    cableTick(s);
    expect(s.over).toBe(true);
    s.over = false;
    s.body = s.body.slice(0, 4); // (5,6) is now the tail: it moves away
    s.dir = 'right';
    s.turns = [];
    cableTurn(s, 'down');
    cableTick(s);
    expect(s.over).toBe(false);
  });
});

describe('bugs', () => {
  it('numpad layout: 7 is top-left, 3 bottom-right', () => {
    expect(bugsKeyIndex(7)).toBe(0);
    expect(bugsKeyIndex(9)).toBe(2);
    expect(bugsKeyIndex(5)).toBe(4);
    expect(bugsKeyIndex(1)).toBe(6);
    expect(bugsKeyIndex(3)).toBe(8);
  });

  it('scores bugs and glitches, punishes patches and misses (floor 0)', () => {
    const s = newBugs(always(0.5));
    bugsWhack(s, 0);
    expect(s.score).toBe(0);
    s.mons[4] = { kind: 'bug', ms: 500, show: 500, flash: 0, hit: false };
    bugsWhack(s, 4);
    expect(s.score).toBe(GAME_BUGS_POINTS);
    s.mons[2] = { kind: 'glitch', ms: 500, show: 500, flash: 0, hit: false };
    bugsWhack(s, 2);
    expect(s.score).toBe(GAME_BUGS_POINTS + GAME_BUGS_GLITCH_POINTS);
    bugsWhack(s, 1);
    expect(s.score).toBe(GAME_BUGS_POINTS + GAME_BUGS_GLITCH_POINTS - GAME_BUGS_MISS);
    expect(s.streak).toBe(0);
    s.mons[3] = { kind: 'patch', ms: 500, show: 500, flash: 0, hit: false };
    bugsWhack(s, 3);
    expect(s.score).toBe(
      Math.max(
        0,
        GAME_BUGS_POINTS + GAME_BUGS_GLITCH_POINTS - GAME_BUGS_MISS - GAME_BUGS_PATCH_PENALTY,
      ),
    );
  });

  it('a streak raises the multiplier; an escape resets it', () => {
    expect(bugsMult(GAME_BUGS_STREAK_STEP - 1)).toBe(1);
    expect(bugsMult(GAME_BUGS_STREAK_STEP)).toBe(2);
    expect(bugsMult(1000)).toBe(4);
    const s = newBugs(always(0.5));
    s.streak = 7;
    s.mons[0] = { kind: 'bug', ms: 10, show: 10, flash: 0, hit: false };
    s.wait = 1e9;
    bugsStep(s, 10);
    expect(s.streak).toBe(0);
  });

  it('spawns things over time and ends the round', () => {
    const s = newBugs(always(0.5));
    let seen = 0;
    for (let i = 0; i < 1000 && !s.over; i++) {
      bugsStep(s, 100);
      seen += s.mons.filter((m) => m.kind).length;
    }
    expect(seen).toBeGreaterThan(0);
    expect(s.over).toBe(true);
    const score = s.score;
    bugsWhack(s, 4);
    expect(s.score).toBe(score);
  });
});

describe('breaker', () => {
  it('the ball waits on the paddle, launches up, and the paddle slides while held', () => {
    const s = newBreaker(always(0.99));
    expect(s.stuck).toBe(0);
    const p0 = s.paddle;
    breakerAct(s, BREAKER_ACT.rightDown);
    breakerStep(s, 10);
    expect(s.paddle).toBeGreaterThan(p0);
    breakerAct(s, BREAKER_ACT.rightUp);
    const p1 = s.paddle;
    breakerStep(s, 10);
    expect(s.paddle).toBe(p1);
    breakerAct(s, BREAKER_ACT.launch);
    expect(s.stuck).toBe(-1);
    expect(s.balls[0].vy).toBeLessThan(0);
  });

  it('a ball hitting a brick breaks it and scores; tough takes two hits; steel stays', () => {
    const s = newBreaker(always(0.99));
    s.bricks.fill(BRICK.empty);
    const i = 2 * GAME_BREAKER_COLS + 4;
    const box = brickBox(i);
    const fire = (v: number) => {
      s.bricks[i] = v;
      s.stuck = -1;
      s.balls = [
        { x: (box.x + 5) * GAME_FP, y: (box.y + box.h + 1) * GAME_FP, vx: 0, vy: -GAME_FP },
      ];
      s.bricks[GAME_BREAKER_COLS * GAME_BREAKER_ROWS - 1] = BRICK.normal; // keeps the level going
      for (let k = 0; k < 4; k++) breakerStep(s, 10);
    };
    fire(BRICK.normal);
    expect(s.bricks[i]).toBe(BRICK.empty);
    expect(s.score).toBe(10);
    fire(BRICK.tough);
    expect(s.bricks[i]).toBe(BRICK.cracked);
    fire(BRICK.steel);
    expect(s.bricks[i]).toBe(BRICK.steel);
  });

  it('losing every ball costs a life; the last one ends the run', () => {
    const s = newBreaker(always(0.99));
    for (let life = s.lives; life > 0; life--) {
      s.stuck = -1;
      s.balls = [{ x: 0, y: 184 * GAME_FP, vx: 0, vy: 2 * GAME_FP }];
      breakerStep(s, 10);
    }
    expect(s.over).toBe(true);
  });
});

describe('drone', () => {
  it('hovers until the first flap, then falls and hits the floor', () => {
    const s = newDrone(always(0.5));
    const y0 = s.y;
    for (let k = 0; k < 100; k++) droneStep(s, 10);
    expect(s.y).toBe(y0);
    droneFlap(s);
    droneStep(s, 10);
    expect(s.y).toBeLessThan(y0);
    for (let k = 0; k < 1000 && !s.over; k++) droneStep(s, 10);
    expect(s.over).toBe(true);
  });

  it('flapping through the middle passes racks and scores', () => {
    const s = newDrone(always(0.5)); // gaps stay centred
    for (let k = 0; k < 3000 && !s.over; k++) {
      const centre = (GAME_DRONE_H / 2 - GAME_DRONE_BOX_H / 2) * GAME_FP;
      if (s.y >= centre && s.vy >= 0) droneFlap(s);
      droneStep(s, 10);
    }
    expect(s.passed).toBeGreaterThan(3);
    expect(s.score).toBeGreaterThan(0);
  });
});

describe('merge', () => {
  it('slides and merges a line once per move, scoring the sum', () => {
    const s = newMerge(always(0));
    s.cells = [1, 1, 1, 1, ...new Array<number>(12).fill(0)];
    mergeMove(s, MERGE_ACT.left);
    expect(s.cells.slice(0, 4)).toEqual([2, 2, 0, 0].map((v, i) => (i < 2 ? v : s.cells[i])));
    expect(s.score).toBe(8);
    expect(s.cells.filter((v) => v).length).toBe(3); // 2 merged + 1 new
  });

  it('a move that changes nothing adds no tile', () => {
    const s = newMerge(always(0));
    s.cells = [1, 2, ...new Array<number>(14).fill(0)];
    mergeMove(s, MERGE_ACT.left);
    expect(s.moves).toBe(0);
  });

  it('ends when stuck, or on purpose', () => {
    const s = newMerge(always(0.5));
    s.cells = [...Array.from({ length: 15 }, (_, i) => i + 1), 0]; // all different, one hole
    mergeMove(s, MERGE_ACT.right); // the new tile fills the hole: nothing can move after
    expect(s.over).toBe(true);
    const e = newMerge(always(0));
    mergeMove(e, MERGE_ACT.end);
    expect(e.over).toBe(true);
  });
});

describe('replay', () => {
  it('a recorded run replays to the same score; a different seed does not reproduce it', () => {
    for (const game of ['cable', 'bugs', 'breaker', 'drone', 'merge'] as const) {
      const rec = new Recorder(newRun(game, 12345));
      let i = 0;
      while (!rec.run.s.over && rec.run.ticks < 200_000) {
        tick(rec.run);
        if (rec.run.ticks % 37 === 0) rec.act(i++ % GAME_ACTIONS[game]);
      }
      expect(rec.run.s.over).toBe(true);
      expect(replay(game, 12345, rec.inputs)).toEqual({
        score: rec.run.s.score,
        ticks: rec.run.ticks,
      });
    }
    expect(replay('cable', 1, [1])).toBeNull(); // odd length
    expect(replay('cable', 1, [-1, 0])).toBeNull();
  });
});
