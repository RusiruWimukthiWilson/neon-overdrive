import { useEffect, useRef } from 'react';
import type { Game, HudData } from '../game/game';
import { formatScore } from '../game/util';

interface Props {
  game: Game & { hasShield?: boolean; totalCoins?: number };
  touch: boolean;
  best: number;
  muted: boolean;
  showHints: boolean;
  onPause: () => void;
  onToggleMute: () => void;
}

function restart(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      {muted ? (
        <>
          <path d="m16 9 5 6" />
          <path d="m21 9-5 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

export function Hud({ game, touch, best, muted, showHints, onPause, onToggleMute }: Props) {
  const scoreEl = useRef<HTMLSpanElement>(null);
  const bestEl = useRef<HTMLSpanElement>(null);
  const multEl = useRef<HTMLDivElement>(null);
  const comboEl = useRef<HTMLDivElement>(null);
  const timeBox = useRef<HTMLDivElement>(null);
  const timeEl = useRef<HTMLSpanElement>(null);
  const fracEl = useRef<HTMLSpanElement>(null);
  const bonusEl = useRef<HTMLDivElement>(null);
  const stageEl = useRef<HTMLDivElement>(null);
  const progEl = useRef<HTMLDivElement>(null);
  const carEl = useRef<HTMLDivElement>(null);
  const speedEl = useRef<HTMLSpanElement>(null);
  const speedBar = useRef<HTMLDivElement>(null);
  const nitroBar = useRef<HTMLDivElement>(null);
  const nitroBox = useRef<HTMLButtonElement>(null);
  const leftHint = useRef<HTMLDivElement>(null);
  const rightHint = useRef<HTMLDivElement>(null);
  const coinsEl = useRef<HTMLSpanElement>(null);
  const shieldEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const last = {
      score: -1, mult: -1, combo: -1, ti: -1, tf: -1, low: false, cp: -1, stage: '', prog: -1,
      kmh: -1, spd: -1, nitro: -1, state: '', l: false, r: false, newBest: false,
      coins: -1, shield: false,
    };
    let shown = 0;
    game.onHud = (h: HudData) => {
      shown = h.score < shown ? h.score : shown + Math.max(1, (h.score - shown) * 0.22);
      const s = Math.min(h.score, Math.floor(shown));
      if (s !== last.score && scoreEl.current) {
        last.score = s;
        scoreEl.current.textContent = formatScore(s);
        const nb = best > 0 && s > best;
        if (nb !== last.newBest && bestEl.current) {
          last.newBest = nb;
          bestEl.current.textContent = nb ? '★ NEW BEST' : `BEST ${formatScore(best)}`;
          bestEl.current.classList.toggle('is-new', nb);
        }
      }
      if (h.mult !== last.mult && multEl.current) {
        const el = multEl.current;
        el.textContent = `x${h.mult}`;
        el.dataset.on = h.mult > 1 ? '1' : '0';
        el.dataset.hot = h.mult >= 5 ? '1' : '0';
        if (h.mult > last.mult && h.mult > 1) restart(el, 'pop');
        last.mult = h.mult;
      }
      const c = Math.round(h.combo * 100) / 100;
      if (c !== last.combo && comboEl.current) {
        last.combo = c;
        comboEl.current.style.transform = `scaleX(${c})`;
      }
      const ti = Math.floor(h.time);
      const tf = Math.floor((h.time % 1) * 10);
      if (ti !== last.ti && timeEl.current) {
        last.ti = ti;
        timeEl.current.textContent = String(ti).padStart(2, '0');
        if (h.time <= 10 && timeBox.current) restart(timeBox.current, 'tick');
      }
      if (tf !== last.tf && fracEl.current) {
        last.tf = tf;
        fracEl.current.textContent = `.${tf}`;
      }
      const low = h.time <= 10;
      if (low !== last.low && timeBox.current) {
        last.low = low;
        timeBox.current.classList.toggle('low', low);
      }
      if (h.cp !== last.cp && bonusEl.current) {
        if (last.cp >= 0 && h.cp > last.cp) {
          bonusEl.current.textContent = `+${h.cpExt}`;
          restart(bonusEl.current, 'show');
          if (timeBox.current) restart(timeBox.current, 'bump');
        }
        last.cp = h.cp;
      }
      const st = `STAGE ${h.stage} · ${h.zone}`;
      if (st !== last.stage && stageEl.current) {
        last.stage = st;
        stageEl.current.textContent = st;
      }
      const p = Math.round(h.progress * 300) / 300;
      if (p !== last.prog && progEl.current && carEl.current) {
        last.prog = p;
        progEl.current.style.transform = `scaleX(${p})`;
        carEl.current.style.left = `${p * 100}%`;
      }
      if (h.kmh !== last.kmh && speedEl.current) {
        last.kmh = h.kmh;
        speedEl.current.textContent = String(h.kmh);
      }
      const sp = Math.round(h.speedPct * 100) / 100;
      if (sp !== last.spd && speedBar.current) {
        last.spd = sp;
        speedBar.current.style.transform = `scaleX(${sp})`;
      }
      const n = Math.round(h.nitro * 100) / 100;
      if (n !== last.nitro && nitroBar.current) {
        last.nitro = n;
        nitroBar.current.style.transform = `scaleX(${n})`;
      }
      const state = h.nitroOn ? 'on' : h.nitroReady ? 'ready' : 'empty';
      if (state !== last.state && nitroBox.current) {
        last.state = state;
        nitroBox.current.dataset.state = state;
      }
      if (h.steerL !== last.l && leftHint.current) {
        last.l = h.steerL;
        leftHint.current.classList.toggle('active', h.steerL);
      }
      if (h.steerR !== last.r && rightHint.current) {
        last.r = h.steerR;
        rightHint.current.classList.toggle('active', h.steerR);
      }

      // 🪙 Coins DOM Update
      const totalCoins = game.totalCoins ?? 0;
      if (totalCoins !== last.coins && coinsEl.current) {
        last.coins = totalCoins;
        coinsEl.current.textContent = String(totalCoins);
      }

      // 🛡️ Shield Status DOM Update
      const shield = !!game.hasShield;
      if (shield !== last.shield && shieldEl.current) {
        last.shield = shield;
        shieldEl.current.style.display = shield ? 'block' : 'none';
      }
    };
    return () => {
      game.onHud = null;
    };
  }, [game, best]);

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-score-box">
          <div className="hud-label">SCORE</div>
          <span ref={scoreEl} className="hud-score">0</span>
          <span ref={bestEl} className="hud-best">{best > 0 ? `BEST ${formatScore(best)}` : 'BEST —'}</span>
          <div className="mult-row">
            <div ref={multEl} className="mult" data-on="0">x1</div>
            <div className="combo-track">
              <div ref={comboEl} className="combo-fill" />
            </div>
          </div>
        </div>

        <div className="hud-center">
          <div ref={timeBox} className="time-box">
            <div className="hud-label">TIME</div>
            <div className="time-digits">
              <span ref={timeEl}>35</span>
              <span ref={fracEl} className="time-frac">.0</span>
            </div>
            <div ref={bonusEl} className="time-bonus" />
          </div>
          <div ref={stageEl} className="stage-label">STAGE 1</div>
          <div className="progress">
            <div ref={progEl} className="progress-fill" />
            <div ref={carEl} className="progress-car" />
            <div className="progress-flag" />
          </div>
        </div>

        <div className="hud-buttons">
          <button
            className="icon-btn"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onToggleMute}
          >
            <SoundIcon muted={muted} />
          </button>
          <button className="icon-btn" aria-label="Pause" onPointerDown={(e) => e.stopPropagation()} onClick={onPause}>
            <PauseIcon />
          </button>
        </div>
      </div>

      <div className="hud-bottom">
        <div className="speed-box">
          <div className="speed-digits">
            <span ref={speedEl}>0</span>
            <small>KM/H</small>
          </div>
          <div className="speed-track">
            <div ref={speedBar} className="speed-fill" />
          </div>
        </div>

        <button
          ref={nitroBox}
          className="nitro-box"
          data-state="empty"
          aria-label="Fire nitro"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            game.queueNitro();
          }}
        >
          <div className="nitro-head">
            <span>NITRO</span>
            <kbd>{touch ? 'TAP / SWIPE ↑' : 'SPACE'}</kbd>
          </div>
          <div className="nitro-track">
            <div ref={nitroBar} className="nitro-fill" />
            <div className="nitro-ticks" />
          </div>
        </button>

        <div className="speed-box ghost" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: '4px' }}>
          <div style={{ color: '#ffcf3a', fontWeight: 900, fontSize: '15px', textShadow: '0 0 6px rgba(255, 207, 58, 0.5)' }}>
            🪙 <span ref={coinsEl}>0</span>
          </div>
          <div ref={shieldEl} style={{ display: 'none', color: '#00ff66', fontWeight: 800, fontSize: '12px', textShadow: '0 0 8px #00ff66' }}>
            🛡️ SHIELD
          </div>
        </div>
      </div>

      {touch && (
        <>
          <div ref={leftHint} className={`steer-hint left ${showHints ? 'intro' : ''}`}>
            <span>◀</span>
            {showHints && <em>HOLD</em>}
          </div>
          <div ref={rightHint} className={`steer-hint right ${showHints ? 'intro' : ''}`}>
            <span>▶</span>
            {showHints && <em>HOLD</em>}
          </div>
        </>
      )}
    </div>
  );
}