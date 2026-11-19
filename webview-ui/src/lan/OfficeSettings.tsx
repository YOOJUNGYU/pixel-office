import { useEffect, useRef, useState } from 'react';

import type { OfficeErrorReason, OfficesState, RoomSummary } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { MAX_OFFICE_NAME, MAX_ROOM_PASSWORD, OFFICE_COPIED_MS } from '../constants.js';
import type { OfficeReply } from '../hooks/useExtensionMessages.js';
import { t } from '../i18n.js';
import { transport } from '../transport/index.js';
import { switchConfirmName } from './offices.js';

const INPUT = 'flex-1 min-w-0 py-2 px-4 bg-bg border-2 border-border rounded-none text-text';

interface OfficeSettingsProps {
  state: Omit<OfficesState, 'type'>;
  /** Rooms heard on this LAN. */
  rooms: RoomSummary[];
  reply: OfficeReply | null;
  /** Consumes `reply`: a remount (Settings reopened) must not apply it again. */
  onReplyHandled: () => void;
}

/** Settings → 오피스: create a room, join one from the LAN's list, leave. This PC's browser only. */
export function OfficeSettings({ state, rooms, reply, onReplyHandled }: OfficeSettingsProps) {
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
  /** In a room already: the new one replaces it, so ask first. */
  const confirmSwitch = (): boolean => {
    const cur = switchConfirmName(state);
    return (
      cur === null ||
      window.confirm(t('office.switchConfirm', { name: cur || t('office.unnamed') }))
    );
  };
  const create = () => {
    if (!nameOk || !confirmSwitch()) return;
    setError(null);
    transport.send({ type: 'createOffice', name: trimmedName, password: password.trim() });
    setName('');
    setPassword('');
  };
  const join = (tag: string, pw: string) => {
    if (!confirmSwitch()) return;
    setError(null);
    setJoining(tag);
    transport.send({ type: 'joinOffice', tag, ...(pw && { password: pw }) });
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

  return (
    <div className="flex flex-col gap-6 py-4 px-10 text-sm border-t-2 border-border mt-4">
      <div data-tour="settings-offices" className="flex flex-col gap-6">
        <div className="text-accent-bright">{t('settings.offices')}</div>

        <label htmlFor="room-title">{t('office.create')}</label>
        <input
          id="room-title"
          type="text"
          value={name}
          maxLength={MAX_OFFICE_NAME}
          placeholder={t('office.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
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

        <div>{t('office.rooms')}</div>
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

        <div>{t('office.list')}</div>
        {!current && <div className="text-text-muted">{t('office.none')}</div>}
        {current && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <span className="flex-1 min-w-0 truncate">
                🔒 {current.name || t('office.unnamed')}
                {current.host && <span className="text-accent-bright"> · {t('office.host')}</span>}
              </span>
              <Button
                size="sm"
                onClick={() => {
                  const label = current.name || t('office.unnamed');
                  if (window.confirm(t('office.leaveConfirm', { name: label }))) {
                    transport.send({ type: 'leaveOffice', tag: current.tag });
                  }
                }}
              >
                {t('office.leave')}
              </Button>
            </div>
            {current.host && (
              <div className="flex items-center gap-4 text-xs text-text-muted">
                {current.password ? (
                  <>
                    <span className="flex-1 min-w-0 truncate">
                      {t('office.myCode')} <code className="select-all">{current.password}</code>
                    </span>
                    <Button size="sm" onClick={() => copy(current.password ?? '')}>
                      {copied ? t('office.copied') : t('office.copy')}
                    </Button>
                  </>
                ) : (
                  <span>{t('office.openRoom')}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
