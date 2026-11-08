import { useEffect, useRef, useState } from 'react';
import { CAR_SKINS, type CarSkin } from '../game/config';
import type { RunStats } from '../game/game';
import type { ScoreEntry, Settings } from '../game/scores';
import { formatScore } from '../game/util';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/* ------------------------------------------------------------------ score table */
interface TableProps {
  scores: ScoreEntry[];
  limit?: number;
  highlightId?: string | null;
  onRename?: (id: string, name: string) => void;
}

export function ScoreTable({ scores, limit = 10, highlightId, onRename }: TableProps) {
  const rows = scores.slice(0, limit);
  if (!rows.length) {
    return <div className="score-empty">NO RECORDS YET — SET THE FIRST ONE!</div>;
  }
  return (
    <ol className="score-table">
      {rows.map((s, i) => {
        const me = s.id === highlightId;
        return (
          <li key={s.id} className={`${me ? 'me' : ''} ${i < 3 ? `top top-${i + 1}` : ''}`}>
            <span className="rank">{i + 1}</span>
            <span className="name">
              {me && onRename ? <NameInput initial={s.name} onCommit={(n) => onRename(s.id, n)} /> : s.name}
            </span>
            <span className="stg">S{s.stage}</span>
            <span className="pts">{formatScore(s.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function NameInput({ initial, onCommit }: { initial: string; onCommit: (n: string) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="name-edit" onPointerDown={stop}>
      <input
        ref={ref}
        value={v}
        maxLength={10}
        spellCheck={false}
        autoComplete="off"
        aria-label="Your name"
        onChange={(e) => setV(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') ref.current?.blur();
        }}
        onBlur={() => onCommit(v)}
      />
      <span className="pencil" aria-hidden>✎</span>
    </label>
  );
}

/* ------------------------------------------------------------------ toggles */
function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={onChange} onPointerDown={stop} aria-pressed={on}>
      <span className="toggle-dot" />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ title */
interface TitleProps {
  scores: ScoreEntry[];
  touch: boolean;
  settings: Settings;
  onStart: () => void;
  onToggleSfx: () => void;
  onToggleMusic: () => void;
  onShowCredits: () => void;
  onShowGarage: () => void;
}

export function TitleScreen({
  scores,
  touch,
  settings,
  onStart,
  onToggleSfx,
  onToggleMusic,
  onShowCredits,
  onShowGarage,
}: TitleProps) {
  return (
    <div className="overlay title-overlay">
      <div className="title-inner">
        <div className="logo" aria-label="Neon Overdrive">
          <div className="logo-neon">NEON</div>
          <div className="logo-chrome" data-text="OVERDRIVE">OVERDRIVE</div>
          <div className="logo-sub">◆ ENDLESS SYNTHWAVE RACER ◆</div>
        </div>

        <button className="btn-primary start-btn" onClick={onStart} autoFocus>
          <span>{touch ? 'TAP TO RACE' : 'START RACE'}</span>
          {!touch && <kbd>ENTER</kbd>}
        </button>

        <div className="title-panels">
          <section className="panel">
            <h3>HOW TO PLAY</h3>
            <ul className="howto">
              <li>
                <b className="c-cyan">BEAT THE CLOCK</b> — hit each <b>CHECKPOINT</b> for bonus time.
              </li>
              <li>
                <b className="c-yellow">COLLECT COINS & SHIELDS</b> — buy car skins & absorb crashes!
              </li>
              <li>
                Grab <b className="c-cyan">◆ ORBS</b> to charge <b className="c-pink">NITRO</b> — boosting smashes through cars!
              </li>
            </ul>
            {touch ? (
              <div className="controls">
                <div><kbd>HOLD LEFT / RIGHT</kbd> steer</div>
                <div><kbd>SWIPE ↑</kbd> or <kbd>NITRO</kbd> boost</div>
                <div><kbd>HOLD BOTH SIDES</kbd> brake</div>
              </div>
            ) : (
              <div className="controls">
                <div><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> steer</div>
                <div><kbd>SPACE</kbd> / <kbd>↑</kbd> nitro</div>
                <div><kbd>↓</kbd> / <kbd>S</kbd> brake</div>
                <div><kbd>P</kbd> / <kbd>ESC</kbd> pause · <kbd>M</kbd> mute</div>
              </div>
            )}
          </section>
          <section className="panel">
            <h3>HIGH SCORES</h3>
            <ScoreTable scores={scores} limit={5} />
          </section>
        </div>

        <div className="title-footer">
          <Toggle label="SFX" on={settings.sfx} onChange={onToggleSfx} />
          <Toggle label="MUSIC" on={settings.music} onChange={onToggleMusic} />
          <button className="toggle" onClick={onShowGarage} style={{ cursor: 'pointer', color: '#ffcf3a' }}>
            GARAGE 🪙
          </button>
          <button className="toggle" onClick={onShowCredits} style={{ cursor: 'pointer' }}>
            CREDITS
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pause */
interface PauseProps {
  settings: Settings;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onToggleSfx: () => void;
  onToggleMusic: () => void;
}

export function PauseMenu({ settings, onResume, onRestart, onQuit, onToggleSfx, onToggleMusic }: PauseProps) {
  return (
    <div className="overlay pause-overlay">
      <div className="menu-card">
        <h2 className="menu-title">PAUSED</h2>
        <div className="menu-buttons">
          <button className="btn-primary" onClick={onResume} autoFocus>
            <span>RESUME</span>
            <kbd>ESC</kbd>
          </button>
          <button className="btn-secondary" onClick={onRestart}>
            <span>RESTART</span>
            <kbd>R</kbd>
          </button>
          <button className="btn-ghost" onClick={onQuit}>
            <span>MAIN MENU</span>
            <kbd>Q</kbd>
          </button>
        </div>
        <div className="title-footer">
          <Toggle label="SFX" on={settings.sfx} onChange={onToggleSfx} />
          <Toggle label="MUSIC" on={settings.music} onChange={onToggleMusic} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ game over */
interface OverProps {
  stats: RunStats;
  scores: ScoreEntry[];
  entryId: string | null;
  rank: number;
  touch: boolean;
  onRestart: () => void;
  onMenu: () => void;
  onRename: (id: string, name: string) => void;
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const dur = Math.min(1400, 500 + value / 60);
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      if (ref.current) ref.current.textContent = formatScore(value * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span ref={ref}>0</span>;
}

export function GameOver({ stats, scores, entryId, rank, touch, onRestart, onMenu, onRename }: OverProps) {
  const items: [string, string][] = [
    ['STAGE', String(stats.stage)],
    ['DISTANCE', `${stats.distance.toFixed(2)} KM`],
    ['TOP SPEED', `${stats.topSpeed} KM/H`],
    ['NEAR MISSES', String(stats.nearMisses)],
    ['BEST COMBO', `x${stats.bestCombo}`],
    ['SMASHES', String(stats.smashes)],
    ['ORBS', String(stats.orbs)],
    ['CRASHES', String(stats.crashes)],
  ];
  return (
    <div className="overlay gameover-overlay">
      <div className="menu-card wide">
        <h2 className="gameover-title" data-text="TIME UP">TIME UP</h2>
        {rank === 1 ? (
          <div className="badge gold">★ NEW HIGH SCORE ★</div>
        ) : rank > 0 ? (
          <div className="badge">RANK #{rank} ON THE BOARD</div>
        ) : (
          <div className="badge dim">KEEP PUSHING — TOP 10 AWAITS</div>
        )}
        <div className="final-score">
          <CountUp value={stats.score} />
        </div>
        <div className="stats-grid">
          {items.map(([k, v]) => (
            <div key={k} className="stat">
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="board">
          <h3>
            HIGH SCORES {rank > 0 && <small>— tap your name to edit</small>}
          </h3>
          <ScoreTable scores={scores} highlightId={entryId} onRename={onRename} />
        </div>
        <div className="menu-buttons row">
          <button className="btn-primary" onClick={onRestart} autoFocus>
            <span>RACE AGAIN</span>
            {!touch && <kbd>ENTER</kbd>}
          </button>
          <button className="btn-ghost" onClick={onMenu}>
            <span>MENU</span>
            {!touch && <kbd>ESC</kbd>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ credits modal */
export function CreditsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay pause-overlay" onClick={onClose}>
      <div className="menu-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="menu-title">CREDITS</h2>
        <div className="howto" style={{ textAlign: 'center', margin: '20px 0' }}>
          <p style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--cyan)' }}>GAME DEVELOPER</p>
          <p style={{ fontSize: '24px', fontWeight: 900, color: '#fff', letterSpacing: '0.1em' }}>Made By TDRW WILSON</p>
        </div>
        <button className="btn-primary" onClick={onClose} autoFocus style={{ margin: '0 auto' }}>
          <span>BACK</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ garage modal */
export function GarageModal({
  coins,
  selectedSkin,
  onSelectSkin,
  onClose,
}: {
  coins: number;
  selectedSkin: string;
  onSelectSkin: (skinId: string) => void;
  onClose: () => void;
}) {
  const [unlocked, setUnlocked] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem('neon_unlocked_skins') || '["cyan_blaster"]');
  });

  const buyOrSelect = (skin: CarSkin) => {
    if (unlocked.includes(skin.id)) {
      onSelectSkin(skin.id);
      localStorage.setItem('neon_skin', skin.id);
    } else if (coins >= skin.price) {
      const updatedCoins = coins - skin.price;
      const updatedUnlocked = [...unlocked, skin.id];
      localStorage.setItem('neon_coins', String(updatedCoins));
      localStorage.setItem('neon_unlocked_skins', JSON.stringify(updatedUnlocked));
      setUnlocked(updatedUnlocked);
      onSelectSkin(skin.id);
    }
  };

  return (
    <div className="overlay pause-overlay" onClick={onClose}>
      <div className="menu-card wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="menu-title">GARAGE & SHOP</h2>
        <div style={{ textAlign: 'center', color: '#ffcf3a', marginBottom: '16px', fontWeight: 'bold' }}>
          TOTAL COINS: 🪙 {coins}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {CAR_SKINS.map((skin) => {
            const isOwned = unlocked.includes(skin.id);
            const isSelected = selectedSkin === skin.id;
            return (
              <div
                key={skin.id}
                style={{
                  padding: '12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: isSelected ? '2px solid #00e5ff' : '1px solid #333',
                  borderRadius: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ color: skin.color, fontWeight: 'bold', fontSize: '16px' }}>{skin.name}</div>
                <div style={{ margin: '10px 0' }}>
                  <span style={{ display: 'inline-block', width: '30px', height: '15px', background: skin.color, borderRadius: '3px' }} />
                </div>
                <button
                  className="btn-primary"
                  style={{ width: '100%', fontSize: '12px' }}
                  onClick={() => buyOrSelect(skin)}
                >
                  {isSelected ? 'EQUIPPED' : isOwned ? 'EQUIP' : `UNLOCK 🪙 ${skin.price}`}
                </button>
              </div>
            );
          })}
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ margin: '20px auto 0' }}>
          <span>BACK</span>
        </button>
      </div>
    </div>
  );
}