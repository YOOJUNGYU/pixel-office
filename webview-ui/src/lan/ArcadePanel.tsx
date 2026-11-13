// The lounge arcade: sitting on the chair in front of a cabinet starts that cabinet's
// game at once, beside the relay's hall of fame for it (everyone's best, kept by the
// relay, which replays each run to compute its score). Standing up (arrow keys
// after Esc, which hides it) closes it; Esc / × hides it until the next time I sit down.
import { useEffect, useState } from 'react';

import { type GameId, peerLabel } from '../../../core/src/lan.js';
import type { ArcadeBoard, ArcadeResult, OfficePersonMessage } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import {
  ARCADE_HOWTO_WIDTH_PX,
  ARCADE_LEADERBOARD_WIDTH_PX,
  ARCADE_NOTICE_BOTTOM_PX,
  ARCADE_NOTICE_MS,
  ARCADE_RANK_ROWS,
  ARCADE_Z_INDEX,
  GAME_MUTE_KEY,
} from '../constants.js';
import { t } from '../i18n.js';
import { onFrame } from '../office/engine/gameLoop.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { transport } from '../transport/index.js';
import { arcadeEvents, type Boards, rankings, requestTicket } from './arcade.js';
import { GameCanvas } from './games/GameCanvas.js';

interface ArcadePanelProps {
  officeState: OfficeState;
  /** My avatar is controllable (not editing, touring, read-only). */
  enabled: boolean;
  people: OfficePersonMessage[];
}

/** null = not asked yet; 'off' = the relay could not be reached. */
type BoardState = Boards | 'off' | null;

function readMuted(): boolean {
  try {
    return localStorage.getItem(GAME_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

const KBD_STYLE = {
  border: '2px solid var(--color-border)',
  padding: '0 4px',
  whiteSpace: 'nowrap',
  minWidth: 64,
  textAlign: 'center',
} as const;

/** How to play: goal, keys (`key|what` per line), scoring (one rule per line). */
function HowTo({ game }: { game: GameId }) {
  const keys = [t(`game.${game}.keys`), t('game.common.keys')]
    .join('\n')
    .split('\n')
    .map((l) => l.split('|'));
  return (
    <div
      className="flex flex-col gap-6 text-sm"
      style={{ width: ARCADE_HOWTO_WIDTH_PX }}
      data-arcade-howto
    >
      <span className="text-text-muted">{t('game.howto')}</span>
      <p>{t(`game.${game}.goal`)}</p>
      <span className="text-text-muted">{t('game.controls')}</span>
      <ul className="flex flex-col gap-3">
        {keys.map(([k, what]) => (
          <li key={k} className="flex gap-6 items-center">
            <kbd style={KBD_STYLE}>{k}</kbd>
            <span>{what}</span>
          </li>
        ))}
      </ul>
      <span className="text-text-muted">{t('game.scoring')}</span>
      <ul className="flex flex-col gap-3">
        {t(`game.${game}.rules`)
          .split('\n')
          .map((r) => (
            <li key={r}>· {r}</li>
          ))}
      </ul>
    </div>
  );
}

export function ArcadePanel({ officeState, enabled, people }: ArcadePanelProps) {
  const send = transport.send.bind(transport);
  const [seatGame, setSeatGame] = useState<GameId | null>(null);
  /** My avatar was turned away from a taken cabinet (peer id + when). */
  const [busy, setBusy] = useState<{ peerId: string; at: number } | null>(null);
  useEffect(
    () =>
      onFrame(() => {
        setSeatGame(officeState.myArcadeGame());
        setBusy(officeState.arcadeBusy);
      }),
    [officeState],
  );
  /** The notice under the office: who plays the cabinet I wanted (busy) or who beat me to it (taken). */
  const [notice, setNotice] = useState<string | null>(null);
  const nameOf = (id: string) => {
    const p = people.find((x) => x.peerId === id);
    return p ? peerLabel(p) : id.slice(0, 8);
  };
  useEffect(() => {
    if (busy) setNotice(t('arcade.busy', { name: nameOf(busy.peerId) }));
  }, [busy?.at]); // eslint-disable-line react-hooks/exhaustive-deps -- a new turn-away only
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), ARCADE_NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  const [hidden, setHidden] = useState(false);
  const [boards, setBoards] = useState<BoardState>(null);
  const [result, setResult] = useState<ArcadeResult | null>(null);
  const [muted, setMuted] = useState(readMuted);
  const toggleMute = () =>
    setMuted((m) => {
      try {
        localStorage.setItem(GAME_MUTE_KEY, m ? '0' : '1');
      } catch {
        // private window: per session only
      }
      return !m;
    });
  const game = enabled && !hidden ? seatGame : null;

  useEffect(() => {
    if (seatGame) return;
    setHidden(false);
    setResult(null);
  }, [seatGame]);
  useEffect(() => {
    const onBoard = (e: Event) =>
      setBoards(((e as MessageEvent).data as ArcadeBoard).boards ?? 'off');
    const onResult = (e: Event) => setResult((e as MessageEvent).data as ArcadeResult);
    arcadeEvents.addEventListener('arcadeBoard', onBoard);
    arcadeEvents.addEventListener('arcadeResult', onResult);
    return () => {
      arcadeEvents.removeEventListener('arcadeBoard', onBoard);
      arcadeEvents.removeEventListener('arcadeResult', onResult);
    };
  }, []);
  useEffect(() => {
    if (game) send({ type: 'openArcade' });
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps -- send is a fresh bind
  // Two people who sat down at once (each PC saw a free chair): the smaller peer id keeps
  // the cabinet; the other's game is closed until the chair is free again.
  const me = people.find((p) => p.self);
  const rival =
    game && me?.avatar
      ? people.find(
          (p) =>
            !p.self &&
            p.avatar?.col === me.avatar?.col &&
            p.avatar?.row === me.avatar?.row &&
            p.peerId < me.peerId,
        )
      : undefined;
  useEffect(() => {
    if (!rival) return;
    setHidden(true);
    setNotice(t('arcade.taken', { name: peerLabel(rival) }));
  }, [rival?.peerId]); // eslint-disable-line react-hooks/exhaustive-deps -- per rival

  const noticeBox = notice && (
    <div
      className="pixel-panel fixed left-1/2 -translate-x-1/2 px-10 py-6 text-sm"
      style={{ zIndex: ARCADE_Z_INDEX, bottom: ARCADE_NOTICE_BOTTOM_PX }}
      data-arcade-notice
    >
      🕹️ {notice}
    </div>
  );
  if (!game) return noticeBox || null;

  const selfId = people.find((p) => p.self)?.peerId ?? null;
  const online = new Set(people.map((p) => p.peerId));
  const rows = boards && boards !== 'off' ? rankings(boards[game], selfId, online) : [];
  const top = rows.slice(0, ARCADE_RANK_ROWS);
  const mine = rows.find((r) => r.self);
  if (mine && !top.includes(mine)) top.push(mine);

  return (
    <div
      className="pixel-panel fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-8 p-10"
      style={{
        zIndex: ARCADE_Z_INDEX,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'calc(100vh - 16px)',
        overflow: 'auto',
      }}
      data-arcade-panel={game}
    >
      <div className="flex items-center gap-8">
        <span className="text-lg">🕹️ {t(`game.${game}.name`)}</span>
        <span className="flex-1 text-sm text-text-muted text-right">{t('arcade.leave')}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleMute}
          aria-label={t(muted ? 'game.soundOn' : 'game.soundOff')}
          title={t(muted ? 'game.soundOn' : 'game.soundOff')}
        >
          {muted ? '🔇' : '🔊'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setHidden(true)}
          aria-label={t('arcade.close')}
        >
          ×
        </Button>
      </div>
      <div className="flex gap-10 items-start">
        <HowTo game={game} />
        <GameCanvas
          key={game}
          game={game}
          best={mine?.score ?? 0}
          muted={muted}
          onToggleMute={toggleMute}
          requestTicket={() => {
            setResult(null);
            return requestTicket(game, send);
          }}
          onGameOver={(run) => {
            if (run.ticket)
              send({ type: 'submitScore', game, ticket: run.ticket, inputs: run.inputs });
            else setResult({ type: 'arcadeResult', game, ok: false, reason: 'network' });
          }}
          onQuit={() => setHidden(true)}
        />
        <div className="flex flex-col gap-4" style={{ width: ARCADE_LEADERBOARD_WIDTH_PX }}>
          <span className="text-sm text-text-muted">{t('arcade.ranking')}</span>
          {result && (
            <span className={`text-sm ${result.ok ? '' : 'text-text-muted'}`} data-arcade-result>
              {result.ok
                ? t(result.rank ? 'arcade.saved.rank' : 'arcade.saved', {
                    score: (result.score ?? 0).toLocaleString(),
                    best: (result.best ?? 0).toLocaleString(),
                    rank: String(result.rank ?? ''),
                  })
                : t(result.reason === 'network' ? 'arcade.unranked' : 'arcade.refused')}
            </span>
          )}
          {boards === 'off' ? (
            <span className="text-sm text-text-muted">{t('arcade.off')}</span>
          ) : top.length === 0 ? (
            <span className="text-sm text-text-muted">
              {t(boards ? 'arcade.empty' : 'arcade.loading')}
            </span>
          ) : (
            <ol className="flex flex-col gap-2" data-arcade-board>
              {top.map((r) => (
                <li
                  key={r.id}
                  className={`flex gap-6 px-4 ${r.self ? 'bg-active-bg' : ''}`}
                  title={r.online ? t('arcade.online') : undefined}
                >
                  <span className="w-24 text-right text-text-muted">{r.rank}</span>
                  <span className="flex-1 truncate" title={r.name}>
                    {r.online ? '● ' : ''}
                    {r.name}
                  </span>
                  <span>{r.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
