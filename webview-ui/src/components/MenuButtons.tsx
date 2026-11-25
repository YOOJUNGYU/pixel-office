import { t, useLang } from '../i18n.js';
import { Button } from './ui/Button.js';

const BTN_CLASS = 'border-border! shadow-pixel';

interface MenuButtonsProps {
  isEditMode: boolean;
  /** null hides the layout button (read-only viewers, mobile). */
  onToggleEditMode: (() => void) | null;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  /** null hides the usage button (read-only viewers, mobile). */
  onToggleUsage: (() => void) | null;
  isUsageOpen: boolean;
  /** Other PCs' agents' speech bubbles shown (default) or hidden; null hides the button. */
  othersBubbles: boolean;
  onToggleOthersBubbles: (() => void) | null;
  /** null hides the 🚪 rooms button (read-only viewers, mobile, no offices yet). */
  onToggleRooms: (() => void) | null;
  isRoomsOpen: boolean;
  /** The ? manual panel (every feature, searchable, + the tour). */
  isManualOpen: boolean;
  onToggleManual: () => void;
}

/** Layout, Settings, usage, rooms, others' bubbles and the ? manual as icon buttons: the start of the
 *  top-left row (ZoomControls). */
export function MenuButtons({
  isEditMode,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
  onToggleUsage,
  isUsageOpen,
  onToggleRooms,
  isRoomsOpen,
  othersBubbles,
  onToggleOthersBubbles,
  isManualOpen,
  onToggleManual,
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
          data-tip={t('toolbar.layoutTitle')}
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
        data-tip={t('toolbar.settings')}
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
      {onToggleUsage && (
        <Button
          size="icon_lg"
          variant={isUsageOpen ? 'active' : 'default'}
          onClick={onToggleUsage}
          aria-pressed={isUsageOpen}
          data-tour="usage-button"
          className={BTN_CLASS}
          data-tip={t('usage.window')}
          aria-label={t('usage.window')}
        >
          {/* Bar chart */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="currentColor"
            aria-hidden
            shapeRendering="crispEdges"
          >
            <rect x="2" y="9" width="3" height="6" />
            <rect x="7.5" y="4" width="3" height="11" />
            <rect x="13" y="7" width="3" height="8" />
            <rect x="1" y="15" width="16" height="2" />
          </svg>
        </Button>
      )}
      {onToggleRooms && (
        <Button
          size="icon_lg"
          variant={isRoomsOpen ? 'active' : 'default'}
          onClick={onToggleRooms}
          aria-pressed={isRoomsOpen}
          data-tour="rooms-button"
          className={BTN_CLASS}
          data-tip={t('rooms.window')}
          aria-label={t('rooms.window')}
        >
          {/* Pixel door, ajar */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="currentColor"
            aria-hidden
            shapeRendering="crispEdges"
          >
            <rect x="3" y="1" width="12" height="2" />
            <rect x="3" y="1" width="2" height="16" />
            <rect x="13" y="1" width="2" height="16" />
            <rect x="1" y="15" width="16" height="2" />
            <rect x="9" y="8" width="2" height="2" />
          </svg>
        </Button>
      )}
      {onToggleOthersBubbles && (
        <Button
          size="icon_lg"
          variant={othersBubbles ? 'default' : 'active'}
          onClick={onToggleOthersBubbles}
          aria-pressed={!othersBubbles}
          data-others-bubbles={othersBubbles}
          className={BTN_CLASS}
          data-tip={t(othersBubbles ? 'toolbar.othersBubbles.hide' : 'toolbar.othersBubbles.show')}
          aria-label={t(
            othersBubbles ? 'toolbar.othersBubbles.hide' : 'toolbar.othersBubbles.show',
          )}
        >
          {/* Speech bubble; struck through while others' are hidden */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M2 3h14v9H8l-4 3v-3H2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {!othersBubbles && (
              <line x1="2" y1="16" x2="16" y2="1" stroke="currentColor" strokeWidth="2" />
            )}
          </svg>
        </Button>
      )}
      <Button
        size="icon_lg"
        variant={isManualOpen ? 'active' : 'default'}
        onClick={onToggleManual}
        aria-pressed={isManualOpen}
        data-tour="manual-button"
        className={BTN_CLASS}
        data-tip={t('toolbar.manual')}
        aria-label={t('toolbar.manual')}
      >
        {/* Pixel question mark */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="currentColor"
          aria-hidden
          shapeRendering="crispEdges"
        >
          <rect x="5" y="2" width="8" height="2" />
          <rect x="3" y="4" width="3" height="3" />
          <rect x="12" y="4" width="3" height="4" />
          <rect x="10" y="8" width="3" height="2" />
          <rect x="8" y="10" width="3" height="2" />
          <rect x="8" y="14" width="3" height="3" />
        </svg>
      </Button>
    </>
  );
}
