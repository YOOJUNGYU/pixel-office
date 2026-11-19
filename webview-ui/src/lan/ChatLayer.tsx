import { type MutableRefObject, type RefObject, useEffect, useRef, useState } from 'react';

import { CHAT_MAX_CHARS, takeCodePoints } from '../../../core/src/lan.js';
import {
  CHARACTER_SITTING_OFFSET_PX,
  CHAT_BAR_BOTTOM_PX,
  CHAT_BAR_WIDTH_PX,
  CHAT_BORDER_PX,
  CHAT_DELETE_GAP_PX,
  CHAT_DELETE_PX,
  CHAT_FONT,
  CHAT_INPUT_Z_INDEX,
  CHAT_LINE_PX,
  CHAT_PAD_X_PX,
  CHAT_PAD_Y_PX,
  CHAT_STACK_GAP_PX,
  CHAT_TAIL_PX,
  CHAT_TEXT_MAX_PX,
  CHAT_TEXT_OPEN_MAX_PX,
  CHAT_Z_INDEX,
  LAN_BUBBLE_HEAD_OFFSET,
  PET_HEAD_DROP_PX,
} from '../constants.js';
import { t } from '../i18n.js';
import { onFrame } from '../office/engine/gameLoop.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { overlayProjection } from '../office/projection.js';
import { CharacterState } from '../office/types.js';
import { bubbleScale, type ChatBubbles, stackBubbles, wrapLines } from './chat.js';
import type { LanAgents } from './lanAgents.js';
import { textWidth } from './textWidth.js';

/** IME composition in progress (Korean): Enter there confirms the syllable, not the message. */
const IME_KEYCODE = 229;

interface ChatLayerProps {
  officeState: OfficeState;
  lan: LanAgents;
  chats: ChatBubbles;
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: MutableRefObject<{ x: number; y: number }>;
  /** The chat bar is shown (I am in the viewed office; not editing, touring, read-only or on touch). */
  canType: boolean;
  /** Set my status; false = refused (empty, too soon). */
  onSend: (text: string) => boolean;
  /** Clear my status. */
  onDelete: () => void;
}

/** The × that clears my status (on its tag and next to the bar). */
function DeleteButton({ onDelete, testId }: { onDelete: () => void; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={t('chat.delete')}
      title={t('chat.delete')}
      className="pointer-events-auto shrink-0 flex items-center justify-center text-sm font-bold text-text-muted hover:text-text hover:bg-btn-hover cursor-pointer"
      style={{ width: CHAT_DELETE_PX, height: CHAT_DELETE_PX, lineHeight: 1 }}
      onClick={onDelete}
    >
      ×
    </button>
  );
}

/**
 * Status messages: a one-line tag above each person's avatar (it follows the avatar as it
 * walks, and pan/zoom; a clipped one shows whole on hover), and the status bar at the bottom
 * centre, which edits my current status in place. Space+Enter with nothing
 * focused focuses the bar; Esc leaves it (the arrow keys move the avatar
 * again). Re-rendered after every canvas frame. All text is React text nodes.
 */
export function ChatLayer({
  officeState,
  lan,
  chats,
  containerRef,
  zoom,
  panRef,
  canType,
  onSend,
  onDelete,
}: ChatLayerProps) {
  const [, setTick] = useState(0);
  useEffect(() => onFrame(() => setTick((n) => n + 1)), []);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  /** The clipped status tag under the pointer (`peerId:id`): shown whole. */
  const [hovered, setHovered] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canType) return;
    let spaceHeld = false;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      // Only from the office itself: a focused button/field keeps its own Space/Enter.
      if (el && el !== document.body && el.tagName !== 'CANVAS') return;
      if (e.code === 'Space') {
        spaceHeld = true;
        return;
      }
      if (e.key !== 'Enter' || !spaceHeld || e.ctrlKey || e.metaKey || e.altKey || e.isComposing)
        return;
      e.preventDefault();
      spaceHeld = false;
      inputRef.current?.focus();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld = false;
    };
    const onBlur = () => (spaceHeld = false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [canType]);

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
  const k = bubbleScale(zoom, dpr);

  const avatarOf = new Map(lan.avatars().map((a) => [a.peerId, a.id] as const));
  const measure = (s: string) => textWidth(s, CHAT_FONT);
  const tags = chats.active().flatMap((b) => {
    const id = avatarOf.get(b.peerId);
    const ch = id !== undefined ? officeState.characters.get(id) : undefined;
    if (!ch || ch.matrixEffect === 'despawn') return [];
    // One line, clipped with …; hovered = the whole status, wrapped.
    const open = hovered === `${b.peerId}:${b.id}`;
    const full = Math.ceil(measure(b.text));
    const clipped = full > CHAT_TEXT_MAX_PX;
    const lines = open && clipped ? wrapLines(b.text, CHAT_TEXT_OPEN_MAX_PX, measure) : [b.text];
    const text =
      open && clipped
        ? Math.ceil(Math.max(...lines.map(measure)))
        : Math.min(full, CHAT_TEXT_MAX_PX);
    const inner = text + (b.self ? CHAT_DELETE_GAP_PX + CHAT_DELETE_PX : 0);
    const at = {
      x: project.toScreenX(ch.x),
      y: project.toScreenY(
        ch.y +
          (ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0) +
          (ch.pet ? PET_HEAD_DROP_PX : 0) -
          LAN_BUBBLE_HEAD_OFFSET,
      ),
    };
    return [
      {
        b,
        at,
        open,
        clipped,
        lines: lines.length,
        // On screen (× k); the tag itself is laid out unscaled and transformed.
        box: {
          x: at.x,
          bottom: at.y - CHAT_TAIL_PX * k,
          w: (inner + 2 * (CHAT_PAD_X_PX + CHAT_BORDER_PX)) * k,
          h: (lines.length * CHAT_LINE_PX + 2 * (CHAT_PAD_Y_PX + CHAT_BORDER_PX)) * k,
        },
      },
    ];
  });
  const bottoms = stackBubbles(
    tags.map((x) => x.box),
    CHAT_STACK_GAP_PX * k,
  );

  const nodes = tags.map(({ b, at, box, open, clipped }, i) => {
    const key = `${b.peerId}:${b.id}`;
    return (
      <div key={key} className="pointer-events-none" data-chat-peer={b.peerId}>
        {/* Stem from the tag down to the head, however far stacking moved it up. */}
        <div
          className="absolute"
          style={{
            left: at.x - (CHAT_BORDER_PX * k) / 2,
            top: bottoms[i],
            width: CHAT_BORDER_PX * k,
            height: Math.max(0, at.y - bottoms[i]),
            background: 'var(--chat-bubble-border)',
            zIndex: CHAT_Z_INDEX,
          }}
        />
        <div
          className={`status-tag flex items-start${clipped ? ' pointer-events-auto' : ''}`}
          data-status-open={open || undefined}
          onMouseEnter={clipped ? () => setHovered(key) : undefined}
          onMouseLeave={clipped ? () => setHovered(null) : undefined}
          // the canvas zooms on its own wheel listener: hand the wheel on to it
          onWheel={
            clipped
              ? (e) =>
                  el.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', e.nativeEvent))
              : undefined
          }
          style={{
            left: box.x - box.w / 2,
            top: bottoms[i] - box.h,
            width: box.w / k,
            transform: `scale(${k})`,
            transformOrigin: '0 0',
            padding: `${CHAT_PAD_Y_PX}px ${CHAT_PAD_X_PX}px`,
            gap: CHAT_DELETE_GAP_PX,
            zIndex: open ? CHAT_Z_INDEX + 1 : CHAT_Z_INDEX,
          }}
        >
          <span
            data-chat-text
            className={`flex-1 min-w-0 text-sm${open ? '' : ' whitespace-nowrap overflow-hidden text-ellipsis'}`}
            style={{ lineHeight: `${CHAT_LINE_PX}px`, overflowWrap: 'anywhere' }}
          >
            {b.text}
          </span>
          {b.self && (
            <span style={{ marginTop: (CHAT_LINE_PX - CHAT_DELETE_PX) / 2 }}>
              <DeleteButton onDelete={onDelete} testId="chat-delete" />
            </span>
          )}
        </div>
      </div>
    );
  });

  if (canType) {
    const mine = chats.mine()?.text ?? '';
    /** Enter: set my status (empty = clear it; unchanged = nothing to send), then leave the bar. */
    const apply = (input: HTMLInputElement) => {
      const text = draft.trim();
      if (text === mine) input.blur();
      else if (!text) {
        onDelete();
        input.blur();
      } else if (onSend(text)) input.blur();
    };
    nodes.push(
      <div
        key="chat-bar"
        data-tour="chat-bar"
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4 max-w-[calc(100%-20px)]"
        style={{ bottom: CHAT_BAR_BOTTOM_PX, width: CHAT_BAR_WIDTH_PX, zIndex: CHAT_INPUT_Z_INDEX }}
      >
        <input
          ref={inputRef}
          data-testid="chat-input"
          aria-label={t('chat.label')}
          className="pixel-panel flex-1 min-w-0 text-sm text-text px-8 py-4 outline-none"
          placeholder={t('chat.placeholder')}
          // Unfocused it shows my current status; focused it edits a copy of it.
          value={editing ? draft : mine}
          onFocus={(e) => {
            setDraft(mine);
            setEditing(true);
            e.currentTarget.select();
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => setDraft(takeCodePoints(e.target.value, CHAT_MAX_CHARS))}
          onKeyDown={(e) => {
            e.stopPropagation(); // never reaches the editor/tour shortcuts or the avatar keys
            if (e.nativeEvent.isComposing || e.keyCode === IME_KEYCODE) return;
            if (e.key === 'Enter') apply(e.currentTarget);
            else if (e.key === 'Escape') e.currentTarget.blur();
          }}
        />
        {chats.mine() && (
          <span className="pixel-panel flex items-center p-4">
            <DeleteButton onDelete={onDelete} testId="chat-bar-delete" />
          </span>
        )}
      </div>,
    );
  }
  return <>{nodes}</>;
}
