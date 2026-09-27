import { validateRun } from './autobattler.js';
import { ENCOUNTER_ROUNDS } from './encounters.js';

export const STORAGE_KEY = 'island-autobattler-v1';
const unavailable = '此瀏覽器無法儲存；仍可遊玩，但重新整理會失去進度。';

export function saveRun(state, storage) {
  const validation = validateRun(state);
  if (!validation.ok) return { ok: false, message: validation.message };
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return { ok: false, message: unavailable };
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 2, savedAt: Date.now(), state }));
    return { ok: true, message: '進度已儲存在這個瀏覽器。' };
  } catch { return { ok: false, message: unavailable }; }
}

export function loadRun(storage) {
  let raw;
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return { status: 'unavailable', state: null, message: unavailable };
    raw = target.getItem(STORAGE_KEY);
  } catch { return { status: 'unavailable', state: null, message: unavailable }; }
  if (raw === null) return { status: 'empty', state: null, message: '' };
  try {
    if (typeof raw !== 'string' || raw.length > 200000) throw new Error('invalid');
    const saved = JSON.parse(raw);
    if (![1, 2].includes(saved.version) || !Number.isFinite(saved.savedAt)) throw new Error('invalid');
    if (saved.version === 1) {
      if (saved.state?.schemaVersion !== 1) throw new Error('invalid');
      const state = saved.state;
      state.schemaVersion = 2;
      state.player.xp = 0;
      state.encounters = ENCOUNTER_ROUNDS.filter(round => round < state.round || round === state.round && state.phase !== 'recruit').map(round => ({ round, outcome: 'skipped' }));
      if (state.result) state.result.kind = 'round';
      if (state.combat) { state.combat.kind = 'round'; state.combat.opponentName = state.opponent?.name; }
    }
    const validation = validateRun(saved.state);
    if (!validation.ok) return { status: 'invalid', state: null, message: `無法恢復舊進度：${validation.message}` };
    return { status: 'restored', state: saved.state, message: saved.state.phase === 'result' ? saved.state.result.kind === 'encounter' ? '已恢復小怪結算，獎勵已入帳，可回到同一輪旅店。' : '已恢復本輪結算，可繼續下一輪。' : '已恢復這個瀏覽器的進度。' };
  } catch { return { status: 'invalid', state: null, message: '存檔已損壞或版本不相容，請開始新局。' }; }
}

export function clearRun(storage) {
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return { ok: false, message: unavailable };
    target.removeItem(STORAGE_KEY);
    return { ok: true, message: '已清除進度。' };
  } catch { return { ok: false, message: unavailable }; }
}
