// People panel areas: public / team / personal sections built from peopleDirectory.

import { PERSONAL_VIEW, PUBLIC_VIEW } from '../../../core/src/lan.js';
import type { DirectoryPersonMessage, PeopleDirectory } from '../../../core/src/messages.js';
import { peerLabel, tieBreak } from './nicknames.js';
import type { PersonRow } from './peopleModel.js';

export type AreaKey = 'public' | 'team' | 'personal';

export interface AreaSection {
  area: AreaKey;
  /** PUBLIC_VIEW, the team tag, or PERSONAL_VIEW. */
  view: string;
  /** Team name, '' = unknown (shown as office.unnamed); '' for public/personal. */
  name: string;
  /** Self first, then peerLabel, then peerId; names tie-broken within the area (tieBreak). */
  people: DirectoryPersonMessage[];
  /** This area is the office on screen (its rows keep the full panel behaviour). */
  viewed: boolean;
  /** The directory has no area for the viewed office yet (a team just joined): its rows are the snapshot as is. */
  fallback?: true;
}

export const EMPTY_DIRECTORY: Omit<PeopleDirectory, 'type'> = {
  public: [],
  teams: [],
  personal: [],
};

/** One entry per peerId (self wins: a spoofed id must not duplicate a React key), tie-broken, sorted. */
function arrange(people: DirectoryPersonMessage[]): DirectoryPersonMessage[] {
  const uniq = new Map<string, DirectoryPersonMessage>();
  for (const p of people) {
    const prev = uniq.get(p.peerId);
    if (!prev || (p.self && !prev.self)) uniq.set(p.peerId, p);
  }
  const shown = tieBreak([...uniq.values()]);
  return [...uniq.values()]
    .map((p) => ({ ...p, ...shown.get(p.peerId) }))
    .sort(
      (a, b) =>
        Number(b.self) - Number(a.self) ||
        peerLabel(a).localeCompare(peerLabel(b)) ||
        a.peerId.localeCompare(b.peerId),
    );
}

/** [public, ...teams by name then tag, personal]; no team sections without a team. */
export function areaSections(
  dir: Omit<PeopleDirectory, 'type'>,
  activeView: string,
): AreaSection[] {
  const section = (
    area: AreaKey,
    view: string,
    name: string,
    people: DirectoryPersonMessage[],
  ) => ({
    area,
    view,
    name,
    people: arrange(people),
    viewed: view === activeView,
  });
  const teams = [...dir.teams].sort(
    (a, b) => a.name.localeCompare(b.name) || a.tag.localeCompare(b.tag),
  );
  const known = activeView === PUBLIC_VIEW || activeView === PERSONAL_VIEW;
  const pending: AreaSection[] =
    known || teams.some((t) => t.tag === activeView)
      ? []
      : [{ ...section('team', activeView, '', []), fallback: true }];
  return [
    section('public', PUBLIC_VIEW, '', dir.public),
    ...teams.map((t) => section('team', t.tag, t.name, t.people)),
    ...pending,
    section('personal', PERSONAL_VIEW, '', dir.personal),
  ];
}

/**
 * The viewed office's snapshot rows the panel lists: its area's members (the
 * directory decides, deduped by last heard), plus snapshot people in no area at
 * all (≤ 1.0.24 peers, the tour's demo PCs). A PC the directory puts in another
 * area (just switched mode, the snapshot still has it) is dropped. No directory
 * area for the viewed office yet: the snapshot as is.
 */
export function viewedRows(sections: AreaSection[], rows: PersonRow[]): PersonRow[] {
  const viewed = sections.find((s) => s.viewed);
  if (!viewed || viewed.fallback) return rows;
  const elsewhere = new Set(
    sections.filter((s) => s !== viewed).flatMap((s) => s.people.map((p) => p.peerId)),
  );
  const members = new Set(viewed.people.map((p) => p.peerId));
  return rows.filter((r) => members.has(r.person.peerId) || !elsewhere.has(r.person.peerId));
}

/** Area people the viewed office's snapshot rows do not have (shown as plain rows). */
export function viewedExtras(section: AreaSection, rows: PersonRow[]): DirectoryPersonMessage[] {
  const inRows = new Set(rows.map((r) => r.person.peerId));
  return section.people.filter((p) => !inRows.has(p.peerId));
}

/** Distinct peerIds over every section and the snapshot rows (the panel title). */
export function totalPeople(sections: AreaSection[], rows: PersonRow[]): number {
  return new Set([
    ...sections.flatMap((s) => s.people.map((p) => p.peerId)),
    ...rows.map((r) => r.person.peerId),
  ]).size;
}
