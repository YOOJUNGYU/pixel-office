import { useRef, useState } from 'react';

import type { Lang } from '../../../core/src/lan.js';
import type { AutostartState, OfficesState, RoomSummary } from '../../../core/src/messages.js';
import { ADMIN_REVEAL_CLICKS, ADMIN_REVEAL_GAP_MS, RELAY_ADMIN_TOKEN_MAX } from '../constants.js';
import type { NotifySettings, OfficeReply } from '../hooks/useExtensionMessages.js';
import { LANG_NAMES, setLang, t, useLang } from '../i18n.js';
import { OfficeSettings } from '../lan/OfficeSettings.js';
import type { ThemePref } from '../theme.js';
import { setThemePref, THEME_PREFS, useThemePref } from '../theme.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { MenuItem } from './ui/MenuItem.js';
import { Modal } from './ui/Modal.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Read-only viewers only get the (per-browser) language choice. */
  readOnly: boolean;
  /** Opens the profile modal; null when this browser cannot edit the profile. */
  onOpenProfile: (() => void) | null;
  /** Start at login on this PC; hidden when null or unsupported (dev run, Linux). */
  autostart: AutostartState | null;
  /** OS notifications (kept by the server); hidden until settingsLoaded. */
  notify: NotifySettings | null;
  onNotifyChange: (v: NotifySettings) => void;
  /** An admin token for the internet public office is stored (never sent back to the page). */
  relayAdmin: boolean;
  /** Team offices (this PC's browser only); the 오피스 section is hidden when null. */
  offices: Omit<OfficesState, 'type'> | null;
  /** Rooms heard on this LAN (room list). */
  rooms: RoomSummary[];
  officeReply: OfficeReply | null;
  onOfficeReplyHandled: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  readOnly,
  onOpenProfile,
  autostart,
  notify,
  onNotifyChange,
  relayAdmin,
  offices,
  rooms,
  officeReply,
  onOfficeReplyHandled,
}: SettingsModalProps) {
  const lang = useLang();
  const themePref = useThemePref();
  const [token, setToken] = useState('');
  // Hidden: the admin token field shows only after ADMIN_REVEAL_CLICKS Ctrl+clicks on the
  // title, each within ADMIN_REVEAL_GAP_MS of the last; closing the modal hides it again.
  const [revealed, setRevealed] = useState(false);
  const clicks = useRef({ n: 0, at: 0 });
  if (!isOpen && revealed) setRevealed(false);
  const title = (
    <span
      className="select-none"
      onClick={(e) => {
        const c = clicks.current;
        const now = performance.now();
        c.n = e.ctrlKey && now - c.at < ADMIN_REVEAL_GAP_MS ? c.n + 1 : e.ctrlKey ? 1 : 0;
        c.at = now;
        if (c.n >= ADMIN_REVEAL_CLICKS) {
          c.n = 0;
          setRevealed(true);
        }
      }}
    >
      {t('toolbar.settings')}
    </span>
  );

  const languageSelect = (
    <label
      data-tour="settings-language"
      className="flex items-center justify-between gap-8 py-4 px-10 text-base"
    >
      {t('settings.language')}
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text"
      >
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );

  const themeSelect = (
    <label
      data-tour="settings-theme"
      className="flex items-center justify-between gap-8 py-4 px-10 text-base"
    >
      {t('settings.theme')}
      <select
        value={themePref}
        onChange={(e) => setThemePref(e.target.value as ThemePref)}
        className="py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text"
      >
        {THEME_PREFS.map((p) => (
          <option key={p} value={p}>
            {t(`theme.${p}`)}
          </option>
        ))}
      </select>
    </label>
  );

  if (readOnly) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={t('toolbar.settings')}>
        {languageSelect}
        {themeSelect}
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {languageSelect}
      {themeSelect}
      {onOpenProfile && (
        <MenuItem
          onClick={() => {
            onOpenProfile();
            onClose();
          }}
        >
          {t('settings.profile')}
        </MenuItem>
      )}
      {autostart?.supported && (
        // Not optimistic: the server answers with the real state (autostartState).
        <div data-tour="settings-autostart">
          <Checkbox
            label={t('settings.autostart')}
            checked={autostart.enabled}
            onChange={() => transport.send({ type: 'setAutostart', enabled: !autostart.enabled })}
          />
        </div>
      )}
      {notify && (
        <div data-tour="settings-notify">
          {(
            [
              ['presence', 'settings.notifyPresence'],
              ['agents', 'settings.notifyAgents'],
            ] as const
          ).map(([k, label]) => (
            <Checkbox
              key={k}
              label={t(label)}
              checked={notify[k]}
              onChange={() => {
                const next = { ...notify, [k]: !notify[k] };
                onNotifyChange(next);
                transport.send({ type: 'setNotifications', [k]: next[k] });
              }}
            />
          ))}
        </div>
      )}
      <div data-tour="settings-update">
        <MenuItem
          onClick={() => {
            transport.send({ type: 'checkUpdate' });
            onClose();
          }}
        >
          {t('settings.checkUpdate')}
        </MenuItem>
      </div>
      {/* Write-only: the stored token never comes back, only whether one is set. '' clears it. */}
      {revealed && (
        <div className="flex flex-col gap-4 py-4 px-10 text-sm">
          <label htmlFor="relay-admin-token" className="flex items-center justify-between gap-8">
            {t('settings.relayAdmin')}
            <span className={relayAdmin ? 'text-status-success' : 'text-text-muted'}>
              {t(relayAdmin ? 'settings.relayAdminSet' : 'settings.relayAdminUnset')}
            </span>
          </label>
          <div className="flex gap-4">
            <input
              id="relay-admin-token"
              type="password"
              autoComplete="off"
              value={token}
              maxLength={RELAY_ADMIN_TOKEN_MAX}
              placeholder={t('settings.relayAdminHint')}
              onChange={(e) => setToken(e.target.value)}
              className="flex-1 min-w-0 py-2 px-4 bg-bg border-2 border-border rounded-none text-text"
            />
            <Button
              size="sm"
              variant="accent"
              onClick={() => {
                transport.send({ type: 'setRelayAdminToken', token: token.trim() });
                setToken('');
              }}
            >
              {t('settings.relayAdminSave')}
            </Button>
          </div>
        </div>
      )}
      {offices && (
        <OfficeSettings
          state={offices}
          rooms={rooms}
          reply={officeReply}
          onReplyHandled={onOfficeReplyHandled}
        />
      )}
      {/* The server closes this page's socket with WS_CLOSE_APP_QUIT → the "종료됨" notice. */}
      <MenuItem
        onClick={() => {
          if (!window.confirm(t('settings.quitConfirm'))) return;
          transport.send({ type: 'quitApp' });
          onClose();
        }}
      >
        {t('settings.quitApp')}
      </MenuItem>
    </Modal>
  );
}
