export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  distance: number;
  stage: number;
  date: number;
}

export interface Settings {
  sfx: boolean;
  music: boolean;
}

const KEY = 'neon-overdrive:scores:v1';
const NAME_KEY = 'neon-overdrive:name';
const SETTINGS_KEY = 'neon-overdrive:settings';
export const MAX_SCORES = 10;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* storage unavailable */
  }
}

export function loadScores(): ScoreEntry[] {
  const raw = safeGet(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && typeof e.score === 'number' && typeof e.name === 'string')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch {
    return [];
  }
}

function persist(scores: ScoreEntry[]) {
  safeSet(KEY, JSON.stringify(scores));
}

export function getPlayerName(): string {
  return (safeGet(NAME_KEY) || 'ACE').slice(0, 10);
}

export function setPlayerName(name: string) {
  safeSet(NAME_KEY, name.slice(0, 10));
}

export function sanitizeName(name: string): string {
  const s = name.toUpperCase().replace(/[^A-Z0-9 _\-.!]/g, '').trim().slice(0, 10);
  return s || 'ACE';
}

/** Insert a score; returns updated table, the new id and its rank (1-based, 0 if not ranked). */
export function addScore(entry: Omit<ScoreEntry, 'id' | 'date' | 'name'>): { scores: ScoreEntry[]; id: string; rank: number } {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const e: ScoreEntry = { ...entry, id, name: getPlayerName(), date: Date.now() };
  const all = [...loadScores(), e].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
  const idx = all.findIndex((s) => s.id === id);
  if (idx >= 0 && e.score > 0) {
    persist(all);
    return { scores: all, id, rank: idx + 1 };
  }
  return { scores: loadScores(), id, rank: 0 };
}

export function renameScore(id: string, name: string): ScoreEntry[] {
  const clean = sanitizeName(name);
  setPlayerName(clean);
  const all = loadScores().map((s) => (s.id === id ? { ...s, name: clean } : s));
  persist(all);
  return all;
}

export function loadSettings(): Settings {
  try {
    const raw = safeGet(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return { sfx: s.sfx !== false, music: s.music !== false };
    }
  } catch {
    /* ignore */
  }
  return { sfx: true, music: true };
}

export function saveSettings(s: Settings) {
  safeSet(SETTINGS_KEY, JSON.stringify(s));
}
