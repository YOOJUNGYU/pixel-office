// Helpers for the 🚪 rooms panel and every page path that leaves a hosted room (pure but
// confirmHandover, which asks).
import type {
  OfficePersonMessage,
  OfficesState,
  OfficeSummary,
} from '../../../core/src/messages.js';
import { t } from '../i18n.js';
import { peerLabel } from './nicknames.js';

export interface HandoverPrompt {
  key: 'rooms.handover' | 'rooms.handoverClose';
  /** The successor's label ('' = none: the room leaves the list). */
  next: string;
}

/** Moving off `office` (switcher tab, leave, create, join) while I host it on screen: the
 *  server refuses that without `handover: true`, so the page asks first. null = no question. */
export function handoverPrompt(
  office: OfficeSummary | undefined,
  activeView: string,
): HandoverPrompt | null {
  if (!office?.host || office.tag !== activeView) return null;
  const next = office.next ?? '';
  return { key: next ? 'rooms.handover' : 'rooms.handoverClose', next };
}

export interface RoomMember {
  peerId: string;
  label: string;
  host: boolean;
  me: boolean;
}

/** The room's members = the team view snapshot's live people. */
export const members = (people: OfficePersonMessage[], office: OfficeSummary): RoomMember[] =>
  people.map((p) => ({
    peerId: p.peerId,
    label: peerLabel(p),
    host: p.peerId === office.hostId,
    me: p.self,
  }));

/** Before any move off the room I host on screen: the handover question. null = cancelled,
 *  else what to add to the message (the server refuses the move without `handover: true`). */
export function confirmHandover(state: Omit<OfficesState, 'type'>): { handover?: true } | null {
  const ask = handoverPrompt(
    state.offices.find((o) => o.tag === state.activeView),
    state.activeView,
  );
  if (!ask) return {};
  return window.confirm(t(ask.key, { next: ask.next })) ? { handover: true } : null;
}
