import { type MutableRefObject, type RefObject, useEffect, useState } from 'react';

import {
  AVATAR_LIST_GAP_PX,
  AVATAR_LIST_WIDTH_PX,
  AVATAR_LIST_Z_INDEX,
  CHARACTER_SITTING_OFFSET_PX,
  LAN_BUBBLE_HEAD_OFFSET,
  PET_HEAD_DROP_PX,
} from '../constants.js';
import { onFrame } from '../office/engine/gameLoop.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { overlayProjection } from '../office/projection.js';
import { CharacterState, TILE_SIZE } from '../office/types.js';
import { type LanAgents, tagText } from './lanAgents.js';
import { AgentCard } from './RoomPlates.js';
import { listSide } from './transcript.js';

interface AvatarAgentListProps {
  officeState: OfficeState;
  lan: LanAgents;
  peerId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: MutableRefObject<{ x: number; y: number }>;
  onPick(agentId: string): void;
  onClose(): void;
}

/**
 * My agents folded into my avatar (the lounge), listed beside it: right of it,
 * or left when the right side is off screen; kept inside the view vertically.
 * Follows the avatar (re-rendered on every canvas frame, like RoomTip). Closes
 * itself when my PC is no longer the selection (empty floor, another click).
 */
export function AvatarAgentList({
  officeState,
  lan,
  peerId,
  containerRef,
  zoom,
  panRef,
  onPick,
  onClose,
}: AvatarAgentListProps) {
  const [, setTick] = useState(0);
  useEffect(() => onFrame(() => setTick((n) => n + 1)), []);
  const [height, setHeight] = useState(0);
  const deselected = officeState.selectedPeer !== peerId || officeState.selectedAgentId !== null;
  useEffect(() => {
    if (deselected) onClose();
  }, [deselected, onClose]);

  const el = containerRef.current;
  const avatarId = lan.avatars().find((a) => a.peerId === peerId)?.id;
  const ch = avatarId !== undefined ? officeState.characters.get(avatarId) : undefined;
  const agents = lan.loungeAgentsOf(peerId);
  if (deselected || !el || !ch || agents.length === 0) return null;

  const rect = el.getBoundingClientRect();
  const p = overlayProjection(
    officeState.getLayout(),
    rect,
    zoom,
    panRef.current,
    window.devicePixelRatio || 1,
  );
  const rightEdge = p.toScreenX(ch.x + TILE_SIZE / 2);
  const leftEdge = p.toScreenX(ch.x - TILE_SIZE / 2);
  const head = p.toScreenY(
    ch.y +
      (ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0) +
      (ch.pet ? PET_HEAD_DROP_PX : 0) -
      LAN_BUBBLE_HEAD_OFFSET,
  );
  const side = listSide(rightEdge, AVATAR_LIST_WIDTH_PX, rect.width, AVATAR_LIST_GAP_PX);
  const left =
    side === 'right'
      ? rightEdge + AVATAR_LIST_GAP_PX
      : Math.max(AVATAR_LIST_GAP_PX, leftEdge - AVATAR_LIST_GAP_PX - AVATAR_LIST_WIDTH_PX);
  const top = Math.max(
    AVATAR_LIST_GAP_PX,
    Math.min(head, rect.height - height - AVATAR_LIST_GAP_PX),
  );
  const byKey = new Map(lan.all().map((a) => [a.key, a] as const));

  return (
    <div
      ref={(node) => {
        if (node && node.offsetHeight !== height) setHeight(node.offsetHeight);
      }}
      data-avatar-agent-list={peerId}
      data-side={side}
      className="absolute pixel-panel flex flex-col gap-4 px-6 py-6 overflow-y-auto"
      style={{
        left: Math.round(left),
        top: Math.round(top),
        width: AVATAR_LIST_WIDTH_PX,
        maxHeight: Math.max(0, rect.height - 2 * AVATAR_LIST_GAP_PX),
        zIndex: AVATAR_LIST_Z_INDEX,
      }}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Keys on a card (arrows, Enter) never move my avatar; Esc goes on to App's
        // window handler, which closes the list and drops the selection.
        if (e.key !== 'Escape') e.stopPropagation();
      }}
    >
      {agents.map((a) => {
        const parent = a.parentKey !== undefined ? byKey.get(a.parentKey) : undefined;
        return (
          <button
            key={a.key}
            type="button"
            aria-label={tagText(a, parent)}
            className="text-left px-2 py-2 hover:bg-btn-hover"
            onClick={() => onPick(a.id)}
          >
            <AgentCard a={a} parent={parent} />
          </button>
        );
      })}
    </div>
  );
}
