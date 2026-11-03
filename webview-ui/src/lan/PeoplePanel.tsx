import { useEffect, useRef, useState } from 'react';

import type { DirectoryPersonMessage } from '../../../core/src/messages.js';
import {
  MOBILE_MEDIA_QUERY,
  PEOPLE_COLLAPSED_KEY,
  PEOPLE_FACE_CROP,
  PEOPLE_FACE_SCALE,
  PEOPLE_HINT_MS,
  PEOPLE_PET_FACE_CROP,
  PEOPLE_WIDE_MIN_PX,
} from '../constants.js';
import { type Key, t, useLang } from '../i18n.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { type AreaSection, totalPeople, viewedExtras } from './directoryModel.js';
import type { LanAgents } from './lanAgents.js';
import { peerLabel } from './nicknames.js';
import { focusHintKey, inFrozenOrder, type PersonRow } from './peopleModel.js';
import { CharacterPreview } from './ProfileModal.js';

/** Remembered choice, else expanded only on a wide, non-mobile screen. */
function initialCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(PEOPLE_COLLAPSED_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    /* storage blocked: fall back to the screen width */
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches || window.innerWidth < PEOPLE_WIDE_MIN_PX;
}

function counts(r: PersonRow): string {
  const parts = [];
  if (r.claude) parts.push(`Claude ${r.claude}`);
  if (r.codex) parts.push(`Codex ${r.codex}`);
  return parts.length ? parts.join(' · ') : t('people.noAgents');
}

function StatusMark({ status }: { status: PersonRow['status'] }) {
  const label = t(`people.status.${status}`);
  if (status === 'attention') {
    return (
      <span role="img" aria-label={label} title={label} className="w-12 text-center shrink-0">
        ❗
      </span>
    );
  }
  return (
    <span className="w-12 flex justify-center shrink-0" title={label}>
      <span
        role="img"
        aria-label={label}
        className={`w-6 h-6 ${status === 'working' ? 'bg-status-success' : 'bg-text-muted'}`}
      />
    </span>
  );
}

function Face({ person }: { person: DirectoryPersonMessage }) {
  return (
    <span className="shrink-0 flex bg-bg-dark border-2 border-border">
      <CharacterPreview
        palette={person.palette}
        hueShift={person.hueShift}
        pet={person.pet}
        scale={PEOPLE_FACE_SCALE}
        crop={person.pet ? PEOPLE_PET_FACE_CROP : PEOPLE_FACE_CROP}
      />
    </span>
  );
}

/** A person outside the viewed office (or not in its snapshot): face + name, no actions. */
function PlainRow({ person }: { person: DirectoryPersonMessage }) {
  return (
    <li className="flex items-center gap-8 py-3 px-8 text-text">
      <Face person={person} />
      <span className="flex-1 min-w-0 truncate">
        {peerLabel(person)}
        {person.self && ` ${t('people.you')}`}
      </span>
    </li>
  );
}

const AREA_HEADING = 'text-xs font-bold py-3 px-8 border-t-2 border-border';

interface PeoplePanelProps {
  rows: PersonRow[];
  /** Public / team / personal areas (areaSections); the viewed one shows `rows`. */
  sections: AreaSection[];
  lan: LanAgents;
  officeState: OfficeState;
  /** The tour's people step shows it expanded regardless of the viewer's choice. */
  forceOpen: boolean;
}

/**
 * Right-edge list of people by area (public office, team, personal). The viewed
 * office's rows: click = camera follows the person's agent; hover = their name
 * tags light up (LanAgents.highlightPeer). Other areas: face + name only.
 */
export function PeoplePanel({
  rows: live,
  sections,
  lan,
  officeState,
  forceOpen,
}: PeoplePanelProps) {
  useLang();
  // Rows must not jump under a resting pointer: while it is over the list the order is frozen.
  const [hovered, setHovered] = useState(false);
  const frozen = useRef<string[]>([]);
  if (!hovered) frozen.current = live.map((r) => r.person.peerId);
  const rows = hovered ? inFrozenOrder(live, frozen.current) : live;
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (hint === null) return;
    const timer = setTimeout(() => setHint(null), PEOPLE_HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);
  // Unmounted mid-hover: no tag stays lit.
  useEffect(() => () => void (lan.highlightPeer = null), [lan]);
  // A highlighted person who left the list (or a row set that changed): no stale lit tags.
  const peerIds = live.map((r) => r.person.peerId).join('\n');
  useEffect(() => {
    if (lan.highlightPeer !== null && !peerIds.split('\n').includes(lan.highlightPeer)) {
      lan.highlightPeer = null;
    }
  }, [lan, peerIds]);

  const open = forceOpen || !collapsed;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(PEOPLE_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  };
  const focus = (r: PersonRow) => {
    const id = r.focusKey !== null ? lan.idFor(r.focusKey) : undefined;
    if (id === undefined) setHint(r.person.peerId);
    else officeState.selectAndFollow(id);
  };

  const count = t('people.title', { n: String(totalPeople(sections, live)) });

  const liveRows = rows.map((r) => (
    <li key={r.person.peerId}>
      <button
        type="button"
        onClick={() => focus(r)}
        onMouseEnter={() => (lan.highlightPeer = r.person.peerId)}
        onMouseLeave={() => (lan.highlightPeer = null)}
        onFocus={() => (lan.highlightPeer = r.person.peerId)}
        onBlur={() => (lan.highlightPeer = null)}
        className="w-full flex items-center gap-8 py-3 px-8 bg-transparent border-0 text-left text-text cursor-pointer hover:bg-btn-hover"
      >
        <Face person={r.person} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="truncate">
            {r.person.account}
            {r.person.nickname && <span className="text-text-muted"> ({r.person.nickname})</span>}
            {r.person.self && ` ${t('people.you')}`}
          </span>
          <span
            className={`text-xs truncate ${hint === r.person.peerId ? 'text-warning' : 'text-text-muted'}`}
          >
            {hint === r.person.peerId ? t(focusHintKey(r)) : counts(r)}
          </span>
        </span>
        <StatusMark status={r.status} />
      </button>
    </li>
  ));

  /** One area: its people (the viewed one = live rows + directory people missing from them). */
  const area = (s: AreaSection, heading: Key) => {
    const extras = s.viewed ? viewedExtras(s, live) : s.people;
    const n = (s.viewed ? live.length : 0) + extras.length;
    return (
      <li key={s.view}>
        <div className={AREA_HEADING}>
          {t(heading, { n: String(n), name: s.name || t('office.unnamed') })}
        </div>
        <ul className="m-0 p-0 list-none">
          {s.viewed && liveRows}
          {extras.map((p) => (
            <PlainRow key={p.peerId} person={p} />
          ))}
          {n === 0 && (
            <li className="py-3 px-8 text-xs text-text-muted">{t('people.area.empty')}</li>
          )}
        </ul>
      </li>
    );
  };
  const teams = sections.filter((s) => s.area === 'team');
  const teamCount = new Set(
    teams.flatMap((s) => [
      ...s.people.map((p) => p.peerId),
      ...(s.viewed ? live.map((r) => r.person.peerId) : []),
    ]),
  ).size;

  return (
    // Whatever height the top-right stack leaves below the popups; the panel centres in it.
    <div className="flex-1 min-h-0 flex items-center pointer-events-none max-w-[min(260px,100%)]">
      <div
        data-tour="people"
        className="pointer-events-auto pixel-panel flex flex-col text-sm max-w-full max-h-full min-h-0"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${count}, ${open ? t('people.hide') : t('people.show')}`}
          onClick={toggle}
          className="flex items-center justify-between gap-8 py-4 px-8 bg-transparent border-0 text-text cursor-pointer font-bold whitespace-nowrap"
        >
          <span>{count}</span>
          <span aria-hidden>{open ? '▸' : '◂'}</span>
        </button>
        {open && (
          <ul
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="m-0 p-0 list-none overflow-y-auto"
          >
            {sections.flatMap((s) =>
              s.area !== 'team'
                ? area(s, s.area === 'public' ? 'people.area.public' : 'people.area.personal')
                : [
                    s === teams[0] && (
                      <li key="team" className={AREA_HEADING}>
                        {t('people.area.team', { n: String(teamCount) })}
                      </li>
                    ),
                    area(s, 'people.area.teamName'),
                  ],
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
