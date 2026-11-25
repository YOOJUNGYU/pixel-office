// The 🚪 rooms panel under the top-left buttons: my room (host controls, members), the LAN's
// room list, create a room. Sized like the 📊 usage panel. This PC's browser only.
import { useEffect, useRef, useState } from 'react';

import type {
  OfficeErrorReason,
  OfficePersonMessage,
  OfficesState,
  OfficeSummary,
  RoomSummary,
} from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import {
  MAX_OFFICE_NAME,
  MAX_ROOM_PASSWORD,
  OFFICE_COPIED_MS,
  ROOM_MAX_PEOPLE,
  ROOM_MIN_PEOPLE,
  ROOMS_PANEL_DEFAULT_H_PX,
  ROOMS_PANEL_DEFAULT_W_PX,
  ROOMS_PANEL_SIZE_KEY,
} from '../constants.js';
import type { OfficeReply } from '../hooks/useExtensionMessages.js';
import { t, useLang } from '../i18n.js';
import { transport } from '../transport/index.js';
import { switchConfirmName } from './offices.js';
import { PanelGrips } from './PanelGrips.js';
import { confirmHandover, members } from './roomsModel.js';
import { useResizable } from './usagePanelSize.js';

const INPUT = 'flex-1 min-w-0 py-2 px-4 bg-bg border-2 border-border rounded-none text-text';
/** A field standing alone in the column (INPUT's flex-1 would stretch it tall). */
const INPUT_ROW = 'min-w-0 py-2 px-4 bg-bg border-2 border-border rounded-none text-text';
const HEADING = 'text-accent-bright';
const DEFAULT_SIZE = { w: ROOMS_PANEL_DEFAULT_W_PX, h: ROOMS_PANEL_DEFAULT_H_PX };
const MAX_CHOICES = Array.from(
  { length: ROOM_MAX_PEOPLE - ROOM_MIN_PEOPLE + 1 },
  (_, i) => ROOM_MIN_PEOPLE + i,
);

type Offices = Omit<OfficesState, 'type'>;

interface RoomsPanelProps {
  state: Offices;
  /** Rooms heard on this LAN. */
  rooms: RoomSummary[];
  /** The viewed office's live people (the members while my room is on screen). */
  people: OfficePersonMessage[];
  reply: OfficeReply | null;
  /** Consumes `reply`: a remount (panel reopened) must not apply it again. */
  onReplyHandled: () => void;
  onClose: () => void;
}

export function RoomsPanel({
  state,
  rooms,
  people,
  reply,
  onReplyHandled,
  onClose,
}: RoomsPanelProps) {
  useLang();
  const box = useResizable(ROOMS_PANEL_SIZE_KEY, DEFAULT_SIZE);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  /** A locked room picked from the list: its code field is open. */
  const [picked, setPicked] = useState<string | null>(null);
  const [code, setCode] = useState('');
  /** The room being joined (waiting for its host). */
  const [joining, setJoining] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<OfficeErrorReason | null>(null);
  const [leftPublic, setLeftPublic] = useState(false);
  const prevCount = useRef(state.offices.length);
  const current = state.offices[0];

  useEffect(() => {
    if (!reply) return;
    setError(reply.reason);
    setJoining(null);
    onReplyHandled();
  }, [reply, onReplyHandled]);

  // Joined/created the first room: say that this PC left the public office.
  useEffect(() => {
    const n = state.offices.length;
    if (prevCount.current === 0 && n > 0) setLeftPublic(true);
    if (n === 0) setLeftPublic(false);
    prevCount.current = n;
  }, [state.offices.length]);

  // In the room now: the join is over.
  useEffect(() => {
    if (current?.tag !== joining) return;
    setJoining(null);
    setPicked(null);
    setCode('');
  }, [current?.tag, joining]);

  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= 1 && trimmedName.length <= MAX_OFFICE_NAME;
  /** In a room already: the new one replaces it, so ask first (and hand it over if I host it). */
  const confirmSwitch = (): { handover?: true } | null => {
    const cur = switchConfirmName(state);
    if (
      cur !== null &&
      !window.confirm(t('office.switchConfirm', { name: cur || t('office.unnamed') }))
    )
      return null;
    return confirmHandover(state);
  };
  const create = () => {
    if (!nameOk) return;
    const ok = confirmSwitch();
    if (!ok) return;
    setError(null);
    transport.send({ type: 'createOffice', name: trimmedName, password: password.trim(), ...ok });
    setName('');
    setPassword('');
  };
  const join = (tag: string, pw: string) => {
    const ok = confirmSwitch();
    if (!ok) return;
    setError(null);
    setJoining(tag);
    transport.send({ type: 'joinOffice', tag, ...(pw && { password: pw }), ...ok });
  };
  const leave = (o: OfficeSummary) => {
    if (!window.confirm(t('office.leaveConfirm', { name: o.name || t('office.unnamed') }))) return;
    const ok = confirmHandover(state);
    if (ok) transport.send({ type: 'leaveOffice', tag: o.tag, ...ok });
  };
  const copy = (text: string) => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), OFFICE_COPIED_MS);
      })
      .catch(() => {});
  };
  /** The members list = the snapshot's people, so only while my room is on screen. */
  const onScreen = current !== undefined && current.tag === state.activeView;
  /** Mine: I know its code; else as its advert says (not listed = unknown, no lock shown). */
  const locked = current?.host
    ? !!current.password
    : rooms.some((r) => r.tag === current?.tag && r.locked);

  return (
    <div
      ref={box.ref}
      data-rooms-panel
      data-tour="rooms-panel"
      className="relative flex flex-col pixel-panel text-text"
      style={{ width: box.size.w, height: box.size.h }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-8 shrink-0 pl-12 border-b-2 border-border bg-bg-dark">
        <h2 className="m-0 py-6 text-base font-bold">{t('rooms.window')}</h2>
        <button
          onClick={onClose}
          title={t('rooms.close')}
          aria-label={t('rooms.close')}
          className="ml-auto self-stretch w-32 shrink-0 bg-bg-dark border-0 border-l-2 border-border rounded-none text-text-muted hover:text-text cursor-pointer text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar flex flex-col gap-6 py-8 px-12 text-sm">
        {current && (
          <div data-my-room className="flex flex-col gap-4 pb-8 border-b-2 border-border">
            <div className={HEADING}>{t('office.list')}</div>
            <div className="flex items-center gap-4">
              <span className="flex-1 min-w-0 truncate">
                {locked ? '🔒 ' : ''}
                {current.name || t('office.unnamed')}
                {current.host && <span className="text-accent-bright"> · {t('office.host')}</span>}
              </span>
              <Button size="sm" onClick={() => leave(current)}>
                {t('office.leave')}
              </Button>
            </div>
            {current.host && current.password && (
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span className="flex-1 min-w-0 truncate">
                  {t('office.myCode')} <code className="select-all">{current.password}</code>
                </span>
                <Button size="sm" onClick={() => copy(current.password ?? '')}>
                  {copied ? t('office.copied') : t('office.copy')}
                </Button>
              </div>
            )}
            {current.host && !current.password && (
              <span className="text-xs text-text-muted">{t('office.openRoom')}</span>
            )}
            {current.host && current.hostId && (
              <HostControls
                key={`${current.tag}|${current.name}|${current.max ?? ''}|${current.password ?? ''}`}
                office={current}
              />
            )}
            {onScreen && (
              <>
                <div className="mt-4">{t('rooms.members')}</div>
                {members(people, current).map((m) => (
                  <div key={m.peerId} data-member={m.peerId} className="flex items-center gap-4">
                    <span className="flex-1 min-w-0 truncate">
                      {m.label}
                      {m.me && <span className="text-text-muted"> ({t('rooms.me')})</span>}
                      {m.host && <span className="text-accent-bright"> · {t('office.host')}</span>}
                    </span>
                    {current.host && current.hostId && !m.me && (
                      <Button
                        size="sm"
                        onClick={() => {
                          if (window.confirm(t('rooms.kickConfirm', { name: m.label }))) {
                            transport.send({ type: 'kickMember', peerId: m.peerId });
                          }
                        }}
                      >
                        {t('rooms.kick')}
                      </Button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        <div className={HEADING}>{t('office.rooms')}</div>
        {rooms.length === 0 && <div className="text-text-muted">{t('office.noRooms')}</div>}
        {rooms.map((r) => {
          const inside = current?.tag === r.tag;
          const full = r.count >= r.max;
          const waiting = joining === r.tag;
          return (
            <div key={r.tag} data-room={r.tag} className="flex flex-col gap-2">
              <div className="flex items-center gap-4">
                <span className="flex-1 min-w-0 truncate">
                  {r.locked ? '🔒' : '🚪'} {r.title}
                  <span className="text-text-muted">
                    {' · '}
                    {t('office.roomHost', { name: r.host })}
                  </span>
                </span>
                <span className={full ? 'text-danger' : 'text-text-muted'}>
                  {r.count}/{r.max}
                </span>
                <Button
                  size="sm"
                  variant={inside || full || waiting ? 'disabled' : 'default'}
                  onClick={() => {
                    if (inside || full || waiting) return;
                    if (r.locked) {
                      setPicked(picked === r.tag ? null : r.tag);
                      setCode('');
                    } else join(r.tag, '');
                  }}
                >
                  {inside
                    ? t('office.inRoom')
                    : waiting
                      ? t('office.joining')
                      : full
                        ? t('office.full')
                        : t('office.joinButton')}
                </Button>
              </div>
              {picked === r.tag && !inside && (
                <div className="flex gap-4">
                  <input
                    type="password"
                    value={code}
                    maxLength={MAX_ROOM_PASSWORD}
                    autoFocus
                    autoComplete="off"
                    aria-label={t('office.codePlaceholder')}
                    placeholder={t('office.codePlaceholder')}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && code.trim() && join(r.tag, code.trim())}
                    className={INPUT}
                  />
                  <Button
                    size="sm"
                    variant={code.trim() && !waiting ? 'accent' : 'disabled'}
                    onClick={() => code.trim() && !waiting && join(r.tag, code.trim())}
                  >
                    {t('office.enter')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <span role="alert" className="text-xs text-danger">
            {t(`office.error.${error}`)}
          </span>
        )}
        {leftPublic && <span className="text-xs text-accent-bright">{t('office.leftPublic')}</span>}

        <label htmlFor="room-title" className={`${HEADING} mt-4 pt-8 border-t-2 border-border`}>
          {t('office.create')}
        </label>
        <input
          id="room-title"
          type="text"
          value={name}
          maxLength={MAX_OFFICE_NAME}
          placeholder={t('office.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          className={INPUT_ROW}
        />
        <div className="flex gap-4">
          <input
            type="text"
            value={password}
            maxLength={MAX_ROOM_PASSWORD}
            autoComplete="off"
            spellCheck={false}
            aria-label={t('office.passwordPlaceholder')}
            placeholder={t('office.passwordPlaceholder')}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            className={INPUT}
          />
          <Button size="sm" variant={nameOk ? 'accent' : 'disabled'} onClick={create}>
            {t('office.createButton')}
          </Button>
        </div>
        <span className="text-xs text-text-muted">{t('office.createHint')}</span>
      </div>
      <PanelGrips box={box} />
    </div>
  );
}

/** Host only: title, max people, access code → setRoom. Remounted (key) when the room's
 *  settings change, so the fields start from what the server holds. */
function HostControls({ office }: { office: OfficeSummary }) {
  const [title, setTitle] = useState(office.name);
  const [max, setMax] = useState(office.max ?? ROOM_MAX_PEOPLE);
  const [code, setCode] = useState(office.password ?? '');
  const trimmed = title.trim();
  const ok = trimmed.length >= 1 && trimmed.length <= MAX_OFFICE_NAME;
  const save = () => {
    if (ok) transport.send({ type: 'setRoom', title: trimmed, max, password: code.trim() });
  };
  return (
    <div data-host-controls className="flex flex-col gap-4 mt-4">
      <div className="flex items-center gap-4">
        <span className="w-40 shrink-0">{t('rooms.title')}</span>
        <input
          type="text"
          value={title}
          maxLength={MAX_OFFICE_NAME}
          aria-label={t('rooms.title')}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className={INPUT}
        />
        <label className="flex items-center gap-4 shrink-0">
          {t('rooms.max')}
          <select
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            className="py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text"
          >
            {MAX_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          /{ROOM_MAX_PEOPLE}
        </label>
      </div>
      <div className="flex items-center gap-4">
        <span className="w-40 shrink-0">{t('rooms.code')}</span>
        <input
          type="text"
          value={code}
          maxLength={MAX_ROOM_PASSWORD}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('rooms.code')}
          placeholder={t('office.passwordPlaceholder')}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className={INPUT}
        />
        <Button size="sm" variant={ok ? 'accent' : 'disabled'} onClick={save}>
          {t('rooms.save')}
        </Button>
      </div>
    </div>
  );
}
