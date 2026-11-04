import { type MutableRefObject, type RefObject, useEffect, useRef, useState } from 'react';

import type { OfficeAgent } from '../../../core/src/lan.js';
import {
  ACT_ICON_INLINE_PX,
  ACT_ICON_ONLY_BELOW_SCALE,
  ACT_ICON_SCREEN_PX,
  AVATAR_TAG_HEIGHT_PX,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  CHARACTER_SITTING_OFFSET_PX,
  CHAT_BORDER_PX,
  CHAT_TAIL_PX,
  FAIL_DROP_OFFSET_X,
  LAN_ACTIVITY_BADGE_GAP_PX,
  LAN_ACTIVITY_LINE_PX,
  LAN_ACTIVITY_MAX_WIDTH_PX,
  LAN_ACTIVITY_PAD_X_PX,
  LAN_ACTIVITY_PAD_Y_PX,
  LAN_ACTIVITY_PERSONAL_LINES,
  LAN_ALERT_COLOR,
  LAN_BUBBLE_HEAD_OFFSET,
  LAN_BUBBLE_MAX_WIDTH_PX,
  LAN_BUBBLE_Z_INDEX,
  LAN_PERMISSION_Z_INDEX,
  LAN_PROVIDER_BADGE_FG,
  LAN_PROVIDER_COLORS,
  LAN_TAG_BADGE_CHROME_PX,
  LAN_TAG_BADGE_FONT,
  LAN_TAG_FONT,
  LAN_TAG_HEIGHT_PX,
  LAN_TAG_LINE_PX,
  LAN_TAG_PAD_X_PX,
  LAN_TAG_STACK_GAP_PX,
  LAN_TAG_Z_INDEX,
  PET_HEAD_DROP_PX,
  STATUS_CHIP_FONT,
  STATUS_CHIP_PAD_X_PX,
  STATUS_PART_GAP_PX,
  TODO_BAR_HEIGHT_PX,
} from '../constants.js';
import { t } from '../i18n.js';
import { onFrame } from '../office/engine/gameLoop.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { overlayProjection, renderScale } from '../office/projection.js';
import { getCachedSprite } from '../office/sprites/spriteCache.js';
import { BUBBLE_PERMISSION_SPRITE } from '../office/sprites/spriteData.js';
import { type Character, CharacterState } from '../office/types.js';
import { ActIcon } from './ActIcon.js';
import { actIcon, type IconId } from './actIcons.js';
import { badgeColors } from './badgeColors.js';
import { bubbleScale, clampRows, stackBubbles, wrapLines } from './chat.js';
import {
  activityText,
  type AvatarRef,
  type LanAgents,
  providerName,
  tagBadge,
  tagText,
} from './lanAgents.js';
import { elapsedText, elapsedWarn, iconOnly, todoPercent, todoText } from './statusSignals.js';
import { stackTags, type TagBox } from './tagStack.js';
import { tagVisible } from './tagVisibility.js';
import { textWidth } from './textWidth.js';

const measureTag = (s: string) => textWidth(s, LAN_TAG_FONT);
/** A chip's width with its gap before it (0 when empty). */
const chipW = (s: string) =>
  s ? textWidth(s, STATUS_CHIP_FONT) + 2 * STATUS_CHIP_PAD_X_PX + STATUS_PART_GAP_PX : 0;

/** Task count chip, filled up to its progress. */
function TodoChip({ a }: { a: OfficeAgent }) {
  const pct = todoPercent(a);
  return (
    <span
      data-todo={todoText(a)}
      className="shrink-0 text-2xs font-bold leading-none"
      style={{
        padding: `1px ${STATUS_CHIP_PAD_X_PX}px`,
        background: `linear-gradient(to right, var(--todo-fill) ${pct}%, var(--todo-track) ${pct}%)`,
      }}
    >
      {todoText(a)}
    </span>
  );
}

/** The failure drop beside a head: fixed size, so it shows at any zoom. */
const failDrop = (key: string, left: number, top: number) => (
  <div
    key={key}
    data-fail={key}
    className="absolute pointer-events-none"
    style={{ left, top: top - ACT_ICON_SCREEN_PX, zIndex: LAN_TAG_Z_INDEX }}
  >
    <ActIcon icon="fail" size={ACT_ICON_SCREEN_PX} color="var(--fail-drop)" />
  </div>
);

/** The permission bubble sprite, blitted into a DOM canvas above the tags. */
/** `scale` = fractional-zoom stretch on top of the integer-zoom sprite (see renderScale). */
function PermissionBubble({
  cached,
  dpr,
  scale,
}: {
  cached: HTMLCanvasElement;
  dpr: number;
  scale: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = cached.width;
    canvas.height = cached.height;
    canvas.getContext('2d')?.drawImage(cached, 0, 0);
  }, [cached]);
  return (
    <canvas
      ref={ref}
      className="block"
      style={{
        width: (cached.width * scale) / dpr,
        height: (cached.height * scale) / dpr,
        imageRendering: 'pixelated',
      }}
    />
  );
}

interface LanOverlayProps {
  officeState: OfficeState;
  lan: LanAgents;
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: MutableRefObject<{ x: number; y: number }>;
  /** Agents' name tags hidden (except the hovered/selected character's); avatar tags always show. */
  tagsHidden: boolean;
  /** Personal mode: agents' tags show MAIN/SUB/SHELL + #n only (my name is on my avatar). */
  personal: boolean;
}

/**
 * Name tags under every LAN character, permission bubbles over waiting ones,
 * and the hover bubble (room, activity, reason) in the viewer's language. Re-rendered after every
 * canvas frame (`onFrame`) so the DOM follows walking sprites; tags are keyed so React only
 * moves them. All text is React text nodes.
 */
export function LanOverlay({
  officeState,
  lan,
  containerRef,
  zoom,
  panRef,
  tagsHidden,
  personal,
}: LanOverlayProps) {
  // Re-render after every canvas frame (the on-demand schedule), never when idle.
  const [, setTick] = useState(0);
  useEffect(() => onFrame(() => setTick((n) => n + 1)), []);

  const el = containerRef.current;
  if (!el) return null;
  const dpr = window.devicePixelRatio || 1;
  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    dpr,
  );
  // Sprite cache stays per integer zoom; the bubble is stretched by `scale`.
  const { renderZoom, scale } = renderScale(zoom);
  const permissionSprite = getCachedSprite(BUBBLE_PERMISSION_SPRITE, renderZoom);
  // Tags and bubbles grow and shrink with the map (1 at the default zoom).
  const k = bubbleScale(zoom, dpr);
  /** Laid out unscaled, drawn × k around the top centre (the class's -translate-x-1/2 centres it). */
  const tagScale = { transform: `scale(${k})`, transformOrigin: 'top center' } as const;

  const nodes = [];
  const byKey = new Map(lan.all().map((a) => [a.key, a] as const));
  // Project every tag first, then stack the ones that collide (side-by-side characters).
  const tags: Array<{ a: OfficeAgent; ch: Character; text: string; show: boolean }> = [];
  const boxes: TagBox[] = [];
  for (const a of lan.all()) {
    const id = lan.idFor(a.key);
    const ch = id !== undefined ? officeState.characters.get(id) : undefined;
    if (!ch) continue;
    const text = tagText(
      a,
      a.parentKey !== undefined ? byKey.get(a.parentKey) : undefined,
      !personal,
    );
    const typing = ch.state === CharacterState.TYPE;
    tags.push({
      a,
      ch,
      text,
      show: tagVisible(tagsHidden, ch.id, officeState.hoveredAgentId, officeState.selectedAgentId),
    });
    boxes.push({
      x: project.toScreenX(ch.x),
      y: project.toScreenY(ch.y + (typing ? CHARACTER_SITTING_OFFSET_PX : 0)),
      w:
        (2 * LAN_TAG_PAD_X_PX +
          LAN_TAG_BADGE_CHROME_PX +
          textWidth(tagBadge(a), LAN_TAG_BADGE_FONT) +
          textWidth(text, LAN_TAG_FONT)) *
        k,
    });
  }
  // Avatar tags (one per person): always shown, one line, after the agents' so they stack below.
  const avatarTags: Array<AvatarRef & { box: TagBox }> = [];
  for (const av of lan.avatars()) {
    const ch = officeState.characters.get(av.id);
    if (!ch || ch.matrixEffect === 'despawn') continue;
    if (!tagVisible(tagsHidden, av.id, null, null, true)) continue;
    avatarTags.push({
      ...av,
      box: {
        x: project.toScreenX(ch.x),
        y: project.toScreenY(
          ch.y + (ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0),
        ),
        w: (2 * LAN_TAG_PAD_X_PX + textWidth(av.label, LAN_TAG_FONT)) * k,
      },
    });
  }
  // Only visible tags take part in stacking (one line, the same height for both).
  const shown = boxes.map((_, i) => i).filter((i) => tags[i].show);
  const stacked = stackTags(
    [...shown.map((i) => boxes[i]), ...avatarTags.map((v) => v.box)],
    Math.max(LAN_TAG_HEIGHT_PX, AVATAR_TAG_HEIGHT_PX) * k,
    LAN_TAG_STACK_GAP_PX * k,
  );
  const tops: number[] = [];
  shown.forEach((i, k) => (tops[i] = stacked[k]));
  /** The red "!" above a head (a waiting agent, or an avatar holding one). */
  const alert = (key: string, ch: Character) => {
    const typing = ch.state === CharacterState.TYPE;
    nodes.push(
      <div
        key={key}
        className="absolute -translate-x-1/2 pointer-events-none"
        style={{
          left: project.toScreenX(ch.x),
          top:
            project.toScreenY(
              ch.y +
                (typing ? BUBBLE_SITTING_OFFSET_PX : 0) +
                (ch.pet ? PET_HEAD_DROP_PX : 0) -
                BUBBLE_VERTICAL_OFFSET_PX,
            ) -
            (permissionSprite.height * scale + zoom) / dpr,
          zIndex: LAN_PERMISSION_Z_INDEX,
        }}
      >
        <PermissionBubble cached={permissionSprite} dpr={dpr} scale={scale} />
      </div>,
    );
  };
  // My profile's tag colours also go on my own agents' tags (peers' agents keep the default).
  const mine = lan.avatars().find((v) => v.self);
  const waiting = lan.waitingPeers();
  for (const v of avatarTags) {
    const ch = officeState.characters.get(v.id);
    if (ch && waiting.has(v.peerId)) alert(`avatar!:${v.peerId}`, ch);
  }
  avatarTags.forEach((v, k) => {
    const lit = v.peerId === lan.highlightPeer;
    nodes.push(
      <div
        key={`avatar:${v.peerId}`}
        data-avatar-tag={v.self ? 'self' : 'other'}
        className={`absolute -translate-x-1/2 whitespace-nowrap text-sm leading-none px-3 py-1 pointer-events-none ${lit ? 'outline-2 outline-accent-bright' : ''}`}
        style={{
          left: v.box.x,
          top: stacked[shown.length + k],
          background: v.tagColors?.bg ?? 'var(--avatar-tag-bg)',
          color: v.tagColors?.fg ?? 'var(--avatar-tag-fg)',
          border: v.self ? '2px solid var(--avatar-tag-self-border)' : undefined,
          ...tagScale,
          zIndex: lit ? LAN_PERMISSION_Z_INDEX : LAN_TAG_Z_INDEX,
        }}
      >
        {v.label}
      </div>,
    );
  });
  for (let i = 0; i < tags.length; i++) {
    const { a, ch, text } = tags[i];
    const x = boxes[i].x;
    const lit = a.peer.id === lan.highlightPeer;
    const own = !lit && a.peer.id === mine?.peerId ? mine.tagColors : undefined;
    if (tags[i].show)
      nodes.push(
        <div
          key={a.key}
          data-agent-key={a.key}
          className={`absolute -translate-x-1/2 flex items-center gap-4 whitespace-nowrap text-sm leading-none px-3 py-1 pointer-events-none ${lit ? 'bg-accent text-on-accent outline-2 outline-accent-bright' : own ? '' : 'bg-bg/75 text-text'}`}
          style={{
            left: x,
            top: tops[i],
            ...tagScale,
            ...(own && { background: own.bg, color: own.fg }),
            zIndex: lit ? LAN_PERMISSION_Z_INDEX : LAN_TAG_Z_INDEX,
          }}
        >
          <span
            data-badge={a.kind}
            className="shrink-0 px-2 text-2xs font-bold leading-none"
            style={badgeColors(a.kind)}
          >
            {tagBadge(a)}
          </span>
          {text}
        </div>,
      );
    if (a.permission) alert(`${a.key}!`, ch);
  }

  // Tags & bubbles shown: every working agent also has a speech bubble above its head (provider
  // badge + what it does), drawn like the chat bubbles: pixel panel, tail down to the head.
  if (!tagsHidden) {
    const lines: Array<{
      key: string;
      a: OfficeAgent;
      text: string;
      /** Icon-only bubble (zoomed out): drawn at screen size, not scaled. */
      icon?: IconId;
      inline?: IconId;
      elapsed: string;
      /** The bubble's own scale: k, or 1 for the icon-only one. */
      s: number;
      /** Personal mode: the text wrapped, ≤ LAN_ACTIVITY_PERSONAL_LINES (else one clipped line). */
      rows?: string[];
      x: number;
      head: number;
      w0: number;
      w: number;
      h: number;
      bottom: number;
    }> = [];
    for (const { a, ch } of tags) {
      if (ch.id === officeState.hoveredAgentId || ch.mergeInto !== undefined) continue;
      const text = activityText(a);
      const typing = ch.state === CharacterState.TYPE;
      const head = project.toScreenY(
        ch.y +
          (typing ? CHARACTER_SITTING_OFFSET_PX : 0) +
          (ch.pet ? PET_HEAD_DROP_PX : 0) -
          LAN_BUBBLE_HEAD_OFFSET,
      );
      if (a.fail && !a.permission)
        nodes.push(failDrop(`fail:${a.key}`, project.toScreenX(ch.x + FAIL_DROP_OFFSET_X), head));
      // The ❗ already says "waiting": no act icon on it.
      const icon = a.permission ? null : actIcon(a);
      const elapsed = elapsedText(a.ageSec);
      if (iconOnly(k, ACT_ICON_ONLY_BELOW_SCALE)) {
        // Zoomed out, text unreadable: the icon alone (none when idle or waiting).
        if (!icon) continue;
        const pad = LAN_ACTIVITY_PAD_X_PX + CHAT_BORDER_PX;
        const side = ACT_ICON_SCREEN_PX + 2 * pad;
        lines.push({
          key: a.key,
          a,
          text,
          icon,
          elapsed,
          s: 1,
          x: project.toScreenX(ch.x),
          head,
          w0: side,
          w: side,
          h: side + (a.todo ? TODO_BAR_HEIGHT_PX + STATUS_PART_GAP_PX : 0),
          bottom: head - CHAT_TAIL_PX,
        });
        continue;
      }
      const chrome =
        2 * (LAN_ACTIVITY_PAD_X_PX + CHAT_BORDER_PX) +
        LAN_TAG_BADGE_CHROME_PX +
        textWidth(providerName(a), LAN_TAG_BADGE_FONT) +
        (personal ? LAN_ACTIVITY_BADGE_GAP_PX : 0) +
        (icon ? ACT_ICON_INLINE_PX + STATUS_PART_GAP_PX : 0) +
        chipW(todoText(a)) +
        chipW(elapsed);
      const rows = personal
        ? clampRows(
            wrapLines(text, LAN_ACTIVITY_MAX_WIDTH_PX - chrome, measureTag),
            LAN_ACTIVITY_PERSONAL_LINES,
            LAN_ACTIVITY_MAX_WIDTH_PX - chrome,
            measureTag,
          )
        : undefined;
      const lineH = rows && rows.length > 1 ? LAN_ACTIVITY_LINE_PX : LAN_TAG_LINE_PX;
      lines.push({
        key: a.key,
        a,
        text,
        rows,
        inline: icon ?? undefined,
        elapsed,
        s: k,
        x: project.toScreenX(ch.x),
        head,
        // Unscaled size; w/h/bottom below are on screen (× k).
        w0: Math.min(
          LAN_ACTIVITY_MAX_WIDTH_PX,
          chrome + Math.max(...(rows ?? [text]).map(measureTag)),
        ),
        w: 0,
        h: ((rows?.length ?? 1) * lineH + 2 * (LAN_ACTIVITY_PAD_Y_PX + CHAT_BORDER_PX)) * k,
        bottom: head - CHAT_TAIL_PX * k,
      });
    }
    for (const l of lines) l.w = l.w0 * l.s;
    const bottoms = stackBubbles(lines, LAN_TAG_STACK_GAP_PX * k);
    lines.forEach((l, i) =>
      nodes.push(
        <div
          key={`act-tail:${l.key}`}
          className="absolute pointer-events-none"
          style={{
            left: l.x - (CHAT_BORDER_PX * l.s) / 2,
            top: bottoms[i],
            width: CHAT_BORDER_PX * l.s,
            height: Math.max(0, l.head - bottoms[i]),
            background: 'var(--agent-bubble-border)',
            zIndex: LAN_TAG_Z_INDEX,
          }}
        />,
        l.icon ? (
          <div
            key={`act:${l.key}`}
            data-activity={l.key}
            data-icon-only
            className="bubble-agent flex flex-col items-center pointer-events-none"
            style={{
              left: l.x - l.w / 2,
              top: bottoms[i] - l.h,
              width: l.w,
              height: l.h,
              padding: `${LAN_ACTIVITY_PAD_X_PX}px`,
              gap: STATUS_PART_GAP_PX,
              zIndex: LAN_TAG_Z_INDEX,
              ...(elapsedWarn(l.a) && { borderColor: 'var(--elapsed-warn-fg)' }),
            }}
          >
            <ActIcon icon={l.icon} size={ACT_ICON_SCREEN_PX} />
            {l.a.todo && (
              <span
                className="block w-full shrink-0"
                style={{
                  height: TODO_BAR_HEIGHT_PX,
                  background: `linear-gradient(to right, var(--todo-fill) ${todoPercent(l.a)}%, var(--todo-track) ${todoPercent(l.a)}%)`,
                }}
              />
            )}
          </div>
        ) : (
          <div
            key={`act:${l.key}`}
            data-activity={l.key}
            className={`bubble-agent flex gap-4 whitespace-nowrap text-sm leading-none pointer-events-none ${l.rows && l.rows.length > 1 ? 'items-start' : 'items-center'}`}
            style={{
              left: l.x - l.w / 2,
              top: bottoms[i] - l.h,
              width: l.w0,
              height: l.h / k,
              transform: `scale(${k})`,
              transformOrigin: '0 0',
              padding: `${LAN_ACTIVITY_PAD_Y_PX}px ${LAN_ACTIVITY_PAD_X_PX}px`,
              zIndex: LAN_TAG_Z_INDEX,
            }}
          >
            <span
              data-provider={l.a.provider}
              className="shrink-0 px-2 text-2xs font-bold leading-none"
              style={{
                background: LAN_PROVIDER_COLORS[l.a.provider],
                color: LAN_PROVIDER_BADGE_FG,
              }}
            >
              {providerName(l.a)}
            </span>
            {l.inline && <ActIcon icon={l.inline} size={ACT_ICON_INLINE_PX} />}
            {l.rows && l.rows.length > 1 ? (
              <span
                className="min-w-0 flex flex-col"
                style={{ lineHeight: `${LAN_ACTIVITY_LINE_PX}px` }}
              >
                {l.rows.map((r, j) => (
                  <span key={j} className="whitespace-pre">
                    {r}
                  </span>
                ))}
              </span>
            ) : (
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis">{l.text}</span>
            )}
            {l.a.todo && <TodoChip a={l.a} />}
            {l.elapsed && (
              <span
                data-elapsed={l.elapsed}
                className="shrink-0 text-2xs font-bold leading-none"
                style={{
                  padding: `1px ${STATUS_CHIP_PAD_X_PX}px`,
                  color: elapsedWarn(l.a) ? 'var(--elapsed-warn-fg)' : undefined,
                  opacity: elapsedWarn(l.a) ? 1 : 0.7,
                }}
              >
                {l.elapsed}
              </span>
            )}
          </div>
        ),
      ),
    );
  }

  const hoveredId = officeState.hoveredAgentId;
  const hovered = hoveredId !== null ? lan.agentFor(hoveredId) : undefined;
  const hoveredCh = hoveredId !== null ? officeState.characters.get(hoveredId) : undefined;
  if (hovered && hoveredCh) {
    const typing = hoveredCh.state === CharacterState.TYPE;
    nodes.push(
      <div
        key="hover"
        data-tour="hover-bubble"
        className="absolute -translate-x-1/2 -translate-y-full pixel-panel px-8 py-6 flex flex-col gap-4 w-max text-sm leading-snug break-words pointer-events-none"
        style={{
          left: project.toScreenX(hoveredCh.x),
          top: project.toScreenY(
            hoveredCh.y +
              (typing ? CHARACTER_SITTING_OFFSET_PX : 0) +
              (hoveredCh.pet ? PET_HEAD_DROP_PX : 0) -
              LAN_BUBBLE_HEAD_OFFSET,
          ),
          maxWidth: LAN_BUBBLE_MAX_WIDTH_PX,
          zIndex: LAN_BUBBLE_Z_INDEX,
        }}
      >
        <span className="font-bold">
          {hovered.permission && (
            <>
              <span style={{ color: LAN_ALERT_COLOR }}>!</span> {t('bubble.permission')} ·{' '}
            </>
          )}
          {t(`room.${hovered.room}`)}
        </span>
        <span>{activityText(hovered)}</span>
        {hovered.reason && <span className="text-text-muted">“{hovered.reason}”</span>}
      </div>,
    );
  }
  return <>{nodes}</>;
}
