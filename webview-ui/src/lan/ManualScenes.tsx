// The ? manual's animations: one looping scene per feature on a small pixel stage
// (MANUAL_STAGE_W × MANUAL_STAGE_H logical px, scaled to fit). Each scene is a pure function
// of the loop time `t` (ms) drawn with the office's own sprites (the viewer's character,
// desks, PCs, flames, screens) plus a few DOM mock-ups of the app's chrome.
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { Outfit } from '../../../core/src/messages.js';
import {
  LAN_KIND_BADGES,
  LAN_PROVIDER_BADGE_FG,
  LAN_PROVIDER_COLORS,
  MANUAL_COLORS as C,
  MANUAL_STAGE_H as H,
  MANUAL_STAGE_TICK_MS,
  MANUAL_STAGE_W as W,
  PEOPLE_FACE_CROP,
  ROOM_AREA_COLORS,
  USAGE_MODEL_COLORS,
  USAGE_TOKEN_COLORS,
} from '../constants.js';
import { DICT, t as tr } from '../i18n.js';
import { burnAuraSprite } from '../office/engine/burnAura.js';
import { type ScreenKind, screenSprite } from '../office/engine/pcScreens.js';
import { ledMask, ledSprite } from '../office/engine/serverLeds.js';
import { getCatalogEntry } from '../office/layout/furnitureCatalog.js';
import { getCachedSprite, getOutlineSprite } from '../office/sprites/spriteCache.js';
import { BUBBLE_PERMISSION_SPRITE, getCharacterSprites } from '../office/sprites/spriteData.js';
import { Direction, type SpriteData } from '../office/types.js';
import { ActIcon } from './ActIcon.js';
import type { IconId } from './actIcons.js';
import { badgeColors } from './badgeColors.js';

export interface Look {
  palette: number;
  hueShift: number;
  outfit?: Outfit;
}

type Dir = (typeof Direction)[keyof typeof Direction];

// ── Time helpers ────────────────────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 0 before `a`, 1 after `b`, linear between. */
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const on = (t: number, a: number, b: number) => t >= a && t < b;
/** Characters of `s` shown after typing for `p` (0–1). */
const typed = (s: string, p: number) => [...s].slice(0, Math.round([...s].length * p)).join('');

interface Pt {
  x: number;
  y: number;
}

/** Position and facing at progress `p` along a polyline (constant speed). */
function along(pts: Pt[], p: number): Pt & { dir: Dir } {
  const lens = pts.slice(1).map((b, i) => Math.hypot(b.x - pts[i].x, b.y - pts[i].y));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let d = clamp01(p) * total;
  for (let i = 0; i < lens.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (d <= lens[i] || i === lens.length - 1) {
      const q = lens[i] ? Math.min(1, d / lens[i]) : 1;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dir =
        Math.abs(dx) >= Math.abs(dy)
          ? dx >= 0
            ? Direction.RIGHT
            : Direction.LEFT
          : dy >= 0
            ? Direction.DOWN
            : Direction.UP;
      return { x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), dir };
    }
    d -= lens[i];
  }
  return { ...pts[pts.length - 1], dir: Direction.DOWN };
}

// ── Drawing primitives (absolute, stage px) ─────────────────

const urls = new WeakMap<SpriteData, string>();
function spriteUrl(s: SpriteData): string {
  let u = urls.get(s);
  if (!u) urls.set(s, (u = getCachedSprite(s, 1).toDataURL()));
  return u;
}

const abs = (x: number, y: number, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute',
  left: x,
  top: y,
  ...extra,
});

function Spr({
  s,
  x,
  y,
  scale = 1,
  o,
}: {
  s: SpriteData;
  x: number;
  y: number;
  scale?: number;
  o?: number;
}) {
  if (!s.length || !s[0].length) return null;
  return (
    <img
      src={spriteUrl(s)}
      alt=""
      draggable={false}
      style={abs(x, y, {
        width: s[0].length * scale,
        height: s.length * scale,
        imageRendering: 'pixelated',
        opacity: o,
        maxWidth: 'none',
      })}
    />
  );
}

function Furn({
  type,
  x,
  y,
  s,
}: {
  type: string;
  x: number;
  y: number;
  s?: (b: SpriteData) => SpriteData;
}) {
  const e = getCatalogEntry(type);
  return e ? <Spr s={s ? s(e.sprite) : e.sprite} x={x} y={y} /> : null;
}

type Pose = 'walk' | 'type' | 'read' | 'stand' | 'sit';

interface CharProps {
  look: Look;
  /** Foot point (bottom centre), like the office's character anchor. */
  x: number;
  y: number;
  pose: Pose;
  dir?: Dir;
  t: number;
  scale?: number;
  outline?: boolean;
  o?: number;
  /** Burn tier aura behind the character. */
  burn?: 0 | 1 | 2 | 3;
  bob?: number;
}

function charSprite(look: Look, pose: Pose, dir: Dir, t: number): SpriteData {
  const sp = getCharacterSprites(look.palette, look.hueShift, look.outfit);
  if (pose === 'walk') return sp.walk[dir][Math.floor(t / 130) % 4];
  if (pose === 'type') return sp.typing[dir][Math.floor(t / 300) % 2];
  if (pose === 'read') return sp.reading[dir][Math.floor(t / 400) % 2];
  return sp.walk[dir][1];
}

/** The face crop the people panel uses. */
const face = (look: Look): SpriteData =>
  charSprite(look, 'stand', Direction.DOWN, 0).slice(
    PEOPLE_FACE_CROP.top,
    PEOPLE_FACE_CROP.top + PEOPLE_FACE_CROP.rows,
  );

function Char({
  look,
  x,
  y,
  pose,
  dir = Direction.DOWN,
  t,
  scale = 1,
  outline,
  o,
  burn = 0,
  bob = 0,
}: CharProps) {
  const s = charSprite(look, pose, dir, t);
  if (!s.length) return null;
  const w = s[0].length * scale;
  const h = s.length * scale;
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h + (pose === 'type' || pose === 'sit' ? 6 : 0) - bob);
  const aura = burn ? burnAuraSprite(s, burn, Math.floor(t / 120)) : null;
  return (
    <>
      {aura && (
        <Spr
          s={aura.data}
          x={left - aura.pad * scale}
          y={top - aura.pad * scale}
          scale={scale}
          o={o}
        />
      )}
      {outline && (
        <Spr s={getOutlineSprite(s)} x={left - scale} y={top - scale} scale={scale} o={o} />
      )}
      <Spr s={s} x={left} y={top} scale={scale} o={o} />
    </>
  );
}

function Box({
  x,
  y,
  w,
  h,
  style,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div style={abs(x, y, { width: w, height: h, boxSizing: 'border-box', ...style })}>
      {children}
    </div>
  );
}

/** Wooden floor with faint plank lines. */
function Floor({
  x,
  y,
  w,
  h,
  tint,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tint?: string;
}) {
  return (
    <Box
      x={x}
      y={y}
      w={w}
      h={h}
      style={{
        background: `repeating-linear-gradient(0deg, ${C.floor} 0 7px, ${C.floorAlt} 7px 8px)`,
      }}
    >
      {tint && <div style={{ position: 'absolute', inset: 0, background: tint, opacity: 0.18 }} />}
    </Box>
  );
}

function Wall({ x, y, w, h = 14 }: { x: number; y: number; w: number; h?: number }) {
  return (
    <Box
      x={x}
      y={y}
      w={w}
      h={h}
      style={{ background: C.wall, borderTop: `3px solid ${C.wallTop}` }}
    />
  );
}

/** Small text label. */
function Txt({
  x,
  y,
  children,
  size = 6,
  color = C.text,
  bg,
  bold,
  w,
  style,
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  color?: string;
  bg?: string;
  bold?: boolean;
  w?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={abs(x, y, {
        fontSize: size,
        lineHeight: 1.25,
        color,
        background: bg,
        fontWeight: bold ? 700 : 400,
        padding: bg ? '0 2px' : undefined,
        whiteSpace: 'nowrap',
        width: w,
        overflow: w ? 'hidden' : undefined,
        textOverflow: w ? 'ellipsis' : undefined,
        ...style,
      })}
    >
      {children}
    </div>
  );
}

function Cursor({ x, y, down }: Pt & { down?: boolean }) {
  return (
    <>
      {down && (
        <div
          style={abs(x - 4, y - 4, {
            width: 8,
            height: 8,
            border: `1px solid ${C.white}`,
            borderRadius: '50%',
            opacity: 0.8,
          })}
        />
      )}
      <svg width="8" height="11" viewBox="0 0 8 11" style={abs(x, y)} shapeRendering="crispEdges">
        <path d="M0 0v9l2-2 2 4 2-1-2-4h3z" fill={C.white} stroke={C.ink} strokeWidth="0.8" />
      </svg>
    </>
  );
}

/** A slate agent bubble whose bottom centre sits at (x, y). */
function AgentBubble({ x, y, children, w = 70 }: Pt & { children: ReactNode; w?: number }) {
  return (
    <div
      style={abs(x - w / 2, y, {
        width: w,
        transform: 'translateY(-100%)',
        background: 'var(--agent-bubble-bg)',
        color: 'var(--agent-bubble-fg)',
        border: '1px solid var(--agent-bubble-border)',
        borderRadius: 3,
        padding: '1px 2px',
        fontSize: 5,
        lineHeight: 1.3,
      })}
    >
      {children}
    </div>
  );
}

function ChatBubble({ x, y, children }: Pt & { children: ReactNode }) {
  return (
    <div
      style={abs(x, y, {
        transform: 'translate(-50%, -100%)',
        background: C.chatBg,
        color: C.ink,
        border: `1px solid ${C.ink}`,
        borderRadius: 6,
        padding: '1px 4px',
        fontSize: 6,
        whiteSpace: 'nowrap',
      })}
    >
      {children}
    </div>
  );
}

function Provider({ name = 'Claude' }: { name?: 'Claude' | 'Codex' }) {
  return (
    <span
      style={{
        background: LAN_PROVIDER_COLORS[name === 'Claude' ? 'claude' : 'codex'],
        color: LAN_PROVIDER_BADGE_FG,
        padding: '0 1px',
        fontWeight: 700,
        fontSize: 4.5,
      }}
    >
      {name}
    </span>
  );
}

function Icon({ id, size = 5, color }: { id: IconId; size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <ActIcon icon={id} size={size} color={color} />
    </span>
  );
}

function Tag({
  x,
  y,
  kind = 'main',
  num = 1,
  name,
  extra,
}: Pt & { kind?: 'main' | 'subagent' | 'shell'; num?: number; name: string; extra?: ReactNode }) {
  return (
    <div
      style={abs(x, y, {
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        fontSize: 4.5,
        whiteSpace: 'nowrap',
        background: 'var(--avatar-tag-bg)',
        color: 'var(--avatar-tag-fg)',
        padding: '0 1px',
      })}
    >
      <span style={{ ...badgeColors(kind), padding: '0 1px', fontWeight: 700 }}>
        {LAN_KIND_BADGES[kind].text}
      </span>
      <span>#{num}</span>
      <span>{name}</span>
      {extra}
    </div>
  );
}

/** Mock-up chrome: a pixel panel. */
function Panel({
  x,
  y,
  w,
  h,
  children,
  style,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Box
      x={x}
      y={y}
      w={w}
      h={h}
      style={{
        background: C.panel,
        border: `1px solid ${C.panelLine}`,
        boxShadow: `1px 1px 0 ${C.ink}`,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </Box>
  );
}

function Btn({
  x,
  y,
  w = 12,
  h = 12,
  active,
  children,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      x={x}
      y={y}
      w={w}
      h={h}
      style={{
        background: active ? C.accent : C.panel,
        border: `1px solid ${C.panelLine}`,
        color: C.text,
        fontSize: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `1px 1px 0 ${C.ink}`,
      }}
    >
      {children}
    </Box>
  );
}

/** A desk with two PCs and the chairs below it; `screens` paints what each PC shows. */
function Desk({
  x,
  y,
  t,
  screens,
}: Pt & { t: number; screens?: [ScreenKind | null, ScreenKind | null] }) {
  const pc = (i: 0 | 1) => {
    const k = screens?.[i];
    if (!k) return <Furn type="PC_FRONT_OFF" x={x + i * 32} y={y} />;
    const base = getCatalogEntry('PC_FRONT_ON_1');
    return base ? (
      <Spr s={screenSprite(base.sprite, k, Math.floor(t / 800))} x={x + i * 32} y={y} />
    ) : null;
  };
  return (
    <>
      <Furn type="DESK_FRONT" x={x} y={y} />
      {pc(0)}
      {pc(1)}
    </>
  );
}
const Chair = ({ x, y }: Pt) => <Furn type="CUSHIONED_CHAIR_BACK" x={x} y={y} />;

/** Desk at (x, y) with someone typing at its left (seat 0) or right (seat 1) chair. */
function Workstation({
  x,
  y,
  t,
  people,
  screens,
}: Pt & {
  t: number;
  people: Array<{
    look: Look;
    seat: 0 | 1;
    pose?: Pose;
    outline?: boolean;
    burn?: 0 | 1 | 2 | 3;
  } | null>;
  screens?: [ScreenKind | null, ScreenKind | null];
}) {
  return (
    <>
      <Desk x={x} y={y} t={t} screens={screens} />
      {people.map(
        (p, i) =>
          p && (
            <Char
              key={i}
              look={p.look}
              x={x + 8 + p.seat * 32}
              y={y + 40}
              pose={p.pose ?? 'type'}
              dir={Direction.UP}
              t={t}
              outline={p.outline}
              burn={p.burn}
            />
          ),
      )}
      <Chair x={x} y={y + 32} />
      <Chair x={x + 32} y={y + 32} />
    </>
  );
}

// ── Scenes ──────────────────────────────────────────────────

interface Scene {
  period: number;
  draw: (t: number, me: Look, others: Look[]) => ReactNode;
}

const ROOMS = [
  { room: 'coding', x: 2, y: 2 },
  { room: 'server', x: 98, y: 2 },
  { room: 'library', x: 2, y: 58 },
  { room: 'lounge', x: 98, y: 58 },
] as const;
const ROOM_W = 92;
const ROOM_H = 52;

function MiniMap({ hi }: { hi?: string }) {
  return (
    <>
      <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
      {ROOMS.map((r) => (
        <Box
          key={r.room}
          x={r.x}
          y={r.y}
          w={ROOM_W}
          h={ROOM_H}
          style={{ outline: hi === r.room ? `1px solid ${C.white}` : undefined }}
        >
          <Floor x={0} y={0} w={ROOM_W} h={ROOM_H} tint={ROOM_AREA_COLORS[r.room]} />
          <Wall x={0} y={0} w={ROOM_W} h={8} />
          <Txt x={2} y={9} bg={C.panel} bold>
            {tr(`room.${r.room}`)}
          </Txt>
        </Box>
      ))}
    </>
  );
}

const roomCentre = (room: string): Pt => {
  const r = ROOMS.find((q) => q.room === room)!;
  return { x: r.x + ROOM_W / 2, y: r.y + ROOM_H - 6 };
};

/** One per manual entry (manual.test checks the keys against MANUAL). */
const scenes: Record<string, Scene> = {
  office: {
    period: 7000,
    draw: (t, me, o) => {
      const walk = seg(t, 0, 2200);
      const p = along(
        [
          { x: 200, y: 104 },
          { x: 40, y: 104 },
          { x: 40, y: 80 },
        ],
        walk,
      );
      const seated = walk >= 1;
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={22} />
          <Furn type="BOOKSHELF" x={128} y={6} />
          <Furn type="LARGE_PAINTING" x={70} y={2} />
          <Furn type="LARGE_PLANT" x={160} y={48} />
          <Workstation
            x={24}
            y={40}
            t={t}
            screens={[seated ? 'code' : null, 'term']}
            people={[seated ? { look: me, seat: 0 } : null, { look: o[0], seat: 1 }]}
          />
          {!seated && <Char look={me} x={p.x} y={p.y} pose="walk" dir={p.dir} t={t} />}
          {seated && (
            <AgentBubble x={40} y={44} w={78}>
              <Provider /> <Icon id="edit" />{' '}
              {typed(tr('act.edit', { t: 'app.ts' }), seg(t, 2300, 3300))}
            </AgentBubble>
          )}
          <AgentBubble x={72} y={30} w={74}>
            <Provider name="Codex" /> <Icon id="run" /> npm test
          </AgentBubble>
        </>
      );
    },
  },

  rooms: {
    period: 8000,
    draw: (t, me) => {
      const order = ['lounge', 'coding', 'library', 'server', 'lounge'] as const;
      const i = Math.floor(t / 2000);
      const local = t - i * 2000;
      const from = roomCentre(order[i]);
      const to = roomCentre(order[i + 1]);
      const p = along([from, to], seg(local, 0, 900));
      const arrived = local >= 900;
      const room = arrived ? order[i + 1] : order[i];
      const pose: Pose = !arrived
        ? 'walk'
        : room === 'library'
          ? 'read'
          : room === 'lounge'
            ? 'stand'
            : 'type';
      const act: Record<string, ReactNode> = {
        coding: (
          <>
            <Icon id="edit" /> {tr('act.edit', { t: 'app.ts' })}
          </>
        ),
        library: (
          <>
            <Icon id="read" /> {tr('act.read', { t: 'README.md' })}
          </>
        ),
        server: (
          <>
            <Icon id="run" /> {tr('act.run', { t: 'npm test' })}
          </>
        ),
        lounge: <>{tr('act.ask')}</>,
      };
      return (
        <>
          <MiniMap hi={room} />
          <Char
            look={me}
            x={p.x}
            y={p.y}
            pose={pose}
            dir={arrived ? Direction.DOWN : p.dir}
            t={t}
          />
          {arrived && (
            <AgentBubble x={p.x} y={p.y - 34} w={82}>
              {act[room]}
            </AgentBubble>
          )}
        </>
      );
    },
  },

  serverZones: {
    period: 8000,
    draw: (t, me) => {
      const zones = [
        { z: 'test', x: 48, y: 50, cmd: 'vitest' },
        { z: 'build', x: 144, y: 50, cmd: 'tsc -b' },
        { z: 'git', x: 48, y: 104, cmd: 'git push' },
        { z: 'run', x: 144, y: 104, cmd: 'node app.js' },
      ] as const;
      const i = Math.floor(t / 2000) % 4;
      const local = t % 2000;
      const prev = zones[(i + 3) % 4];
      const cur = zones[i];
      const p = along(
        [
          { x: prev.x - 16, y: prev.y },
          { x: cur.x - 16, y: cur.y },
        ],
        seg(local, 0, 800),
      );
      const arrived = local >= 800;
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.server} />
          <Box
            x={0}
            y={57}
            w={W}
            h={2}
            style={{
              background: `repeating-linear-gradient(90deg, ${C.tape} 0 8px, transparent 8px 12px)`,
            }}
          />
          <Box
            x={95}
            y={0}
            w={2}
            h={H}
            style={{
              background: `repeating-linear-gradient(0deg, ${C.tape} 0 8px, transparent 8px 12px)`,
            }}
          />
          {zones.map((z, k) => (
            <span key={z.z}>
              <Txt
                x={k % 2 ? 150 : 54}
                y={k < 2 ? 2 : 60}
                bg={C.panel}
                bold
                color={k === i ? C.gold : C.text}
              >
                {tr(`zone.${z.z}`)}
              </Txt>
              <Spr
                s={(() => {
                  const e = getCatalogEntry('PC_SIDE');
                  return e
                    ? k === i && arrived
                      ? ledSprite(e.sprite, ledMask(k, 0, Math.floor(t / 150)))
                      : e.sprite
                    : [];
                })()}
                x={z.x - 8}
                y={z.y - 26}
              />
            </span>
          ))}
          <Char
            look={me}
            x={p.x}
            y={p.y}
            pose={arrived ? 'type' : 'walk'}
            dir={arrived ? Direction.RIGHT : p.dir}
            t={t}
          />
          {arrived && (
            <AgentBubble x={cur.x - 16} y={cur.y - 32} w={60}>
              <Icon id="run" /> {cur.cmd}
            </AgentBubble>
          )}
        </>
      );
    },
  },

  roomPlates: {
    period: 6000,
    draw: (t, me, o) => {
      const c = along(
        [
          { x: 170, y: 100 },
          { x: 30, y: 20 },
        ],
        seg(t, 300, 1500),
      );
      const open = t > 1600;
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.coding} />
          <Wall x={0} y={0} w={W} h={10} />
          <Workstation
            x={24}
            y={34}
            t={t}
            screens={['code', 'code']}
            people={[
              { look: me, seat: 0 },
              { look: o[0], seat: 1 },
            ]}
          />
          <Workstation
            x={112}
            y={34}
            t={t}
            screens={['code', null]}
            people={[{ look: o[1], seat: 0 }]}
          />
          <Txt x={4} y={13} bg={C.panel} bold size={6}>
            {tr('room.coding')}{' '}
            <span style={{ background: C.accent, padding: '0 2px' }}>
              {tr('plate.agents', { n: '3' })}
            </span>
          </Txt>
          {open && (
            <Panel x={8} y={24} w={110} h={56}>
              <Txt x={3} y={2} color={C.muted} size={5} w={104}>
                {tr('legend.coding')}
              </Txt>
              {[me, o[0], o[1]].map((l, k) => (
                <div
                  key={k}
                  style={abs(3, 14 + k * 13, {
                    display: 'flex',
                    gap: 2,
                    alignItems: 'center',
                    fontSize: 5,
                    color: C.text,
                    opacity: seg(t, 1700 + k * 250, 2000 + k * 250),
                  })}
                >
                  <span style={{ ...badgeColors('main'), padding: '0 1px', fontWeight: 700 }}>
                    MAIN
                  </span>
                  #{k + 1}
                  <Provider /> <Icon id="edit" />{' '}
                  {tr('act.edit', { t: ['app.ts', 'api.ts', 'db.ts'][k] })}
                  <span style={{ display: 'none' }}>{l.palette}</span>
                </div>
              ))}
            </Panel>
          )}
          <Cursor x={c.x} y={c.y} />
        </>
      );
    },
  },

  map: {
    period: 7000,
    draw: (t, me) => {
      const zoomIn = seg(t, 600, 1800);
      const pan = seg(t, 2200, 3600);
      const back = seg(t, 4600, 5200);
      const z = lerp(1, 1.8, zoomIn) * (1 - back) + back;
      const px = lerp(0, -40, pan) * (1 - back);
      const py = lerp(0, -20, pan) * (1 - back);
      const cur =
        t < 2200
          ? { x: 96, y: 56 }
          : t < 3600
            ? along(
                [
                  { x: 96, y: 56 },
                  { x: 56, y: 36 },
                ],
                pan,
              )
            : t < 4600
              ? along(
                  [
                    { x: 56, y: 36 },
                    { x: 30, y: 6 },
                  ],
                  seg(t, 3700, 4500),
                )
              : { x: 30, y: 6 };
      return (
        <>
          <div style={abs(0, 0, { width: W, height: H, overflow: 'hidden' })}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: '96px 56px',
                transform: `translate(${px}px, ${py}px) scale(${z})`,
              }}
            >
              <MiniMap />
              <Char
                look={me}
                x={roomCentre('coding').x}
                y={roomCentre('coding').y}
                pose="type"
                dir={Direction.DOWN}
                t={t}
              />
            </div>
          </div>
          <Btn x={4} y={2}>
            ⛶
          </Btn>
          <Btn x={18} y={2} active={on(t, 600, 1800)}>
            +
          </Btn>
          <Btn x={32} y={2}>
            −
          </Btn>
          {on(t, 600, 1800) && (
            <Txt x={84} y={4} bg={C.panel} size={7} bold>
              {z.toFixed(1)}x
            </Txt>
          )}
          <Cursor x={cur.x} y={cur.y} down={on(t, 2200, 3600) || on(t, 4500, 4800)} />
        </>
      );
    },
  },

  theme: {
    period: 6000,
    draw: (t, me) => {
      const light = on(t, 1500, 4500);
      const bg = light ? C.lightBg : C.void;
      const panel = light ? C.lightPanel : C.panel;
      const line = light ? C.lightLine : C.panelLine;
      const fg = light ? C.lightText : C.text;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: bg, transition: 'background 0.3s' }} />
          <Box x={40} y={24} w={112} h={80}>
            <Floor x={0} y={0} w={112} h={80} />
            <Wall x={0} y={0} w={112} h={10} />
            <Workstation
              x={30}
              y={20}
              t={t}
              screens={['code', null]}
              people={[{ look: me, seat: 0 }]}
            />
          </Box>
          {[0, 1, 2].map((k) => (
            <Box
              key={k}
              x={4 + k * 14}
              y={4}
              w={12}
              h={12}
              style={{
                background: k === 2 && on(t, 1200, 1500) ? C.accent : panel,
                border: `1px solid ${line}`,
                color: fg,
                fontSize: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {k === 2 ? (light ? '☾' : '☀') : k === 0 ? '▦' : '⚙'}
            </Box>
          ))}
          <Box
            x={140}
            y={4}
            w={48}
            h={60}
            style={{ background: panel, border: `1px solid ${line}` }}
          >
            <Txt x={3} y={2} color={fg} bold>
              {tr('people.title', { n: '3' })}
            </Txt>
            {[0, 1, 2].map((k) => (
              <Box
                key={k}
                x={3}
                y={14 + k * 12}
                w={40}
                h={8}
                style={{ background: line, opacity: 0.6 }}
              />
            ))}
          </Box>
          <Cursor x={34} y={12} down={on(t, 1200, 1500) || on(t, 4200, 4500)} />
        </>
      );
    },
  },

  language: {
    period: 6000,
    draw: (t, me) => {
      const lang = on(t, 2000, 5000) ? 'en' : 'ko';
      const d = DICT[lang];
      return (
        <>
          <MiniMap />
          <Box x={0} y={0} w={W} h={H} style={{ background: C.dim }} />
          <Panel x={30} y={20} w={132} h={30}>
            <Txt x={4} y={4} bold>
              {tr('settings.language')}
            </Txt>
            <Box
              x={84}
              y={3}
              w={42}
              h={10}
              style={{
                background: C.void,
                border: `1px solid ${C.panelLine}`,
                color: C.text,
                fontSize: 6,
                padding: '0 2px',
              }}
            >
              {lang === 'ko' ? '한국어' : 'English'} ▾
            </Box>
            <Txt x={4} y={17} color={C.muted} size={5}>
              {d['room.coding']} · {d['room.library']} · {d['room.server']} · {d['room.lounge']}
            </Txt>
          </Panel>
          <Char look={me} x={60} y={100} pose="type" dir={Direction.DOWN} t={t} />
          <AgentBubble x={60} y={66} w={80}>
            <Provider /> <Icon id="edit" /> {d['act.edit'].replace('{t}', 'app.ts')}
          </AgentBubble>
          <Cursor x={150} y={30} down={on(t, 1800, 2000) || on(t, 4800, 5000)} />
        </>
      );
    },
  },

  agentTags: {
    period: 6000,
    draw: (t, me) => {
      const hi = Math.floor(t / 2000) % 3;
      const name = tr('tour.demo.a');
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={12} />
          {(['main', 'subagent', 'shell'] as const).map((k, i) => (
            <span key={k}>
              <Char
                look={me}
                x={40 + i * 56}
                y={74}
                pose={i === 2 ? 'stand' : 'type'}
                dir={Direction.DOWN}
                t={t}
                outline={i === hi}
              />
              <Tag
                x={40 + i * 56}
                y={78}
                kind={k}
                num={1}
                name={name}
                extra={
                  k === 'main' ? (
                    <span style={{ background: 'var(--ctx-fill)', padding: '0 1px' }}>29%</span>
                  ) : undefined
                }
              />
            </span>
          ))}
          <Txt
            x={W / 2}
            y={96}
            size={6}
            bold
            style={{ transform: 'translateX(-50%)' }}
            bg={C.panel}
          >
            {['MAIN', 'SUB', 'SHELL'][hi]} ={' '}
            {[tr('manual.demo.main'), tr('manual.demo.sub'), tr('manual.demo.shell')][hi]}
          </Txt>
        </>
      );
    },
  },

  agentBubble: {
    period: 8000,
    draw: (t, me) => {
      const mins = Math.min(12, 1 + Math.floor(t / 600));
      const hover = t > 5000;
      const c = along(
        [
          { x: 180, y: 108 },
          { x: 64, y: 70 },
        ],
        seg(t, 4200, 5000),
      );
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={14} />
          <Workstation
            x={48}
            y={50}
            t={t}
            screens={['code', null]}
            people={[{ look: me, seat: 0 }]}
          />
          <AgentBubble x={64} y={44} w={hover ? 120 : 96}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Provider /> <Icon id="edit" />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                {tr('manual.demo.title')}
              </span>
              <span style={{ background: 'var(--todo-fill)', color: C.ink, padding: '0 1px' }}>
                {Math.min(7, 1 + Math.floor(t / 1200))}/7
              </span>
              <span style={{ color: mins >= 8 ? 'var(--elapsed-warn-fg)' : undefined }}>
                {tr('elapsed.m', { m: String(mins) })}
              </span>
            </div>
            <div>{typed(tr('act.edit', { t: 'src/auth/login.ts' }), seg(t, 300, 1500))}</div>
            {hover && <div style={{ color: C.muted }}>{tr('room.coding')} · +24 −6 · ctx 29%</div>}
          </AgentBubble>
          <Cursor x={c.x} y={c.y} />
        </>
      );
    },
  },

  family: {
    period: 8000,
    draw: (t, me) => {
      const walk = seg(t, 300, 2300);
      const p = along(
        [
          { x: 200, y: 104 },
          { x: 104, y: 104 },
          { x: 104, y: 92 },
        ],
        walk,
      );
      const talking = on(t, 3500, 7000);
      const childSeated = walk >= 1 && !talking;
      const bobA = talking && Math.floor(t / 400) % 2 === 0 ? 1 : 0;
      const bobB = talking && Math.floor(t / 400) % 2 === 1 ? 1 : 0;
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={14} />
          <Desk
            x={56}
            y={44}
            t={t}
            screens={[talking ? null : 'code', childSeated ? 'doc' : null]}
          />
          {!talking && <Char look={me} x={64} y={84} pose="type" dir={Direction.UP} t={t} />}
          {childSeated && <Char look={me} x={96} y={84} pose="type" dir={Direction.UP} t={t} />}
          {walk < 1 && <Char look={me} x={p.x} y={p.y} pose="walk" dir={p.dir} t={t} />}
          <Chair x={56} y={76} />
          <Chair x={88} y={76} />
          {talking && (
            <>
              <Char look={me} x={120} y={104} pose="stand" dir={Direction.RIGHT} t={t} bob={bobA} />
              <Char look={me} x={142} y={104} pose="stand" dir={Direction.LEFT} t={t} bob={bobB} />
              <ChatBubble x={bobA ? 120 : 142} y={68}>
                …
              </ChatBubble>
              <Tag x={120} y={106} kind="main" name="" />
              <Tag x={142} y={106} kind="subagent" name="" />
            </>
          )}
        </>
      );
    },
  },

  waiting: {
    period: 6000,
    draw: (t, me) => {
      const walk = seg(t, 0, 1600);
      const p = along(
        [
          { x: 24, y: 96 },
          { x: 96, y: 96 },
        ],
        walk,
      );
      const merged = t > 1900;
      const bob = Math.floor(t / 300) % 2;
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.lounge} />
          <Wall x={0} y={0} w={W} h={14} />
          <Furn type="SOFA_FRONT" x={130} y={40} />
          <Furn type="LARGE_PLANT" x={160} y={50} />
          <Char look={me} x={104} y={96} pose="stand" dir={Direction.DOWN} t={t} />
          {!merged && (
            <Char
              look={me}
              x={p.x}
              y={p.y}
              pose="walk"
              dir={p.dir}
              t={t}
              o={1 - seg(t, 1600, 1900)}
            />
          )}
          {merged && <Spr s={BUBBLE_PERMISSION_SPRITE} x={100} y={50 - bob} scale={1} />}
          <Txt x={104} y={100} size={5} bg={C.panel} style={{ transform: 'translateX(-50%)' }}>
            {tr('act.ask')}
          </Txt>
        </>
      );
    },
  },

  effects: {
    period: 8000,
    draw: (t, me) => {
      const k = Math.floor(t / 2000);
      const l = t % 2000;
      const head = { x: 64, y: 40 };
      const flash = k === 1 && Math.floor(l / 200) % 2 === 0;
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={14} />
          <Workstation
            x={48}
            y={54}
            t={t}
            screens={['code', k === 1 ? 'term' : null]}
            people={[{ look: me, seat: 0 }]}
          />
          {flash && (
            <Box x={48} y={54} w={16} h={22} style={{ background: C.fail, opacity: 0.55 }} />
          )}
          {k === 0 && (
            <Txt
              x={head.x}
              y={head.y - seg(l, 0, 1500) * 22}
              size={8}
              bold
              style={{
                opacity: 1 - seg(l, 1100, 1800),
                transform: 'translateX(-50%)',
                textShadow: `1px 1px 0 ${C.ink}`,
              }}
            >
              <span style={{ color: C.ok }}>+12</span> <span style={{ color: C.fail }}>−3</span>
            </Txt>
          )}
          {k === 1 &&
            [0, 1, 2].map((i) => (
              <Box
                key={i}
                x={50 + i * 5}
                y={46 - seg(l, i * 200, 1400 + i * 200) * 26}
                w={6 + i * 2}
                h={6 + i * 2}
                style={{
                  background: C.smoke,
                  borderRadius: '50%',
                  opacity: 0.8 - seg(l, i * 200, 1400 + i * 200) * 0.8,
                }}
              />
            ))}
          {k === 1 && (
            <Box
              x={78}
              y={52}
              w={3}
              h={4}
              style={{
                background: 'var(--fail-drop)',
                borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
              }}
            />
          )}
          {k === 2 &&
            Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2;
              const r = seg(l, 0, 900) * 34;
              return (
                <Box
                  key={i}
                  x={head.x + Math.cos(a) * r}
                  y={head.y + Math.sin(a) * r + seg(l, 600, 2000) * 16}
                  w={3}
                  h={3}
                  style={{
                    background: C.confetti[i % C.confetti.length],
                    opacity: 1 - seg(l, 1400, 2000),
                  }}
                />
              );
            })}
          {k === 3 && (
            <Txt
              x={head.x}
              y={head.y - seg(l, 0, 1500) * 22}
              size={8}
              bold
              style={{
                opacity: 1 - seg(l, 1100, 1800),
                transform: 'translateX(-50%)',
                textShadow: `1px 1px 0 ${C.ink}`,
              }}
            >
              📦 +82k
            </Txt>
          )}
          <Txt x={140} y={20} bg={C.panel} size={6}>
            {
              [
                tr('manual.demo.fxDiff'),
                tr('manual.demo.fxFail'),
                tr('manual.demo.fxDone'),
                tr('manual.demo.fxBig'),
              ][k]
            }
          </Txt>
        </>
      );
    },
  },

  heat: {
    period: 8000,
    draw: (t, me) => {
      const k = Math.floor(t / 2000);
      const scale = [1, 1.5, 2, 2][k];
      const burn = ([0, 1, 2, 3] as const)[k];
      const tokens = ['120k', '450k', '1.1M', '1.4M · Σ1.9M'][k];
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.coding} />
          <Wall x={0} y={0} w={W} h={12} />
          <Char
            look={me}
            x={70}
            y={92}
            pose="stand"
            dir={Direction.DOWN}
            t={t}
            scale={scale}
            burn={burn}
          />
          <div
            style={abs(70, 95, {
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 1,
              fontSize: 5,
              whiteSpace: 'nowrap',
              background: 'var(--avatar-tag-bg)',
              color: 'var(--avatar-tag-fg)',
              padding: '0 1px',
            })}
          >
            <span style={{ ...badgeColors('main'), padding: '0 1px', fontWeight: 700 }}>MAIN</span>
            #1
            <span style={{ color: USAGE_MODEL_COLORS.opus, fontWeight: 700 }}>Opus</span>
            <span>{tokens}</span>
          </div>
          <Panel x={124} y={20} w={64} h={52}>
            {[
              ['1×', '—'],
              ['1.5×', '300k+'],
              ['2×', '1M+'],
            ].map(([a, b], i) => (
              <Txt
                key={a}
                x={3}
                y={2 + i * 8}
                size={5}
                color={i === Math.min(2, k) ? C.gold : C.muted}
              >
                {a} {b}
              </Txt>
            ))}
            {[
              [C.blue, '15k/min'],
              [C.gold, '40k/min'],
              [C.red, '75k/min'],
            ].map(([c, s], i) => (
              <Txt key={s} x={3} y={28 + i * 8} size={5} color={i + 1 === burn ? c : C.muted}>
                ■ {s}
              </Txt>
            ))}
          </Panel>
          {k === 3 && (
            <Txt x={124} y={80} bg={C.panel} size={6}>
              ❄ {`4:${String(59 - Math.floor((t % 2000) / 100)).padStart(2, '0')}`}
            </Txt>
          )}
        </>
      );
    },
  },

  pcScreens: {
    period: 6000,
    draw: (t, me, o) => {
      const leds = getCatalogEntry('PC_SIDE');
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={12} />
          <Workstation
            x={8}
            y={30}
            t={t}
            screens={['code', 'term']}
            people={[
              { look: me, seat: 0 },
              { look: o[0], seat: 1 },
            ]}
          />
          <Workstation
            x={70}
            y={30}
            t={t}
            screens={['doc', null]}
            people={[{ look: o[1], seat: 0, pose: 'read' }]}
          />
          <Txt x={8} y={16} size={5} bg={C.panel}>
            {tr('manual.demo.code')}
          </Txt>
          <Txt x={40} y={22} size={5} bg={C.panel}>
            {tr('manual.demo.term')}
          </Txt>
          <Txt x={70} y={16} size={5} bg={C.panel}>
            {tr('manual.demo.doc')}
          </Txt>
          {leds &&
            [0, 1, 2].map((i) => (
              <Spr
                key={i}
                s={ledSprite(leds.sprite, ledMask(i, 1, Math.floor(t / 150)))}
                x={148 + (i % 2) * 18}
                y={40 + i * 20}
              />
            ))}
          <Txt x={146} y={20} size={5} bg={C.panel}>
            LED
          </Txt>
        </>
      );
    },
  },

  othersBubbles: {
    period: 7000,
    draw: (t, me, o) => {
      const hidden = on(t, 1500, 5600);
      const hover = on(t, 3000, 4500);
      const cur =
        t < 1500
          ? along(
              [
                { x: 120, y: 90 },
                { x: 10, y: 8 },
              ],
              seg(t, 200, 1300),
            )
          : t < 3000
            ? along(
                [
                  { x: 10, y: 8 },
                  { x: 128, y: 80 },
                ],
                seg(t, 2000, 2900),
              )
            : t < 5000
              ? { x: 128, y: 80 }
              : along(
                  [
                    { x: 128, y: 80 },
                    { x: 10, y: 8 },
                  ],
                  seg(t, 4600, 5400),
                );
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={24} />
          <Workstation
            x={24}
            y={50}
            t={t}
            screens={['code', null]}
            people={[{ look: me, seat: 0 }]}
          />
          <Workstation
            x={112}
            y={50}
            t={t}
            screens={['term', null]}
            people={[{ look: o[0], seat: 0 }]}
          />
          <AgentBubble x={40} y={44} w={64}>
            <Provider /> <Icon id="edit" /> app.ts
          </AgentBubble>
          {(!hidden || hover) && (
            <AgentBubble x={128} y={44} w={64}>
              <Provider name="Codex" /> <Icon id="run" /> {tr('act.quiet')}
            </AgentBubble>
          )}
          <Btn x={2} y={2} active={hidden}>
            💬
          </Btn>
          {hidden && (
            <Box
              x={3}
              y={8}
              w={12}
              h={1}
              style={{ background: C.text, transform: 'rotate(-45deg)' }}
            />
          )}
          <Cursor x={cur.x} y={cur.y} down={on(t, 1300, 1500) || on(t, 5400, 5600)} />
        </>
      );
    },
  },

  transcript: {
    period: 9000,
    draw: (t, me) => {
      const cur = along(
        [
          { x: 170, y: 100 },
          { x: 40, y: 80 },
        ],
        seg(t, 0, 900),
      );
      const open = t > 1100;
      const lines = Math.floor(seg(t, 1300, 6000) * 6);
      const rows: Array<[string, string]> = [
        ['user', tr('manual.demo.prompt')],
        ['reply', tr('manual.demo.reply')],
        ['tool', 'Read src/auth/login.ts'],
        ['tool', 'Edit src/auth/login.ts'],
        ['reply', tr('manual.demo.reply2')],
        ['user', tr('manual.demo.prompt2')],
      ];
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={14} />
          <Workstation
            x={24}
            y={44}
            t={t}
            screens={['code', null]}
            people={[{ look: me, seat: 0, outline: open }]}
          />
          {open && (
            <Panel x={lerp(W, 88, seg(t, 1100, 1500))} y={4} w={100} h={104}>
              <Box
                x={0}
                y={0}
                w={100}
                h={9}
                style={{ background: C.void, borderBottom: `1px solid ${C.panelLine}` }}
              >
                <Txt x={2} y={1} size={5} bold>
                  MAIN #1 · {tr('manual.demo.title')}
                </Txt>
              </Box>
              <Txt x={2} y={10} size={4.5} color="var(--transcript-status-working)">
                ● {tr('act.edit', { t: 'login.ts' })} · 29%
              </Txt>
              <div style={abs(2, 17, { display: 'flex', gap: 0.5 })}>
                {Array.from({ length: 30 }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 2.4,
                      height: 3,
                      background: `var(--strip-${['read', 'edit', 'run', 'think', 'edit', 'fail'][(i * 7) % 6]})`,
                      opacity: i > 30 - lines * 5 ? 1 : 0.15,
                    }}
                  />
                ))}
              </div>
              {rows.slice(0, lines).map(([k, s], i) => (
                <div
                  key={i}
                  style={abs(2, 23 + i * 13, {
                    width: 88,
                    fontSize: 4.5,
                    color: C.text,
                    padding: '1px 2px',
                    boxSizing: 'border-box',
                    background:
                      k === 'user'
                        ? 'var(--transcript-user-bg)'
                        : k === 'tool'
                          ? 'var(--transcript-code-bg)'
                          : undefined,
                    borderLeft:
                      k === 'user' ? '1px solid var(--transcript-user-border)' : undefined,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  })}
                >
                  {k === 'tool' && <Icon id={s.startsWith('Edit') ? 'edit' : 'read'} size={4} />}{' '}
                  {s}
                </div>
              ))}
              <Box x={93} y={22} w={5} h={80} style={{ background: C.void }}>
                {Array.from({ length: lines }, (_, i) => (
                  <Box
                    key={i}
                    x={0}
                    y={4 + i * 12}
                    w={5}
                    h={2}
                    style={{
                      background:
                        rows[i][0] === 'user'
                          ? 'var(--strip-user)'
                          : rows[i][0] === 'tool'
                            ? 'var(--strip-edit)'
                            : 'var(--strip-think)',
                    }}
                  />
                ))}
              </Box>
            </Panel>
          )}
          <Cursor x={cur.x} y={cur.y} down={on(t, 900, 1100)} />
        </>
      );
    },
  },

  shellOutput: {
    period: 7000,
    draw: (t, me) => {
      const out = [
        '$ npm test',
        '',
        ' ✓ auth.test.ts (12)',
        ' ✓ api.test.ts (30)',
        '',
        ' Tests  42 passed',
      ];
      const n = Math.floor(seg(t, 1400, 5000) * out.length);
      const cur = along(
        [
          { x: 170, y: 100 },
          { x: 40, y: 70 },
        ],
        seg(t, 0, 900),
      );
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.server} />
          <Char
            look={me}
            x={40}
            y={96}
            pose="stand"
            dir={Direction.DOWN}
            t={t}
            outline={t > 1100}
          />
          <Tag x={40} y={98} kind="shell" name={tr('tour.demo.a')} />
          {t > 1100 && (
            <Box
              x={78}
              y={10}
              w={108}
              h={92}
              style={{
                background: C.term,
                border: `1px solid ${C.panelLine}`,
                fontSize: 5.5,
                color: C.termText,
                padding: 3,
                whiteSpace: 'pre',
              }}
            >
              {out.slice(0, n).join('\n')}
              {Math.floor(t / 400) % 2 === 0 && '▌'}
            </Box>
          )}
          <Cursor x={cur.x} y={cur.y} down={on(t, 900, 1100)} />
        </>
      );
    },
  },

  usage: {
    period: 7000,
    draw: (t) => {
      const g = seg(t, 300, 3000);
      const days = [3, 5, 2, 7, 6, 9, 4];
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Btn x={2} y={2} active>
            📊
          </Btn>
          <Panel x={2} y={16} w={186} h={94}>
            <Txt x={4} y={2} bold>
              {tr('usage.now')} · {tr('usage.today', { n: `${(g * 2.4).toFixed(1)}M` })}
            </Txt>
            {[
              tr('usage.kpi.billable'),
              tr('usage.tok.cacheRead'),
              tr('usage.kpi.hit'),
              tr('usage.kpi.sessions'),
            ].map((k, i) => (
              <Box
                key={k}
                x={4 + i * 45}
                y={12}
                w={42}
                h={20}
                style={{ border: `1px solid ${C.panelLine}` }}
              >
                <Txt x={2} y={1} size={4.5} color={C.muted} w={38}>
                  {k}
                </Txt>
                <Txt x={2} y={8} size={7} bold>
                  {
                    [
                      `${(g * 18.2).toFixed(1)}M`,
                      `${(g * 310).toFixed(0)}M`,
                      `${Math.round(g * 94)}%`,
                      String(Math.round(g * 57)),
                    ][i]
                  }
                </Txt>
              </Box>
            ))}
            {days.map((d, i) => {
              const h = d * 5 * seg(t, 600 + i * 150, 1600 + i * 150);
              return (
                <div
                  key={i}
                  style={abs(12 + i * 24, 88 - h, {
                    width: 14,
                    height: h,
                    display: 'flex',
                    flexDirection: 'column',
                  })}
                >
                  <div style={{ flex: 2, background: USAGE_TOKEN_COLORS.input }} />
                  <div style={{ flex: 1, background: USAGE_TOKEN_COLORS.output }} />
                  <div style={{ flex: 1, background: USAGE_TOKEN_COLORS.cacheCreate }} />
                </div>
              );
            })}
          </Panel>
        </>
      );
    },
  },

  sessionFinder: {
    period: 8000,
    draw: (t) => {
      const q = typed('login', seg(t, 400, 1600));
      const rows = [
        tr('manual.demo.title'),
        tr('manual.demo.s2'),
        tr('manual.demo.s3'),
        tr('manual.demo.s4'),
      ];
      const shown = q.length === 5 ? [rows[0]] : rows;
      const open = t > 3200;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Panel x={2} y={2} w={110} h={106}>
            <Box
              x={3}
              y={3}
              w={104}
              h={10}
              style={{
                background: C.void,
                border: `1px solid ${C.panelLine}`,
                color: C.text,
                fontSize: 6,
                padding: '0 2px',
              }}
            >
              🔍 {q}
              {Math.floor(t / 400) % 2 === 0 && t < 1800 && '▌'}
            </Box>
            <Txt x={4} y={15} size={5} color={C.muted}>
              ☑ {tr('sessions.body')}
            </Txt>
            {shown.map((r, i) => (
              <Box
                key={r}
                x={3}
                y={24 + i * 19}
                w={104}
                h={17}
                style={{
                  borderBottom: `1px solid ${C.panelLine}`,
                  background: open && i === 0 && q ? C.accent : undefined,
                }}
              >
                <Txt x={2} y={1} size={5.5} bold w={98}>
                  {r}
                </Txt>
                <Txt x={2} y={9} size={4.5} color={C.muted}>
                  {['app', 'web', 'api', 'docs'][i]} · {12 + i * 7}
                  {tr('manual.demo.min')} · 🔧{30 - i * 5} ✎{9 - i}
                </Txt>
              </Box>
            ))}
          </Panel>
          {open && (
            <Panel x={118} y={10} w={70} h={90}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Box
                  key={i}
                  x={3}
                  y={4 + i * 17}
                  w={64}
                  h={13}
                  style={{
                    background: i === 2 ? 'var(--transcript-user-bg)' : undefined,
                    outline: i === 2 ? `1px solid ${C.gold}` : undefined,
                  }}
                >
                  <Txt x={2} y={3} size={4.5} w={60}>
                    {i === 2 ? `… fix the login redirect …` : '······'}
                  </Txt>
                </Box>
              ))}
            </Panel>
          )}
          <Cursor x={open ? 60 : 160} y={open ? 34 : 90} down={on(t, 3000, 3200)} />
        </>
      );
    },
  },

  codexLimits: {
    period: 6000,
    draw: (t) => {
      const g = seg(t, 300, 3500);
      const bar = (y: number, label: string, used: number, warn: boolean, sub: ReactNode) => (
        <>
          <Txt x={4} y={y} bold size={6}>
            {label}
          </Txt>
          <Box x={36} y={y + 1} w={110} h={6} style={{ background: 'var(--ctx-track)' }}>
            <Box
              x={0}
              y={0}
              w={110 * used * g}
              h={6}
              style={{ background: warn ? 'var(--ctx-warn)' : 'var(--ctx-fill)' }}
            />
          </Box>
          <Txt x={152} y={y} size={6}>
            {Math.round(used * g * 100)}%
          </Txt>
          <Txt x={36} y={y + 9} size={5} color={C.muted}>
            {sub}
          </Txt>
        </>
      );
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Panel x={2} y={10} w={186} h={70}>
            <Txt x={4} y={3} bold>
              {tr('limit.title', { p: 'Codex' })}
            </Txt>
            {bar(
              18,
              tr('limit.hours', { n: '5' }),
              0.72,
              true,
              <>
                {tr('limit.resets', { t: '1h 40m' })} ·{' '}
                <span style={{ color: 'var(--elapsed-warn-fg)' }}>
                  {tr('limit.paceOver', { n: '12' })}
                </span>{' '}
                ·{' '}
                <b style={{ color: 'var(--elapsed-warn-fg)' }}>
                  {tr('limit.hit', { t: '1h 05m' })}
                </b>
              </>,
            )}
            {bar(
              42,
              tr('limit.days', { n: '7' }),
              0.31,
              false,
              <>
                {tr('limit.resets', { t: '4d 2h' })} · {tr('limit.paceUnder', { n: '9' })}
              </>,
            )}
          </Panel>
        </>
      );
    },
  },

  avatar: {
    period: 8000,
    draw: (t, me) => {
      const steps: Array<[Pt, string]> = [
        [{ x: 40, y: 96 }, ''],
        [{ x: 56, y: 96 }, '→'],
        [{ x: 72, y: 96 }, '→'],
        [{ x: 88, y: 96 }, '→'],
        [{ x: 88, y: 80 }, '↑'],
        [{ x: 88, y: 64 }, '↑'],
      ];
      const i = Math.min(steps.length - 1, Math.floor(t / 700));
      const prev = steps[Math.max(0, i - 1)][0];
      const cur = steps[i][0];
      const p = along([prev, cur], seg(t % 700, 0, 300));
      const sitting = t > 4600;
      const key = t < 4200 ? steps[i][1] : '';
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.lounge} />
          <Wall x={0} y={0} w={W} h={22} />
          <Furn type="ARCADE_CABLE" x={80} y={8} />
          <Char
            look={me}
            x={sitting ? 88 : p.x}
            y={sitting ? 56 : p.y}
            pose={sitting ? 'sit' : p.x === cur.x && p.y === cur.y ? 'stand' : 'walk'}
            dir={sitting ? Direction.UP : p.dir}
            t={t}
          />
          <Chair x={80} y={48} />
          {['↑', '←', '↓', '→'].map((k, n) => (
            <Box
              key={k}
              x={n === 0 ? 150 : 136 + (n - 1) * 14}
              y={n === 0 ? 76 : 90}
              w={12}
              h={12}
              style={{
                background: key === k ? C.accent : C.panel,
                border: `1px solid ${C.panelLine}`,
                color: C.text,
                fontSize: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `1px 1px 0 ${C.ink}`,
              }}
            >
              {k}
            </Box>
          ))}
        </>
      );
    },
  },

  chat: {
    period: 8000,
    draw: (t, me, o) => {
      const text = tr('manual.demo.chat');
      const typedText = typed(text, seg(t, 300, 2000));
      const sent = on(t, 2400, 6500);
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.lounge} />
          <Wall x={0} y={0} w={W} h={14} />
          <Char look={me} x={70} y={78} pose="stand" dir={Direction.DOWN} t={t} />
          <Char look={o[0]} x={124} y={78} pose="stand" dir={Direction.LEFT} t={t} />
          {sent && (
            <ChatBubble x={70} y={42}>
              {text} <span style={{ color: C.muted }}>×</span>
            </ChatBubble>
          )}
          <Box
            x={36}
            y={94}
            w={120}
            h={12}
            style={{
              background: C.panel,
              border: `1px solid ${on(t, 0, 2400) ? C.accent : C.panelLine}`,
              color: C.text,
              fontSize: 6,
              padding: '1px 3px',
            }}
          >
            {t < 2400 ? (
              typedText
            ) : (
              <span style={{ color: C.muted }}>{tr('manual.demo.chatHint')}</span>
            )}
            {t < 2400 && Math.floor(t / 400) % 2 === 0 && '▌'}
          </Box>
          <Btn x={160} y={94} w={24} active={on(t, 2000, 2400)}>
            Enter
          </Btn>
        </>
      );
    },
  },

  peoplePanel: {
    period: 7000,
    draw: (t, me, o) => {
      const rows = [
        {
          area: 'public',
          name: `${tr('tour.demo.a')} ${tr('people.you')}`,
          ver: 'v1.0.70',
          net: 1,
          look: me,
        },
        { area: 'public', name: tr('tour.demo.b'), ver: 'v1.0.70', net: 1, look: o[0] },
        { area: 'public', name: tr('tour.demo.c'), ver: 'v1.0.68', net: 2, look: o[1] },
        { area: 'personal', name: tr('tour.demo.d'), ver: 'v1.0.70', net: 0, look: o[2] },
      ];
      let y = 14;
      return (
        <>
          <MiniMap />
          <Panel x={104} y={2} w={86} h={108}>
            <Txt x={3} y={2} bold>
              {tr('people.title', { n: '4' })}
            </Txt>
            {rows.map((r, i) => {
              const head = i === 0 || rows[i - 1].area !== r.area;
              const top = y + (head ? 8 : 0);
              const out = (
                <span key={i}>
                  {head && (
                    <Txt x={3} y={y} size={5} color={C.muted} bold>
                      {r.area === 'public' ? tr('office.public') : tr('office.personal')}
                    </Txt>
                  )}
                  <Box
                    x={2}
                    y={top}
                    w={82}
                    h={18}
                    style={{
                      opacity: seg(t, 200 + i * 300, 600 + i * 300),
                      background: on(t, 3600, 6000) && i === 1 ? C.accent : undefined,
                    }}
                  >
                    <Spr s={face(r.look)} x={1} y={2} />
                    <Txt x={19} y={1} size={5.5} bold>
                      {r.name}
                    </Txt>
                    <Txt
                      x={19}
                      y={9}
                      size={4.5}
                      color={r.ver !== 'v1.0.70' ? 'var(--elapsed-warn-fg)' : C.muted}
                    >
                      {r.ver}{' '}
                      {r.net > 0 && (
                        <span style={{ background: C.panelLine, color: C.text, padding: '0 1px' }}>
                          {tr('people.net', { n: String(r.net) })}
                        </span>
                      )}
                    </Txt>
                  </Box>
                </span>
              );
              y = top + 19;
              return out;
            })}
          </Panel>
          {on(t, 3600, 7000) && (
            <Char
              look={o[0]}
              x={roomCentre('coding').x}
              y={roomCentre('coding').y}
              pose="type"
              dir={Direction.DOWN}
              t={t}
              outline
            />
          )}
          <Cursor
            x={on(t, 3000, 7000) ? 140 : 180}
            y={on(t, 3000, 7000) ? 48 : 100}
            down={on(t, 3400, 3600)}
          />
        </>
      );
    },
  },

  selectPc: {
    period: 6000,
    draw: (t, me, o) => {
      const sel = on(t, 1200, 4200);
      const cur =
        t < 1200
          ? along(
              [
                { x: 180, y: 100 },
                { x: 140, y: 80 },
              ],
              seg(t, 0, 1000),
            )
          : t < 4200
            ? { x: 140, y: 80 }
            : along(
                [
                  { x: 140, y: 80 },
                  { x: 100, y: 104 },
                ],
                seg(t, 4200, 4600),
              );
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={14} />
          <Workstation
            x={16}
            y={36}
            t={t}
            screens={['code', 'term']}
            people={[
              { look: o[0], seat: 0, outline: sel },
              { look: o[0], seat: 1, outline: sel },
            ]}
          />
          <Workstation
            x={100}
            y={36}
            t={t}
            screens={['code', null]}
            people={[{ look: me, seat: 0 }]}
          />
          <Char look={o[0]} x={140} y={100} pose="stand" dir={Direction.DOWN} t={t} outline={sel} />
          <Cursor x={cur.x} y={cur.y} down={on(t, 1000, 1200) || on(t, 4600, 4800)} />
        </>
      );
    },
  },

  lounge: {
    period: 9000,
    draw: (t, me) => {
      const walk = seg(t, 0, 2000);
      const p = along(
        [
          { x: 40, y: 70 },
          { x: 40, y: 98 },
          { x: 116, y: 98 },
        ],
        walk,
      );
      const merged = t > 2300;
      const list = t > 3600;
      const cur = along(
        [
          { x: 180, y: 108 },
          { x: 128, y: 80 },
        ],
        seg(t, 2400, 3300),
      );
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.lounge} />
          <Wall x={0} y={0} w={W} h={14} />
          <Desk x={24} y={22} t={t} screens={[merged ? null : 'code', null]} />
          <Furn type="SOFA_FRONT" x={150} y={30} />
          <Char look={me} x={124} y={98} pose="stand" dir={Direction.DOWN} t={t} />
          {!merged && (
            <Char
              look={me}
              x={p.x}
              y={p.y}
              pose={walk === 0 ? 'type' : 'walk'}
              dir={walk === 0 ? Direction.UP : p.dir}
              t={t}
              o={1 - seg(t, 2000, 2300)}
            />
          )}
          {list && (
            <Panel x={60} y={18} w={90} h={34}>
              <Txt x={3} y={3} size={5} color={C.muted}>
                {tr('manual.demo.loungeList')}
              </Txt>
              <Box
                x={3}
                y={12}
                w={84}
                h={18}
                style={{
                  border: `1px solid ${C.panelLine}`,
                  background: on(t, 5600, 7000) ? C.accent : undefined,
                }}
              >
                <Txt x={2} y={1} size={5}>
                  <span style={{ ...badgeColors('main'), padding: '0 1px', fontWeight: 700 }}>
                    MAIN
                  </span>{' '}
                  #1 {tr('tour.demo.a')}
                </Txt>
                <Txt x={2} y={9} size={5}>
                  <Provider /> {tr('act.idle')}
                </Txt>
              </Box>
            </Panel>
          )}
          <Cursor
            x={t > 4800 ? 100 : cur.x}
            y={t > 4800 ? 40 : cur.y}
            down={on(t, 3300, 3600) || on(t, 5400, 5600)}
          />
        </>
      );
    },
  },

  profile: {
    period: 9000,
    draw: (t, me) => {
      const k = Math.floor(t / 1500) % 6;
      const look: Look = k === 0 ? me : { palette: k % 6, hueShift: k * 40 };
      const tags = ['var(--avatar-tag-bg)', C.accent, C.fail, C.ok, C.blue, C.gold];
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Panel x={8} y={8} w={176} h={96}>
            <Txt x={4} y={3} bold>
              {tr('settings.profile')}
            </Txt>
            <Box
              x={10}
              y={18}
              w={50}
              h={60}
              style={{ border: `1px solid ${C.panelLine}`, background: C.panel }}
            >
              <Char look={look} x={25} y={56} pose="walk" dir={Direction.DOWN} t={t} scale={1.5} />
            </Box>
            {Array.from({ length: 6 }, (_, i) => (
              <Box
                key={i}
                x={70 + i * 17}
                y={20}
                w={15}
                h={20}
                style={{
                  border: `1px solid ${i === k ? C.gold : C.panelLine}`,
                  overflow: 'hidden',
                }}
              >
                <Spr
                  s={charSprite(
                    i === 0 ? me : { palette: i, hueShift: i * 40 },
                    'stand',
                    Direction.DOWN,
                    0,
                  ).slice(0, 18)}
                  x={-1}
                  y={1}
                />
              </Box>
            ))}
            <Txt x={70} y={46} size={5} color={C.muted}>
              {tr('profile.nickname')}
            </Txt>
            <Box
              x={70}
              y={54}
              w={100}
              h={10}
              style={{
                border: `1px solid ${C.panelLine}`,
                fontSize: 6,
                color: C.text,
                padding: '0 2px',
              }}
            >
              {typed(tr('tour.demo.b'), seg(t % 4500, 300, 1500))}
            </Box>
            <div style={abs(70, 72, { display: 'flex', gap: 2 })}>
              {tags.map((c, i) => (
                <span
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    background: c,
                    outline: i === k ? `1px solid ${C.white}` : undefined,
                  }}
                />
              ))}
            </div>
            <div
              style={abs(35, 82, {
                transform: 'translateX(-50%)',
                fontSize: 5,
                background: tags[k],
                color: C.white,
                padding: '0 2px',
                whiteSpace: 'nowrap',
              })}
            >
              {tr('tour.demo.a')} ({tr('tour.demo.b')})
            </div>
          </Panel>
        </>
      );
    },
  },

  arcade: {
    period: 9000,
    draw: (t, me) => {
      const walk = seg(t, 0, 1500);
      const p = along(
        [
          { x: 30, y: 100 },
          { x: 56, y: 100 },
          { x: 56, y: 56 },
        ],
        walk,
      );
      const playing = t > 1700;
      const g = t - 1700;
      const bx = 20 + Math.abs(((g / 20) % 120) - 60);
      const by = 10 + Math.abs(((g / 28) % 60) - 30);
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} tint={ROOM_AREA_COLORS.lounge} />
          <Wall x={0} y={0} w={W} h={24} />
          {['ARCADE_BREAKER', 'ARCADE_CABLE', 'ARCADE_BUGS'].map((a, i) => (
            <Furn key={a} type={a} x={32 + i * 24} y={8} />
          ))}
          {[0, 1, 2].map((i) => (
            <Chair key={i} x={32 + i * 24} y={48} />
          ))}
          <Char
            look={me}
            x={playing ? 40 : p.x}
            y={playing ? 56 : p.y}
            pose={playing ? 'sit' : 'walk'}
            dir={playing ? Direction.UP : p.dir}
            t={t}
          />
          {playing && <Chair x={32} y={48} />}
          {playing && (
            <Box
              x={104}
              y={6}
              w={84}
              h={100}
              style={{ background: C.term, border: `2px solid ${C.panelLine}` }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <Box
                  key={i}
                  x={4 + (i % 6) * 13}
                  y={6 + Math.floor(i / 6) * 6}
                  w={11}
                  h={4}
                  style={{
                    background: C.confetti[i % 5],
                    opacity: g > 900 + i * 300 && i % 3 === 0 ? 0 : 1,
                  }}
                />
              ))}
              <Box x={bx} y={by + 20} w={3} h={3} style={{ background: C.white }} />
              <Box x={bx - 10} y={90} w={22} h={3} style={{ background: C.blue }} />
              <Txt x={3} y={80} size={5} color={C.termText}>
                {tr('game.breaker.name')} · {Math.floor(g / 60) * 10}
              </Txt>
            </Box>
          )}
        </>
      );
    },
  },

  switcher: {
    period: 9000,
    draw: (t, me, o) => {
      const k = Math.floor(t / 3000);
      const tabs = [tr('office.personal'), tr('office.public'), `🔒 ${tr('manual.demo.team')}`];
      const crowd = k === 0 ? [] : k === 1 ? o : o.slice(0, 1);
      return (
        <>
          <MiniMap />
          {crowd.map((l, i) => (
            <Char
              key={i}
              look={l}
              x={[46, 144, 46][i]}
              y={[50, 50, 104][i]}
              pose={i === 2 ? 'read' : 'type'}
              dir={Direction.DOWN}
              t={t}
            />
          ))}
          <Char
            look={me}
            x={roomCentre('lounge').x}
            y={roomCentre('lounge').y}
            pose="stand"
            dir={Direction.DOWN}
            t={t}
          />
          <div style={abs(W / 2, 2, { transform: 'translateX(-50%)', display: 'flex', gap: 2 })}>
            {tabs.map((s, i) => (
              <span
                key={s}
                style={{
                  fontSize: 6,
                  padding: '1px 3px',
                  whiteSpace: 'nowrap',
                  background: i === k ? C.accent : C.panel,
                  color: C.text,
                  border: `1px solid ${C.panelLine}`,
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </>
      );
    },
  },

  personal: {
    period: 6000,
    draw: (t, me) => {
      const pulse = Math.floor(t / 500) % 2;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Box x={6} y={10} w={96} h={92} style={{ border: `1px dashed ${C.gold}` }}>
            <Floor x={0} y={0} w={95} h={91} tint={ROOM_AREA_COLORS.coding} />
            <Workstation
              x={22}
              y={16}
              t={t}
              screens={['code', 'term']}
              people={[
                { look: me, seat: 0 },
                { look: me, seat: 1 },
              ]}
            />
            <Char look={me} x={70} y={84} pose="stand" dir={Direction.DOWN} t={t} />
            <Txt x={2} y={2} bold bg={C.panel}>
              {tr('office.personal')}
            </Txt>
          </Box>
          <Txt x={106} y={46} size={10} color={C.fail}>
            ✕
          </Txt>
          <Panel x={124} y={20} w={64} h={60}>
            <Txt x={3} y={2} size={5} color={C.muted}>
              {tr('manual.demo.otherPc')}
            </Txt>
            <Txt x={3} y={14} size={5} bold color={C.muted}>
              {tr('office.personal')}
            </Txt>
            <Box x={3} y={22} w={58} h={10} style={{ opacity: 0.6 + pulse * 0.4 }}>
              <Txt x={0} y={1} size={5.5}>
                {tr('tour.demo.a')}
              </Txt>
            </Box>
          </Panel>
        </>
      );
    },
  },

  public: {
    period: 4000,
    draw: (t, me, o) => {
      const lan = (x: number, n: number, ls: Look[]) => (
        <Box
          x={x}
          y={24}
          w={70}
          h={78}
          style={{ border: `1px solid ${C.panelLine}`, background: C.panel }}
        >
          <Txt x={3} y={2} size={5.5} bold>
            {tr('people.net', { n: String(n) })}
          </Txt>
          {ls.map((l, i) => (
            <Char
              key={i}
              look={l}
              x={16 + (i % 2) * 36}
              y={46 + Math.floor(i / 2) * 30}
              pose="stand"
              dir={Direction.DOWN}
              t={t}
            />
          ))}
        </Box>
      );
      const q = (t % 1000) / 1000;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          {lan(4, 1, [me, o[0], o[1]])}
          {lan(118, 2, [o[2]])}
          <Box
            x={80}
            y={4}
            w={32}
            h={16}
            style={{
              background: C.panel,
              borderRadius: 8,
              border: `1px solid ${C.blue}`,
              fontSize: 5,
              color: C.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            relay
          </Box>
          {/* Full office inside the LAN; names only through the relay. */}
          <Box x={lerp(20, 52, q)} y={60} w={3} h={3} style={{ background: C.ok }} />
          <Box x={lerp(52, 20, q)} y={88} w={3} h={3} style={{ background: C.ok }} />
          <Box x={lerp(74, 96, q)} y={lerp(30, 14, q)} w={3} h={3} style={{ background: C.blue }} />
          <Box
            x={lerp(96, 118, q)}
            y={lerp(14, 30, q)}
            w={3}
            h={3}
            style={{ background: C.blue }}
          />
          <Txt x={6} y={104} size={5} color={C.ok}>
            ■ {tr('manual.demo.lanAll')}
          </Txt>
          <Txt x={100} y={104} size={5} color={C.blue}>
            ■ {tr('manual.demo.relayNames')}
          </Txt>
        </>
      );
    },
  },

  team: {
    period: 8000,
    draw: (t, me, o) => {
      const code = 'PO2-7KQX-M4T9';
      const joined = t > 3000;
      const q = (t % 1000) / 1000;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Panel x={4} y={4} w={184} h={22}>
            <Txt x={3} y={2} size={5} color={C.muted}>
              {tr('manual.demo.inviteCode')}
            </Txt>
            <Txt x={3} y={10} size={7} bold color={C.gold}>
              {typed(code, seg(t, 300, 2200))}
            </Txt>
            <Btn x={150} y={6} w={30} h={11} active={on(t, 2400, 2800)}>
              {tr('manual.demo.join')}
            </Btn>
          </Panel>
          {[me, o[0]].map((l, i) => (
            <Box
              key={i}
              x={14 + i * 110}
              y={36}
              w={56}
              h={70}
              style={{ border: `1px solid ${joined ? C.gold : C.panelLine}`, background: C.panel }}
            >
              <Char look={l} x={28} y={60} pose="stand" dir={Direction.DOWN} t={t} />
            </Box>
          ))}
          {joined && (
            <>
              <Txt x={89} y={56} size={10}>
                🔒
              </Txt>
              <Box x={lerp(72, 122, q)} y={78} w={4} h={4} style={{ background: C.gold }} />
              <Box x={lerp(122, 72, q)} y={88} w={4} h={4} style={{ background: C.gold }} />
            </>
          )}
        </>
      );
    },
  },

  adminKick: {
    period: 7000,
    draw: (t, me, o) => {
      const gone = seg(t, 2600, 3200);
      const cur = along(
        [
          { x: 40, y: 100 },
          { x: 160, y: 47 },
        ],
        seg(t, 200, 1400),
      );
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Panel x={30} y={6} w={160} h={74}>
            <Txt x={3} y={2} bold>
              {tr('office.public')}
            </Txt>
            {[me, o[0], o[1]].map((l, i) => (
              <Box
                key={i}
                x={2}
                y={14 + i * 19}
                w={156}
                h={18}
                style={{ opacity: i === 1 ? 1 - gone : 1 }}
              >
                <Spr s={face(l)} x={1} y={2} />
                <Txt x={20} y={4} size={6}>
                  {
                    [
                      `${tr('tour.demo.a')} ${tr('people.you')}`,
                      tr('tour.demo.b'),
                      tr('tour.demo.c'),
                    ][i]
                  }
                </Txt>
                {i > 0 && (
                  <Btn x={120} y={3} w={30} h={11} active={i === 1 && on(t, 1400, 1700)}>
                    {tr('relay.kick')}
                  </Btn>
                )}
              </Box>
            ))}
          </Panel>
          {on(t, 1700, 2600) && (
            <Panel x={40} y={84} w={140} h={22}>
              <Txt x={4} y={3} size={5.5}>
                {tr('relay.kickConfirm', { name: tr('tour.demo.b') })}
              </Txt>
              <Btn x={110} y={10} w={24} h={10} active={on(t, 2300, 2600)}>
                OK
              </Btn>
            </Panel>
          )}
          {t > 3200 && (
            <Txt x={70} y={90} bg={C.ok} color={C.ink} size={6}>
              {tr('relay.kickOk')}
            </Txt>
          )}
          <Cursor
            x={t > 1700 && t < 2600 ? 168 : cur.x}
            y={t > 1700 && t < 2600 ? 100 : cur.y}
            down={on(t, 1400, 1700) || on(t, 2300, 2600)}
          />
        </>
      );
    },
  },

  editFloor: {
    period: 7000,
    draw: (t) => {
      const fill = seg(t, 1500, 2700);
      const walls = t > 4000;
      const tiles = [];
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 10; c++) {
          const d = Math.hypot(c - 3, r - 2) / 9;
          tiles.push(
            <Box
              key={`${r},${c}`}
              x={36 + c * 15}
              y={30 + r * 15}
              w={15}
              h={15}
              style={{
                background: d <= fill ? C.blue : C.floor,
                border: `1px solid ${C.floorAlt}`,
              }}
            />,
          );
        }
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Box
            x={36}
            y={14}
            w={150}
            h={16}
            style={{ background: walls ? C.accent : C.wall, borderTop: `3px solid ${C.wallTop}` }}
          />
          {tiles}
          <Panel x={2} y={14} w={30} h={92}>
            {[C.floor, C.blue, C.ok, C.gold].map((c, i) => (
              <Box
                key={i}
                x={4}
                y={4 + i * 16}
                w={20}
                h={12}
                style={{
                  background: c,
                  outline:
                    (i === 1 && t > 600) || (i === 0 && t <= 600)
                      ? `1px solid ${C.white}`
                      : undefined,
                }}
              />
            ))}
          </Panel>
          <Cursor
            x={t < 600 ? 160 : t < 1500 ? lerp(14, 85, seg(t, 900, 1400)) : t < 3600 ? 85 : 120}
            y={t < 600 ? 100 : t < 1500 ? lerp(24, 62, seg(t, 900, 1400)) : t < 3600 ? 62 : 22}
            down={on(t, 600, 800) || on(t, 1400, 1600) || on(t, 3800, 4000)}
          />
        </>
      );
    },
  },

  editFurniture: {
    period: 8000,
    draw: (t) => {
      const drag = seg(t, 800, 2400);
      const p = along(
        [
          { x: 14, y: 30 },
          { x: 110, y: 70 },
        ],
        drag,
      );
      const copy = seg(t, 3600, 5000);
      const q = along(
        [
          { x: 110, y: 70 },
          { x: 150, y: 70 },
        ],
        copy,
      );
      return (
        <>
          <Floor x={36} y={0} w={156} h={H} />
          <Wall x={36} y={0} w={156} h={16} />
          <Desk x={48} y={30} t={t} />
          <Txt x={60} y={64} size={7}>
            🔒
          </Txt>
          <Panel x={2} y={4} w={30} h={104}>
            <Furn type="PLANT" x={7} y={4} />
            <Furn type="BIN" x={7} y={40} />
            <Furn type="COFFEE" x={7} y={64} />
          </Panel>
          <Furn type="PLANT" x={p.x - 8} y={p.y - 28} />
          {copy > 0 && <Furn type="PLANT" x={q.x - 8} y={q.y - 28} />}
          {on(t, 3600, 5000) && (
            <Txt x={150} y={100} bg={C.panel}>
              Alt + drag
            </Txt>
          )}
          <Cursor
            x={copy > 0 ? q.x : p.x}
            y={copy > 0 ? q.y - 10 : p.y - 10}
            down={on(t, 800, 2400) || on(t, 3600, 5000)}
          />
        </>
      );
    },
  },

  editBackground: {
    period: 6000,
    draw: (t, me) => {
      const k = Math.floor(t / 2000);
      const bg = [
        C.void,
        `repeating-linear-gradient(45deg, ${C.ok} 0 6px, ${C.floorAlt} 6px 12px)`,
        C.sky,
      ][k];
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: bg }} />
          <Box x={46} y={20} w={100} h={72} style={{ border: `2px solid ${C.wall}` }}>
            <Floor x={0} y={0} w={96} h={68} />
            <Workstation
              x={24}
              y={14}
              t={t}
              screens={['code', null]}
              people={[{ look: me, seat: 0 }]}
            />
          </Box>
          <Panel x={2} y={2} w={36} h={14}>
            <Txt x={3} y={3} size={5}>
              {tr('manual.demo.bg')}
            </Txt>
          </Panel>
        </>
      );
    },
  },

  editSave: {
    period: 8000,
    draw: (t, me, o) => {
      const placed = t > 600;
      const saved = t > 2600;
      const mini = (x: number, has: boolean, l: Look, label: string) => (
        <Box x={x} y={30} w={86} h={70} style={{ border: `1px solid ${C.panelLine}` }}>
          <Floor x={0} y={0} w={84} h={68} />
          <Char look={l} x={42} y={60} pose="stand" dir={Direction.DOWN} t={t} />
          {has && <Furn type="LARGE_PLANT" x={4} y={6} />}
          <Txt x={2} y={58} size={5} bg={C.panel}>
            {label}
          </Txt>
        </Box>
      );
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <div style={abs(4, 4, { display: 'flex', gap: 2 })}>
            {[tr('edit.reset'), '↶', '↷', tr('edit.save'), tr('edit.cancel')].map((s, i) => (
              <span
                key={s}
                style={{
                  fontSize: 6,
                  padding: '1px 3px',
                  background: i === 3 && on(t, 2300, 2700) ? C.accent : C.panel,
                  color: C.text,
                  border: `1px solid ${C.panelLine}`,
                }}
              >
                {s}
              </span>
            ))}
          </div>
          {mini(4, placed, me, tr('manual.demo.myPc'))}
          {mini(102, saved && t > 3200, o[0], tr('manual.demo.otherPc'))}
          {saved && t < 3200 && (
            <Box
              x={lerp(90, 102, seg(t, 2700, 3200))}
              y={60}
              w={4}
              h={4}
              style={{ background: C.gold }}
            />
          )}
          <Cursor
            x={on(t, 1800, 2800) ? 60 : 40}
            y={on(t, 1800, 2800) ? 8 : 60}
            down={on(t, 2300, 2700)}
          />
        </>
      );
    },
  },

  importExport: {
    period: 7000,
    draw: (t, me) => {
      const out = seg(t, 400, 2200);
      const inn = seg(t, 3600, 5400);
      const file = (x: number, y: number) => (
        <Box
          x={x}
          y={y}
          w={16}
          h={20}
          style={{
            background: C.doc,
            border: `1px solid ${C.docLine}`,
            fontSize: 4.5,
            color: C.ink,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          JSON
        </Box>
      );
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Box x={6} y={20} w={96} h={72} style={{ border: `2px solid ${C.wall}` }}>
            <Floor x={0} y={0} w={92} h={68} />
            <Char look={me} x={46} y={60} pose="stand" dir={Direction.DOWN} t={t} />
            {t > 5400 && <Furn type="LARGE_PLANT" x={4} y={6} />}
          </Box>
          <Txt x={150} y={30} size={16}>
            📁
          </Txt>
          {out > 0 && out < 1 && file(lerp(50, 150, out), lerp(50, 50, out))}
          {inn > 0 && inn < 1 && file(lerp(150, 50, inn), 60)}
          <Txt x={110} y={90} bg={C.panel} size={6}>
            {t < 3000 ? tr('settings.export') : tr('settings.import')}
          </Txt>
        </>
      );
    },
  },

  notifications: {
    period: 9000,
    draw: (t) => {
      const k = Math.floor(t / 3000);
      const l = t % 3000;
      const y = lerp(H, 62, seg(l, 0, 300)) + lerp(0, 60, seg(l, 2600, 2900));
      const body = [
        tr('manual.demo.nJoin', { name: tr('tour.demo.b') }),
        tr('manual.demo.nWait'),
        `${tr('tour.demo.c')}: ${tr('manual.demo.chat')}`,
      ][k];
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.sky }} />
          <Box x={0} y={H - 10} w={W} h={10} style={{ background: C.ink }} />
          <Box x={W - 18} y={H - 8} w={6} h={6} style={{ background: C.accent }} />
          <Panel x={86} y={y} w={102} h={36}>
            <Txt x={4} y={3} size={5.5} bold>
              Pixel Office
            </Txt>
            <div
              style={abs(4, 12, {
                width: 94,
                fontSize: 5.5,
                color: C.text,
                whiteSpace: 'pre-wrap',
              })}
            >
              {body}
            </div>
          </Panel>
        </>
      );
    },
  },

  tray: {
    period: 7000,
    draw: (t, me) => {
      const menu = on(t, 1200, 2600);
      const open = t > 2600;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.sky }} />
          {open && (
            <Panel
              x={lerp(60, 10, seg(t, 2600, 3000))}
              y={lerp(60, 6, seg(t, 2600, 3000))}
              w={lerp(20, 140, seg(t, 2600, 3000))}
              h={lerp(14, 84, seg(t, 2600, 3000))}
            >
              <Floor x={0} y={8} w={140} h={80} />
              <Box x={0} y={0} w={140} h={8} style={{ background: C.void }} />
              <Workstation
                x={40}
                y={20}
                t={t}
                screens={['code', null]}
                people={[{ look: me, seat: 0 }]}
              />
            </Panel>
          )}
          <Box x={0} y={H - 12} w={W} h={12} style={{ background: C.ink }} />
          <Box
            x={W - 30}
            y={H - 10}
            w={8}
            h={8}
            style={{ background: C.accent, fontSize: 5, color: C.white, textAlign: 'center' }}
          >
            P
          </Box>
          {menu && (
            <Panel x={W - 60} y={H - 40} w={44} h={28}>
              <Box
                x={1}
                y={2}
                w={42}
                h={11}
                style={{ background: on(t, 2200, 2600) ? C.accent : undefined }}
              >
                <Txt x={3} y={2}>
                  {tr('manual.demo.open')}
                </Txt>
              </Box>
              <Box x={1} y={14} w={42} h={11}>
                <Txt x={3} y={2}>
                  {tr('manual.demo.quit')}
                </Txt>
              </Box>
            </Panel>
          )}
          <Cursor
            x={menu ? (t > 2000 ? W - 50 : W - 26) : W - 26}
            y={menu ? (t > 2000 ? H - 34 : H - 8) : H - 8}
            down={on(t, 1000, 1200) || on(t, 2300, 2600)}
          />
        </>
      );
    },
  },

  autostart: {
    period: 7000,
    draw: (t) => {
      const login = t < 2000;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: login ? C.void : C.sky }} />
          {login && (
            <>
              <Box
                x={84}
                y={30}
                w={24}
                h={24}
                style={{ background: C.panelLine, borderRadius: '50%' }}
              />
              <Box
                x={66}
                y={62}
                w={60}
                h={10}
                style={{
                  background: C.panel,
                  border: `1px solid ${C.panelLine}`,
                  fontSize: 6,
                  color: C.text,
                  padding: '0 3px',
                }}
              >
                {'•'.repeat(Math.floor(seg(t, 200, 1300) * 8))}
              </Box>
              <Btn x={78} y={78} w={36} h={11} active={on(t, 1500, 2000)}>
                {tr('manual.demo.login')}
              </Btn>
            </>
          )}
          {!login && (
            <>
              <Box x={0} y={H - 12} w={W} h={12} style={{ background: C.ink }} />
              <Box
                x={W - 30}
                y={H - 10}
                w={8}
                h={8}
                style={{
                  background: C.accent,
                  opacity: seg(t, 2400, 2800),
                  fontSize: 5,
                  color: C.white,
                  textAlign: 'center',
                }}
              >
                P
              </Box>
              {t > 3000 && (
                <Panel x={86} y={lerp(H, 62, seg(t, 3000, 3300))} w={102} h={30}>
                  <Txt x={4} y={3} size={5.5} bold>
                    Pixel Office
                  </Txt>
                  <Txt x={4} y={13} size={5.5}>
                    {tr('manual.demo.nJoin', { name: tr('tour.demo.b') })}
                  </Txt>
                </Panel>
              )}
              <Txt x={6} y={6} size={6} bg={C.panel}>
                ✓ {tr('settings.autostart')}
              </Txt>
            </>
          )}
        </>
      );
    },
  },

  updates: {
    period: 8000,
    draw: (t) => {
      const dl = seg(t, 800, 3600);
      const restart = on(t, 3600, 5000);
      const done = t >= 5000;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
          <Panel x={30} y={24} w={132} h={64}>
            <Txt x={6} y={5} bold size={7}>
              Pixel Office {done ? 'v1.0.71' : 'v1.0.70'}
            </Txt>
            {!restart && !done && (
              <>
                <Txt x={6} y={20} size={5.5}>
                  {tr('manual.demo.fetching')}
                </Txt>
                <Box x={6} y={32} w={120} h={6} style={{ background: 'var(--ctx-track)' }}>
                  <Box x={0} y={0} w={120 * dl} h={6} style={{ background: 'var(--ctx-fill)' }} />
                </Box>
              </>
            )}
            {restart && (
              <Txt x={6} y={24} size={6}>
                {'↻'} {tr('manual.demo.restarting')}
              </Txt>
            )}
            {done && (
              <Txt x={6} y={24} size={6} color={C.ok}>
                ✓ {tr('update.updated', { v: '1.0.71' })}
              </Txt>
            )}
            <Txt x={6} y={48} size={5} color={C.muted}>
              {tr('manual.demo.every6h')}
            </Txt>
          </Panel>
        </>
      );
    },
  },

  installApp: {
    period: 7000,
    draw: (t, me) => {
      const app = t > 2600;
      return (
        <>
          <Box x={0} y={0} w={W} h={H} style={{ background: C.sky }} />
          <Panel x={14} y={8} w={164} h={96}>
            {!app ? (
              <>
                <Box x={0} y={0} w={164} h={8} style={{ background: C.panelLine }} />
                <Box
                  x={4}
                  y={10}
                  w={140}
                  h={8}
                  style={{ background: C.void, fontSize: 5, color: C.muted, padding: '0 2px' }}
                >
                  localhost:47801
                </Box>
                <Btn x={148} y={9} w={12} h={10} active={on(t, 1600, 2000)}>
                  ⊕
                </Btn>
              </>
            ) : (
              <Box x={0} y={0} w={164} h={10} style={{ background: C.accent }}>
                <Txt x={4} y={2} size={5.5} bold>
                  Pixel Office
                </Txt>
              </Box>
            )}
            <Floor x={2} y={app ? 12 : 22} w={160} h={app ? 82 : 72} />
            <Workstation
              x={60}
              y={app ? 28 : 34}
              t={t}
              screens={['code', null]}
              people={[{ look: me, seat: 0 }]}
            />
          </Panel>
          {!app && (
            <Cursor
              x={lerp(100, 154, seg(t, 400, 1500))}
              y={lerp(70, 14, seg(t, 400, 1500))}
              down={on(t, 1600, 2000)}
            />
          )}
        </>
      );
    },
  },

  quit: {
    period: 8000,
    draw: (t, me) => {
      const off = on(t, 2000, 5200);
      return (
        <>
          {!off ? (
            <>
              <Floor x={0} y={0} w={W} h={H} />
              <Wall x={0} y={0} w={W} h={14} />
              <Workstation
                x={70}
                y={40}
                t={t}
                screens={['code', null]}
                people={[{ look: me, seat: 0 }]}
              />
              {t < 2000 && (
                <Panel x={4} y={20} w={70} h={22}>
                  <Box
                    x={2}
                    y={3}
                    w={66}
                    h={14}
                    style={{ background: on(t, 1400, 2000) ? C.fail : undefined }}
                  >
                    <Txt x={3} y={3}>
                      {tr('settings.quitApp')}
                    </Txt>
                  </Box>
                </Panel>
              )}
            </>
          ) : (
            <>
              <Box x={0} y={0} w={W} h={H} style={{ background: C.void }} />
              <Txt x={W / 2} y={36} size={8} bold style={{ transform: 'translateX(-50%)' }}>
                {tr('manual.demo.serverOff')}
              </Txt>
              <Btn x={78} y={56} w={36} h={14} active={on(t, 4600, 5200)}>
                {tr('server.start')}
              </Btn>
            </>
          )}
          <Cursor
            x={off ? 96 : t < 2000 ? 40 : 160}
            y={off ? 64 : t < 2000 ? 30 : 100}
            down={on(t, 1400, 1700) || on(t, 4600, 4900)}
          />
        </>
      );
    },
  },

  tour: {
    period: 9000,
    draw: (t, me, o) => {
      const spots = [
        { x: 2, y: 2, w: 72, h: 16 },
        { x: 8, y: 30, w: 80, h: 70 },
        { x: 140, y: 2, w: 50, h: 108 },
      ];
      const k = Math.floor(t / 3000);
      const s = spots[k];
      return (
        <>
          <Floor x={0} y={0} w={W} h={H} />
          <Wall x={0} y={0} w={W} h={22} />
          <Workstation
            x={16}
            y={40}
            t={t}
            screens={['code', 'term']}
            people={[
              { look: me, seat: 0 },
              { look: o[0], seat: 1 },
            ]}
          />
          {['▦', '⚙', '📊', '?', '☀'].map((c, i) => (
            <Btn key={c} x={4 + i * 14} y={4} active={i === 3}>
              {c}
            </Btn>
          ))}
          <Panel x={142} y={4} w={46} h={104}>
            <Txt x={3} y={2} size={5} bold>
              {tr('people.title', { n: '2' })}
            </Txt>
          </Panel>
          <div
            style={abs(s.x, s.y, {
              width: s.w,
              height: s.h,
              boxShadow: `0 0 0 400px ${C.dim}`,
              outline: `1px solid ${C.white}`,
            })}
          />
          <Panel x={k === 2 ? 40 : 96} y={k === 0 ? 24 : 60} w={90} h={30}>
            <Txt x={3} y={3} size={6} bold>
              {[tr('tour.manual.title'), tr('tour.tag.title'), tr('tour.people.title')][k]}
            </Txt>
            <Txt x={3} y={18} size={5} color={C.muted}>
              {k + 1} / 3 · ← →
            </Txt>
          </Panel>
        </>
      );
    },
  },
};

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** The looping stage for entry `id`, scaled to its container's width. */
export function ManualStage({ id, me, others }: { id: string; me: Look; others: Look[] }) {
  const scene = scenes[id];
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2);
  useEffect(() => {
    setNow(0);
    if (reducedMotion()) return;
    const start = performance.now();
    const timer = setInterval(() => setNow(performance.now() - start), MANUAL_STAGE_TICK_MS);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!scene) return null;
  // Reduced motion: one still frame from the middle of the loop.
  const tt = reducedMotion() ? scene.period * 0.6 : now % scene.period;
  return (
    <div
      ref={box}
      data-manual-stage={id}
      className="relative w-full overflow-hidden border-2 border-border"
      style={{ aspectRatio: `${W} / ${H}`, background: C.void }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          // zoom, not a transform: text is laid out at the zoomed size, so it stays crisp
          zoom: scale,
          fontFamily: 'var(--font-ui)',
        }}
      >
        {scene.draw(tt, me, others)}
      </div>
    </div>
  );
}
