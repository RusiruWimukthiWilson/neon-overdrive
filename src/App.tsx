import { useCallback, useEffect, useRef, useState } from 'react';
import { Hud } from './components/Hud';
import { CreditsModal, GarageModal, GameOver, PauseMenu, TitleScreen } from './components/Overlays';
import { Game, type Phase, type RunStats } from './game/game';
import {
  addScore, loadScores, loadSettings, renameScore, saveSettings, type ScoreEntry, type Settings,
} from './game/scores';

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [stats, setStats] = useState<RunStats | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [rank, setRank] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [touch, setTouch] = useState(isTouchDevice);
  const [showHints, setShowHints] = useState(false);
  const [bestAtStart, setBestAtStart] = useState(0);
  const [showCredits, setShowCredits] = useState(false);
  const [showGarage, setShowGarage] = useState(false);
  const overAt = useRef(0);
  const racesStarted = useRef(0);
  const phaseRef = useRef<Phase>('loading');
  phaseRef.current = phase;

  // ---------------------------------------------------------------- actions
  const start = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setBestAtStart(loadScores()[0]?.score ?? 0);
    setEntryId(null);
    racesStarted.current++;
    if (touch && racesStarted.current <= 2) {
      setShowHints(true);
      window.setTimeout(() => setShowHints(false), 4800);
    }
    g.start();
  }, [touch]);

  const pause = useCallback(() => gameRef.current?.pause(), []);
  const resume = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    gameRef.current?.resume();
  }, []);
  const toMenu = useCallback(() => {
    setScores(loadScores());
    gameRef.current?.toTitle();
  }, []);

  const toggleSfx = useCallback(() => setSettings((s) => ({ ...s, sfx: !s.sfx })), []);
  const toggleMusic = useCallback(() => setSettings((s) => ({ ...s, music: !s.music })), []);
  const muted = !settings.sfx && !settings.music;
  const toggleMute = useCallback(
    () => setSettings((s) => (s.sfx || s.music ? { sfx: false, music: false } : { sfx: true, music: true })),
    [],
  );

  const rename = useCallback((id: string, name: string) => setScores(renameScore(id, name)), []);

  const startRequest = useRef<() => void>(() => {});
  startRequest.current = () => {
    const p = phaseRef.current;
    if (p === 'title') start();
    else if (p === 'gameover' && performance.now() - overAt.current > 700) start();
    else if (p === 'racing' || p === 'countdown') pause();
    else if (p === 'paused') resume();
  };

  // ---------------------------------------------------------------- engine lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new Game(canvas, {
      onPhase: (p) => setPhase(p),
      onGameOver: (s) => {
        const res = addScore({ score: s.score, distance: s.distance, stage: s.stage });
        setScores(res.scores);
        setEntryId(res.rank > 0 ? res.id : null);
        setRank(res.rank);
        setStats(s);
        overAt.current = performance.now();
        if (res.rank === 1) g.sound.fanfare();
      },
      onStartRequest: () => startRequest.current(),
    });
    gameRef.current = g;
    setGame(g);
    g.init();
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { __neon?: Game }).__neon = g;
    }
    return () => {
      g.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    saveSettings(settings);
    game?.setSound(settings.sfx, settings.music);
  }, [settings, game]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      gameRef.current?.unlockAudio();
      if (e.pointerType === 'touch') setTouch(true);
    };
    const onKey = (e: KeyboardEvent) => {
      gameRef.current?.unlockAudio();
      if (!['Tab', 'Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) setTouch(false);
    };
    const onGesture = () => gameRef.current?.unlockAudio();
    window.addEventListener('pointerdown', onPointer, { capture: true });
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('touchend', onGesture, { capture: true });
    window.addEventListener('click', onGesture, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('touchend', onGesture, { capture: true });
      window.removeEventListener('click', onGesture, { capture: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.repeat) return;
      const c = e.code;
      if (c === 'KeyM') {
        toggleMute();
        return;
      }
      const confirm = c === 'Enter' || c === 'Space' || c === 'NumpadEnter';
      switch (phase) {
        case 'title':
          if (confirm) {
            e.preventDefault();
            start();
          }
          break;
        case 'countdown':
        case 'racing':
          if (c === 'Escape' || c === 'KeyP') {
            e.preventDefault();
            pause();
          }
          break;
        case 'paused':
          if (c === 'Escape' || c === 'KeyP' || confirm) {
            e.preventDefault();
            resume();
          } else if (c === 'KeyR') start();
          else if (c === 'KeyQ') toMenu();
          break;
        case 'gameover':
          if (confirm || c === 'KeyR') {
            e.preventDefault();
            if (performance.now() - overAt.current > 700) start();
          } else if (c === 'Escape' || c === 'KeyQ') toMenu();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, start, pause, resume, toMenu, toggleMute]);

  const hudVisible = phase === 'countdown' || phase === 'racing' || phase === 'paused' || phase === 'timeup';

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="scanlines" aria-hidden />

      {game && hudVisible && (
        <Hud
          game={game}
          touch={touch}
          best={bestAtStart}
          muted={muted}
          showHints={showHints}
          onPause={pause}
          onToggleMute={toggleMute}
        />
      )}

      {phase === 'loading' && (
        <div className="overlay loading-overlay">
          <div className="loading-text">
            LOADING<span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        </div>
      )}

      {phase === 'title' && (
        <TitleScreen
          scores={scores}
          touch={touch}
          settings={settings}
          onStart={start}
          onToggleSfx={toggleSfx}
          onToggleMusic={toggleMusic}
          onShowCredits={() => setShowCredits(true)}
          onShowGarage={() => setShowGarage(true)}
        />
      )}
      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
      {showGarage && (
        <GarageModal
          coins={Number(localStorage.getItem('neon_coins') || '0')}
          selectedSkin={localStorage.getItem('neon_skin') || 'cyan_blaster'}
          onSelectSkin={(skinId) => {
            if (game) game.selectedSkin = skinId;
          }}
          onClose={() => setShowGarage(false)}
        />
      )}

      {phase === 'paused' && (
        <PauseMenu
          settings={settings}
          onResume={resume}
          onRestart={start}
          onQuit={toMenu}
          onToggleSfx={toggleSfx}
          onToggleMusic={toggleMusic}
        />
      )}

      {phase === 'gameover' && stats && (
        <GameOver
          stats={stats}
          scores={scores}
          entryId={entryId}
          rank={rank}
          touch={touch}
          onRestart={start}
          onMenu={toMenu}
          onRename={rename}
        />
      )}
    </div>
  );
}