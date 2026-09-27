import { validateRun } from './autobattler.js';

export const STORAGE_KEY = 'island-autobattler-v1';
const unavailable = '此瀏覽器無法儲存；仍可遊玩，但重新整理會失去進度。';

export function saveRun(state, storage) {
  const validation = validateRun(state);
  if (!validation.ok) return { ok: false, message: validation.message };
  try {
    const target = storage || globalThis.localStorage;
    if (!target) return { ok: false, message: unavailable };
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), state }));
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
    if (saved.version !== 1 || !Number.isFinite(saved.savedAt)) throw new Error('invalid');
    const validation = validateRun(saved.state);
    if (!validation.ok) return { status: 'invalid', state: null, message: `無法恢復舊進度：${validation.message}` };
    return { status: 'restored', state: saved.state, message: saved.state.phase === 'result' ? '已恢復本輪結算，可繼續下一輪。' : '已恢復這個瀏覽器的進度。' };
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
