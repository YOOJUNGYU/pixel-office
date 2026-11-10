import type { ReactNode } from 'react';

import { t, useLang } from '../i18n.js';
import { Button } from './ui/Button.js';

const BTN_CLASS = 'border-border! shadow-pixel';

interface MenuButtonsProps {
  isEditMode: boolean;
  /** null hides the layout button (read-only viewers, mobile). */
  onToggleEditMode: (() => void) | null;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
}

/** Layout and Settings as icon buttons: the first two of the top-left row (ZoomControls). */
export function MenuButtons({
  isEditMode,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
}: MenuButtonsProps) {
  useLang();
  return (
    <>
      {onToggleEditMode && (
        <Button
          size="icon_lg"
          variant={isEditMode ? 'active' : 'default'}
          onClick={onToggleEditMode}
          data-tour="layout-button"
          className={BTN_CLASS}
          title={t('toolbar.layoutTitle')}
          aria-label={t('toolbar.layoutTitle')}
          aria-pressed={isEditMode}
        >
          {/* Floor plan: a room split in three */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <rect x="2" y="2" width="14" height="14" stroke="currentColor" strokeWidth="2" />
            <path d="M9 2v7M2 9h7M9 13v3" stroke="currentColor" strokeWidth="2" />
          </svg>
        </Button>
      )}
      <Button
        size="icon_lg"
        variant={isSettingsOpen ? 'active' : 'default'}
        onClick={onToggleSettings}
        data-tour="settings-button"
        className={BTN_CLASS}
        title={t('toolbar.settings')}
        aria-label={t('toolbar.settings')}
        aria-pressed={isSettingsOpen}
      >
        {/* Gear */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1="9"
              y1="1.5"
              x2="9"
              y2="4"
              stroke="currentColor"
              strokeWidth="2.5"
              transform={`rotate(${a} 9 9)`}
            />
          ))}
          <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </Button>
    </>
  );
}

/** Bottom-left while editing: the editor's Reset / Undo / Redo / Save / Cancel. */
export function BottomToolbar({ children }: { children?: ReactNode }) {
  return (
    <div className="absolute left-10 bottom-10 z-20 flex items-stretch gap-4 max-w-[calc(100%-20px)]">
      {children}
    </div>
  );
}
