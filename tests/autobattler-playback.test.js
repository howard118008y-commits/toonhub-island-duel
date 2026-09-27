import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as engine from '../public/game/src/autobattler.js';
import { CONFIG, TRAITS, getCharacter } from '../public/game/src/roster.js';
import { loadRun, saveRun, clearRun } from '../public/game/src/storage.js';

// Execute the real UI controller with its engine and storage. Only browser
// surfaces and the animation driver are replaced, so races remain observable.
const file = new URL('../public/game/src/autobattler-app.js', import.meta.url);
const source = readFileSync(file, 'utf8').replace(/^import .*;\n/gm, '').replaceAll('import.meta.url', JSON.stringify(file.href));
const tick = () => new Promise(resolve => setImmediate(resolve));
const copy = value => structuredClone(value);
function prepared() {
  const state = engine.createRun({ seed: 803 });
  function unit(attack, hp) { return { uid: `u-${state.nextUid++}`, cardId: 9, golden: false, attack, hp, maxHp: hp, shield: 0 }; }
  state.player.board = [unit(3, 8)];
  state.opponent.board = [unit(4, 7)];
  return state;
}
function harness() {
  const data = new Map(), pending = [], calls = [], timers = new Map(), warnings = [];
  let saves = 0, timerId = 0, qa;
  const store = { getItem: key => data.get(key) ?? null, setItem(key, value) { saves++; data.set(key, value); }, removeItem: key => data.delete(key) };
  saveRun(prepared(), store); saves = 0;
  function eventTarget() {
    const listeners = new Map();
    return {
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      dispatch(name, event = {}) { for (const fn of [...(listeners.get(name) || [])]) fn(event); },
      count(name) { return listeners.get(name)?.size || 0; },
    };
  }
  function element() { return { ...eventTarget(), innerHTML: '', textContent: '', open: false, dataset: {}, querySelector: () => null, querySelectorAll: () => [], showModal() { this.open = true; }, close() { this.open = false; }, scrollIntoView() {} }; }
  const app = element(), dialog = element(), live = element();
  const document = { ...eventTarget(), hidden: false, activeElement: null, querySelector: selector => selector === '#app' ? app : selector === '#game-dialog' ? dialog : live };
  const window = { ...eventTarget(), scrollTo() {}, matchMedia: () => ({ matches: false }) };
  const fx = {
    capture: () => ({}), sync() {},
    cancel() { while (pending.length) pending.shift()(); },
    play(step) { calls.push({ step, shown: copy(qa.shown()) }); return new Promise(resolve => pending.push(resolve)); },
  };
  const context = vm.createContext({ ...engine, CONFIG, TRAITS, getCharacter, structuredClone, URL, AbortController, document, window,
    console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    createBattleEffects: () => fx, loadRun: () => loadRun(store), saveRun: state => saveRun(state, store), clearRun: () => clearRun(store), installThemeBridge() {},
  });
  vm.runInContext(source + '\nglobalThis.__qa = { act, newRun, run: () => run, shown: () => shown, busy: () => busy };', context, { filename: 'autobattler-app.js' });
  qa = context.__qa;
  const click = action => document.dispatch('click', { target: { closest: () => ({ disabled: false, dataset: { action } }) } });
  const visible = value => { document.hidden = !value; document.dispatch('visibilitychange'); };
  async function drain(promise) {
    let done = false; promise.then(() => { done = true; }, () => { done = true; });
    for (let index = 0; index < 600 && !done; index++) { pending.shift()?.(); await tick(); }
    assert(done, 'playback must settle without hanging');
    await promise;
  }
  async function settled(promise) {
    let done = false; promise.then(() => { done = true; }, () => { done = true; });
    await tick(); assert(done, 'cancelled/failed playback must settle'); await promise;
  }
  return { qa, fx, calls, pending, timers, warnings, document, app, live, click, visible, drain, settled, store, get saves() { return saves; } };
}

test('animation rejection or missing capture recovers to the saved result without rerunning combat', async () => {
  for (const method of ['play', 'capture']) {
    const h = harness();
    h.fx[method] = () => method === 'play' ? Promise.reject(new Error('animation API unavailable')) : (() => { throw new Error('detached card'); })();
    await h.qa.act(engine.startCombat);
    assert.equal(h.qa.busy(), false);
    assert.deepEqual(h.qa.shown(), h.qa.run());
    assert.equal(h.qa.run().phase, 'result');
    assert.equal(h.saves, 1);
    assert.match(h.live.textContent, /動畫.*結果|動畫.*完成/);
    assert(h.warnings.length, 'failure remains diagnosable');
  }
});

test('a never-settling animation has a bounded fallback and clears its watchdog', async () => {
  const h = harness(); h.fx.play = () => new Promise(() => {});
  const play = h.qa.act(engine.startCombat); await tick();
  assert(h.qa.busy());
  const watchdog = [...h.timers.values()].find(timer => timer.delay >= 1000 && timer.delay <= 10000);
  assert(watchdog, 'a bounded animation watchdog is scheduled');
  watchdog.fn(); await h.settled(play);
  assert.equal(h.qa.busy(), false);
  assert.deepEqual(h.qa.shown(), h.qa.run());
  assert.equal(h.timers.size, 0);
  assert.equal(h.saves, 1);
});

test('skip settles independently of a broken cancel, and late playback cannot overwrite a new run', async () => {
  const h = harness(); h.fx.cancel = () => { throw new Error('animation cancellation failed'); };
  const play = h.qa.act(engine.startCombat); await tick();
  const result = copy(h.qa.run());
  h.click('skip'); await h.settled(play);
  assert.deepEqual(h.qa.shown(), result);
  assert.equal(h.qa.busy(), false); assert.equal(h.saves, 1);
  h.qa.newRun();
  const fresh = copy(h.qa.run());
  while (h.pending.length) h.pending.shift()(); await tick();
  assert.deepEqual(h.qa.shown(), fresh);
  assert.deepEqual(loadRun(h.store).state, fresh);
  assert.equal(fresh.phase, 'recruit'); assert.equal(fresh.round, 1);
  assert.equal(h.timers.size, 0);
});

test('effect synchronisation failure does not leave recruit or combat controls locked', async () => {
  const h = harness(); h.fx.sync = () => { throw new Error('stale ghost'); };
  const play = h.qa.act(engine.startCombat);
  await h.drain(play);
  assert.equal(h.qa.busy(), false);
  assert.deepEqual(h.qa.shown(), h.qa.run());
  assert(h.warnings.length);
});

test('hidden pages pause and resume the interrupted visual step without resolving combat again', async () => {
  const h = harness(); const play = h.qa.act(engine.startCombat); await tick();
  for (let index = 0; index < 20 && h.calls.at(-1)?.step.type !== 'attack'; index++) { h.pending.shift()?.(); await tick(); }
  const first = h.calls.at(-1).step; assert.equal(first.type, 'attack');
  h.visible(false); await tick();
  const callCount = h.calls.length;
  assert.equal(h.timers.size, 0, 'a hidden page must not run a failure timer');
  await tick(); assert.equal(h.calls.length, callCount);
  assert(h.qa.busy()); assert.equal(h.saves, 1);
  h.visible(true); await tick();
  assert.equal(h.calls.length, callCount + 1, 'becoming visible restarts the visual driver');
  assert.equal(h.calls.at(-1).step, first, 'resume replays the interrupted step');
  await h.drain(play);
  assert.equal(h.qa.busy(), false); assert.equal(h.saves, 1);
  assert.equal(h.document.count('visibilitychange'), 0);
  assert.equal(h.timers.size, 0);
});

test('restart while hidden releases the visibility wait and cannot pollute the fresh game', async () => {
  const h = harness(); h.visible(false);
  const play = h.qa.act(engine.startCombat); await tick();
  assert.equal(h.calls.length, 0);
  h.qa.newRun(); await h.settled(play);
  h.visible(true); await tick();
  assert.equal(h.qa.run().phase, 'recruit'); assert.equal(h.qa.run().round, 1);
  assert.equal(h.qa.busy(), false); assert.equal(h.calls.length, 0);
  assert.equal(h.document.count('visibilitychange'), 0);
  assert.equal(h.timers.size, 0);
});

test('damage snapshots update at impact, duplicate starts stay locked, and next round remains manual', async () => {
  const h = harness(); const play = h.qa.act(engine.startCombat);
  await h.qa.act(engine.startCombat); assert.equal(h.saves, 1);
  await h.drain(play);
  const hits = h.calls.filter(call => call.step.type === 'damage');
  assert(hits.length);
  for (const hit of hits) assert.deepEqual(hit.shown, hit.step.snapshot);
  await h.drain(h.qa.act(engine.nextRound));
  assert.equal(h.qa.run().phase, 'recruit'); assert.equal(h.qa.run().round, 2);
  assert.equal(h.qa.run().player.gold, 4); assert.equal(h.saves, 2);
  assert.equal(h.timers.size, 0);
});

test('50 rapid skip/restart cycles release listeners and timers without late state changes', async () => {
  const h = harness();
  for (let index = 0; index < 50; index++) {
    Object.assign(h.qa.run(), prepared());
    const play = h.qa.act(engine.startCombat); await tick();
    if (index % 2 === 0) h.visible(false);
    h.click('skip'); h.qa.newRun();
    const fresh = copy(h.qa.run());
    h.visible(true); await h.settled(play);
    assert.deepEqual(h.qa.shown(), fresh);
    assert.equal(h.qa.busy(), false); assert.equal(h.pending.length, 0);
    assert.equal(h.document.count('visibilitychange'), 0); assert.equal(h.timers.size, 0);
  }
  assert.equal(h.saves, 100, 'each round resolves and each new run saves exactly once');
});
