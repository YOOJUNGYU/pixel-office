import { useEffect, useRef, useState } from 'react';

import type { DirectoryPersonMessage } from '../../../core/src/messages.js';
import {
  MOBILE_MEDIA_QUERY,
  NET_BADGE_COLORS,
  PEOPLE_COLLAPSED_KEY,
  PEOPLE_FACE_CROP,
  PEOPLE_FACE_SCALE,
  PEOPLE_HINT_MS,
  PEOPLE_PET_FACE_CROP,
  PEOPLE_WIDE_MIN_PX,
  VIA_BADGE_COLORS,
} from '../constants.js';
import type { RelayStatus } from '../hooks/useExtensionMessages.js';
import { type Key, t, useLang } from '../i18n.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { transport } from '../transport/index.js';
import { type AreaSection, totalPeople, viewedExtras, viewedRows } from './directoryModel.js';
import type { LanAgents } from './lanAgents.js';
import { netNumbers } from './netBadges.js';
import { peerLabel } from './nicknames.js';
import { focusHintKey, inFrozenOrder, type PersonRow, versionDiffers } from './peopleModel.js';
import { CharacterPreview } from './ProfileModal.js';
import { relayStatusView } from './relayStatus.js';

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

/** Hover text of a row: the person's app version. */
const verTitle = (p: DirectoryPersonMessage): string =>
  p.ver ? `v${p.ver}` : t('people.verOldTitle');

/** After the name, only when the version differs from mine: ` · v1.0.41` / ` · 구버전`. */
function VerMark({ person, mine }: { person: DirectoryPersonMessage; mine: string | undefined }) {
  if (!versionDiffers(person.ver, mine)) return null;
  return (
    <span className="text-2xs text-text-muted">
      {' · '}
      {person.ver ? `v${person.ver}` : t('people.verOld')}
    </span>
  );
}

/** "망 2" / "LAN 2": people with the same number reach each other directly. */
function NetBadge({ n }: { n: number | undefined }) {
  if (n === undefined) return null;
  const c = NET_BADGE_COLORS[(n - 1) % NET_BADGE_COLORS.length];
  return (
    <span
      title={t('people.netTitle')}
      className="shrink-0 px-2 text-2xs font-bold leading-normal"
      style={{ background: c.bg, color: c.fg }}
    >
      {t('people.net', { n: String(n) })}
    </span>
  );
}

/** Public office, other people: LAN (UDP) or 인터넷 (relay), whatever the networks. */
function ViaBadge({ via }: { via: DirectoryPersonMessage['via'] }) {
  if (!via) return null;
  const c = VIA_BADGE_COLORS[via];
  return (
    <span
      title={t(via === 'lan' ? 'people.via.lanTitle' : 'people.via.relayTitle')}
      className="shrink-0 px-2 text-2xs font-bold leading-normal"
      style={{ background: c.bg, color: c.fg }}
    >
      {t(via === 'lan' ? 'people.via.lan' : 'people.via.relay')}
    </span>
  );
}

/** Admin only (relayAdmin), public office rows other than mine: remove the PC from the relay.
 *  Hidden until the row is hovered (or the button has keyboard focus), then centred over it. */
function KickButton({ person }: { person: DirectoryPersonMessage }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!window.confirm(t('relay.kickConfirm', { name: peerLabel(person) }))) return;
        transport.send({ type: 'relayKick', peerId: person.peerId });
      }}
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 py-1 px-8 text-xs bg-btn-bg text-text border-2 border-border rounded-none shadow-pixel cursor-pointer hover:bg-btn-hover opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
    >
      {t('relay.kick')}
    </button>
  );
}

/** Next to the public area heading while it is on screen: the internet relay's state. */
function RelayChip({ relay }: { relay: RelayStatus }) {
  const v = relayStatusView(relay, relay.at);
  if (!v) return null;
  const text = t(v.key, { t: v.until ?? '' });
  const tone =
    v.tone === 'ok'
      ? 'text-status-success'
      : v.tone === 'warn'
        ? 'text-warning'
        : 'text-text-muted';
  return (
    <span title={text} className={`min-w-0 truncate font-normal ${tone}`}>
      {text}
    </span>
  );
}

/** A person outside the viewed office (or not in its snapshot): face + name, no actions. */
function PlainRow({
  person,
  net,
  kick,
  mine,
}: {
  person: DirectoryPersonMessage;
  net?: number;
  kick?: boolean;
  /** My own app version (VerMark). */
  mine: string | undefined;
}) {
  return (
    <li
      title={verTitle(person)}
      className={`flex items-center gap-8 py-3 px-8 text-text${kick ? ' relative group' : ''}`}
    >
      <Face person={person} />
      <span className="flex-1 min-w-0 truncate">
        {peerLabel(person)}
        {person.self && ` ${t('people.you')}`}
        <VerMark person={person} mine={mine} />
      </span>
      <ViaBadge via={person.via} />
      <NetBadge n={net} />
      {kick && <KickButton person={person} />}
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
  /** Internet relay state: a chip by the public heading while the public office is on screen. */
  relay: RelayStatus;
  /** An admin token is set on this PC: [강퇴] on others' rows of the viewed public office. */
  canKick: boolean;
}

/**
 * Right-edge list of people by area (public office, team, personal). The viewed
 * office's rows: click = camera follows the person's agent; hover = their name
 * tags light up (LanAgents.highlightPeer). Other areas: face + name only.
 */
export function PeoplePanel({
  rows: snapshotRows,
  sections,
  lan,
  officeState,
  forceOpen,
  relay,
  canKick,
}: PeoplePanelProps) {
  useLang();
  const live = viewedRows(sections, snapshotRows);
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

  // Same-network numbers: public area only (the viewed one = live rows + its extras).
  const pub = sections.find((s) => s.area === 'public');
  const pubPeople = pub
    ? pub.viewed
      ? [...live.map((r) => r.person), ...viewedExtras(pub, live)]
      : pub.people
    : [];
  const nets = netNumbers(pubPeople, pubPeople.find((p) => p.self)?.net);
  const publicViewed = pub?.viewed === true;
  const netOf = (p: DirectoryPersonMessage) => (p.net === undefined ? undefined : nets.get(p.net));
  const myVer = [...live.map((r) => r.person), ...sections.flatMap((s) => s.people)].find(
    (p) => p.self,
  )?.ver;

  const liveRows = rows.map((r) => (
    <li
      key={r.person.peerId}
      title={verTitle(r.person)}
      className="relative group flex items-center gap-4 pr-8 hover:bg-btn-hover"
    >
      <button
        type="button"
        onClick={() => focus(r)}
        onMouseEnter={() => (lan.highlightPeer = r.person.peerId)}
        onMouseLeave={() => (lan.highlightPeer = null)}
        onFocus={() => (lan.highlightPeer = r.person.peerId)}
        onBlur={() => (lan.highlightPeer = null)}
        className="flex-1 min-w-0 flex items-center gap-8 py-3 pl-8 bg-transparent border-0 text-left text-text cursor-pointer"
      >
        <Face person={r.person} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="truncate">
            {r.person.account}
            {r.person.nickname && <span className="text-text-muted"> ({r.person.nickname})</span>}
            {r.person.self && ` ${t('people.you')}`}
            <VerMark person={r.person} mine={myVer} />
          </span>
          <span
            className={`text-xs truncate ${hint === r.person.peerId ? 'text-warning' : 'text-text-muted'}`}
          >
            {hint === r.person.peerId ? t(focusHintKey(r)) : counts(r)}
          </span>
        </span>
        <StatusMark status={r.status} />
      </button>
      {publicViewed && <ViaBadge via={r.person.via} />}
      {publicViewed && <NetBadge n={netOf(r.person)} />}
      {publicViewed && canKick && !r.person.self && <KickButton person={r.person} />}
    </li>
  ));

  /** One area: its people (the viewed one = live rows + directory people missing from them). */
  const area = (s: AreaSection, heading: Key) => {
    const extras = s.viewed ? viewedExtras(s, live) : s.people;
    const n = (s.viewed ? live.length : 0) + extras.length;
    return (
      <li key={s.view}>
        <div className={`${AREA_HEADING} flex items-center gap-6`}>
          <span className="shrink-0">
            {t(heading, { n: String(n), name: s.name || t('office.unnamed') })}
          </span>
          {s.area === 'public' && s.viewed && <RelayChip relay={relay} />}
        </div>
        <ul className="m-0 p-0 list-none">
          {s.viewed && liveRows}
          {extras.map((p) => (
            <PlainRow
              key={p.peerId}
              person={p}
              net={s.area === 'public' ? netOf(p) : undefined}
              kick={s.area === 'public' && s.viewed && canKick && !p.self}
              mine={myVer}
            />
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
