import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as engine from '../public/game/src/autobattler.js';
import { CONFIG, ROSTER, TRAITS, getCharacter } from '../public/game/src/roster.js';
import { loadRun, saveRun, clearRun } from '../public/game/src/storage.js';
import { CHARACTER_STORIES, CHARACTER_STORY_NOTE } from '../public/game/src/character-stories.js';

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
function harness(state = prepared(), { enterRun = true, reducedMotion = false, canHover = true, narrowScreen = false } = {}) {
  const data = new Map(), pending = [], calls = [], timers = new Map(), warnings = [];
  let saves = 0, timerId = 0, now = 10_000, qa;
  const store = { getItem: key => data.get(key) ?? null, setItem(key, value) { saves++; data.set(key, value); }, removeItem: key => data.delete(key) };
  if (state) saveRun(state, store); saves = 0;
  function eventTarget() {
    const listeners = new Map();
    return {
      addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      dispatch(name, event = {}) { for (const fn of [...(listeners.get(name) || [])]) fn({ type: name, ...event }); },
      count(name) { return listeners.get(name)?.size || 0; },
    };
  }
  function element() { const classes = new Set(); return { ...eventTarget(), innerHTML: '', textContent: '', open: false, dataset: {}, style: {}, children: [], classList: {
    add(...names) { names.forEach(name => classes.add(name)); }, remove(...names) { names.forEach(name => classes.delete(name)); }, contains: name => classes.has(name),
    toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; },
  },
    querySelector: () => null, querySelectorAll: () => [], showModal() { this.open = true; }, close() { this.open = false; }, scrollIntoView() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 80, height: 120 }), cloneNode: () => element(), setAttribute() {}, removeAttribute() {},
    append(node) { node.parent = this; this.children.push(node); }, remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); },
  }; }
  const app = element(), dialog = element(), live = element(), inspector = element(), panel = element(), pin = element();
  let appHTML = '', renders = 0;
  Object.defineProperty(app, 'innerHTML', { get: () => appHTML, set(value) {
    appHTML = value; renders++;
    inspector.innerHTML = value.match(/<div id="inspector-content"[^>]*>([\s\S]*)<\/div><\/aside>/)?.[1] || '';
    panel.classList.toggle('is-open', /<aside class="card-inspector[^\"]*\bis-open/.test(value));
  } });
  app.querySelector = selector => !appHTML.includes('id="inspector-content"') ? null : selector === '#inspector-content' ? inspector : selector === '.card-inspector' ? panel : null;
  panel.querySelector = selector => selector === '[data-action="inspector-pin"]' ? pin : null;
  const document = { ...eventTarget(), body: element(), hidden: false, activeElement: null, querySelector: selector => selector === '#app' ? app : selector === '#game-dialog' ? dialog : live };
  const window = { ...eventTarget(), scrollTo() {}, matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? reducedMotion : query === '(hover: hover)' ? canHover : query === '(max-width: 1099px)' ? narrowScreen : false }) };
  const fx = {
    capture: () => ({}), sync() {},
    cancel() { while (pending.length) pending.shift()(); },
    play(step) { calls.push({ step, shown: copy(qa.shown()) }); return new Promise(resolve => pending.push(resolve)); },
  };
  class ClockDate extends Date { static now() { return now; } }
  const context = vm.createContext({ ...engine, CONFIG, ROSTER, TRAITS, getCharacter, CHARACTER_STORIES, CHARACTER_STORY_NOTE, structuredClone, URL, AbortController, document, window, Date: ClockDate,
    console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame(fn) { const id = ++timerId; timers.set(id, { fn, delay: 16, at: now + 16 }); return id; }, cancelAnimationFrame: id => timers.delete(id),
    createBattleEffects: () => fx, loadRun: () => loadRun(store), saveRun: state => saveRun(state, store), clearRun: () => clearRun(store), installThemeBridge() {},
  });
  vm.runInContext(source + '\nglobalThis.__qa = { act, newRun, run: () => run, shown: () => shown, busy: () => busy, screen: () => screen, selection: () => selectedUid };', context, { filename: 'autobattler-app.js' });
  qa = context.__qa;
  const click = (action, extra = {}) => document.dispatch('click', { preventDefault() {}, target: { closest: () => ({ disabled: false, dataset: { action, ...extra } }) } });
  // Stored adventures now enter through the real lobby action. Preserve every
  // combat recovery assertion instead of bypassing the new presentation flow.
  if (enterRun) { click('enter-lobby'); click('continue'); }
  const visibilityBaseline = document.count('visibilitychange');
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
  async function finishAction() { for (let index = 0; index < 600 && qa.busy(); index++) { pending.shift()?.(); await tick(); } assert.equal(qa.busy(), false); }
  async function advance(ms) {
    const until = now + ms;
    for (let count = 0; count < 1000; count++) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) { now = until; return; }
      const [id, timer] = next; timers.delete(id); now = timer.at; timer.fn(); await tick();
    }
    assert.fail('timer queue did not settle');
  }
  function beginDrag(kind, uid, destination) {
    const source = element(); source.dataset[kind === 'offer' ? 'dragOffer' : 'dragUid'] = uid;
    const face = { disabled: false, closest: () => source };
    const target = destination ? { dataset: destination, classList: { add() {} } } : null;
    document.elementFromPoint = () => target && { closest: selector => {
      const key = { '[data-buy-zone]': 'buyZone', '[data-sell-zone]': 'sellZone', '[data-drop-zone]': 'dropZone' }[selector];
      return key && Object.hasOwn(target.dataset, key) ? target : null;
    } };
    const event = { pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10, preventDefault() {}, target: { closest: () => face } };
    app.dispatch('pointerdown', event); app.dispatch('pointermove', { ...event, clientX: 30, clientY: 60 });
    return { release: (cancel = false) => app.dispatch(cancel ? 'pointercancel' : 'pointerup', { ...event, clientX: 30, clientY: 60 }) };
  }
  function drag(kind, uid, destination, cancel = false) {
    const pointer = beginDrag(kind, uid, destination);
    pointer.release(cancel); pointer.release(); // A duplicated release cannot purchase twice.
  }
  function cardTarget(criteria) {
    const tags = [...`${app.innerHTML}\n${dialog.innerHTML}`.matchAll(/<button\b[^>]*>/g)];
    for (const [tag] of tags) {
      const dataset = {};
      for (const [, name, value] of tag.matchAll(/data-([\w-]+)="([^"]*)"/g)) dataset[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      if (!dataset.inspectCard || !Object.entries(criteria).every(([key, value]) => dataset[key] === String(value))) continue;
      const target = { dataset, disabled: /\sdisabled(?:\s|>|=)/.test(tag), closest: selector => ['[data-inspect-card]', '[data-action]'].includes(selector) ? target : null };
      return target;
    }
    assert.fail(`No rendered card matches ${JSON.stringify(criteria)}`);
  }
  const inspect = (criteria, event = 'pointerover', pointerType = 'mouse') => {
    const target = cardTarget(criteria);
    document.dispatch(event, { target, pointerType, preventDefault() {} }); return target;
  };
  return { qa, fx, calls, pending, timers, warnings, document, window, app, live, dialog, inspector, panel, click, inspect, cardTarget, visible, drain, settled, finishAction, advance, beginDrag, drag, store, visibilityBaseline, get renders() { return renders; }, get saves() { return saves; } };
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
  assert.equal(h.document.count('visibilitychange'), h.visibilityBaseline);
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
  assert.equal(h.document.count('visibilitychange'), h.visibilityBaseline);
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
    assert.equal(h.document.count('visibilitychange'), h.visibilityBaseline); assert.equal(h.timers.size, 0);
  }
  assert.equal(h.saves, 100, 'each round resolves and each new run saves exactly once');
});

test('encounter skip, animation failure and restart cannot replay or duplicate the saved reward', async () => {
  for (const interruption of ['skip', 'failure', 'restart']) {
    const state = prepared(); Object.assign(state.player.board[0], { attack: 100, hp: 100, maxHp: 100 });
    while (state.round < 3) { engine.startCombat(state, { recordTimeline: false }); engine.nextRound(state); }
    const h = harness(state), gold = state.player.gold;
    if (interruption === 'failure') h.fx.play = () => Promise.reject(new Error('animation interrupted'));
    const play = h.qa.act(engine.startEncounter); await tick();
    const saved = loadRun(h.store).state;
    assert.equal(saved.result.kind, 'encounter'); assert.equal(saved.player.gold, gold + 1); assert.equal(saved.player.xp, 1); assert.equal(h.saves, 1);
    if (interruption === 'skip') h.click('skip');
    if (interruption === 'restart') h.qa.newRun();
    await h.settled(play);
    if (interruption === 'restart') {
      assert.equal(h.qa.run().player.xp, 0); assert.equal(h.qa.run().round, 1); assert.deepEqual(h.qa.run().encounters, []);
      assert.equal(loadRun(h.store).state.player.xp, 0);
    } else {
      assert.deepEqual(h.qa.shown(), saved); assert.equal(h.qa.busy(), false);
      await h.drain(h.qa.act(engine.resumeRecruitment)); await h.qa.act(engine.startEncounter);
      assert.equal(h.qa.run().player.gold, gold + 1); assert.equal(h.qa.run().player.xp, 1); assert.equal(h.saves, 2);
      assert.equal(h.qa.run().phase, 'recruit'); assert.equal(h.qa.run().round, 3);
    }
    assert.equal(h.timers.size, 0); assert.equal(h.document.count('visibilitychange'), h.visibilityBaseline);
  }
});

test('pointer purchases are atomic, cancelled or blocked drops are free, and owned cards still reorder', async () => {
  const h = harness(), offer = h.qa.run().shop.offers[0];
  h.drag('offer', offer.uid, { buyZone: 'bench' });
  h.click('buy', { uid: offer.uid }); // Synthetic click following a drag is suppressed.
  await h.finishAction();
  assert.equal(h.qa.run().player.gold, 0); assert.equal(h.qa.run().player.bench.length, 1); assert.equal(h.saves, 1);
  assert.equal(h.qa.run().player.bench[0].cardId, offer.cardId); assert.equal(h.qa.run().player.board.length, 1);
  assert.equal(h.document.body.children.length, 0); assert.equal(h.timers.size, 0);
  for (const blocked of ['cancel', 'outside', 'no-gold', 'full', 'reward']) {
    const state = prepared(), offer = state.shop.offers[0];
    if (blocked === 'no-gold') state.player.gold = 2;
    if (blocked === 'full') state.player.bench = ROSTER.filter(card => card.id !== offer.cardId && card.id !== 9).slice(0, 3).map(card => ({ uid: `u-${state.nextUid++}`, cardId: card.id, attack: card.attack, hp: card.health, maxHp: card.health, golden: false, shield: card.keywords.includes('shield') ? 1 : 0 }));
    if (blocked === 'reward') state.pendingReward = { choices: ROSTER.filter(card => card.tier === 2).slice(0, 3).map(card => card.id) };
    const blockedHarness = harness(state), before = copy(blockedHarness.qa.run());
    blockedHarness.drag('offer', offer.uid, blocked === 'outside' ? null : { buyZone: 'bench' }, blocked === 'cancel');
    await blockedHarness.finishAction();
    assert.deepEqual(blockedHarness.qa.run(), before, blocked); assert.equal(blockedHarness.saves, 0);
    assert.equal(blockedHarness.document.body.children.length, 0); assert.equal(blockedHarness.timers.size, 0);
  }
  const state = prepared(); state.player.board.push({ ...state.player.board[0], uid: `u-${state.nextUid++}` });
  const mover = harness(state), first = state.player.board[0].uid;
  mover.drag('unit', first, { dropZone: 'board', dropIndex: '1' }); await mover.finishAction();
  assert.equal(mover.qa.run().player.board[1].uid, first); assert.equal(mover.qa.run().player.gold, 3);
  assert.equal(mover.document.body.children.length, 0); assert.equal(mover.timers.size, 0);
});

test('an empty first-round adventure continues from the lobby without resetting spent gold or the shop', async () => {
  const h = harness(); h.qa.newRun();
  await h.drain(h.qa.act(engine.refreshShop)); await h.drain(h.qa.act(engine.toggleFreeze));
  assert.equal(h.qa.run().player.board.length, 0); assert.equal(h.qa.run().player.bench.length, 0);
  assert.equal(h.qa.run().player.gold, 2); assert.equal(h.qa.run().shop.frozen, true);
  const before = copy(h.qa.run()), saves = h.saves;
  h.click('lobby'); assert.match(h.app.innerHTML, /data-action="continue"/);
  h.click('continue'); assert.deepEqual(h.qa.run(), before); assert.deepEqual(loadRun(h.store).state, before);
  assert.equal(h.saves, saves); assert.equal(h.timers.size, 0);
});

test('new and saved adventures wait for a deliberate chest click, then open exactly once', async () => {
  for (const state of [null, prepared()]) {
    const h = harness(state, { enterRun: false }), before = copy(h.qa.run());
    assert.equal(h.qa.screen(), 'opening'); assert.equal(h.timers.size, 0);
    const trigger = h.app.innerHTML.match(/<button\b[^>]*data-action="open-chest"[^>]*>/)?.[0];
    assert(trigger, 'the chest remains a native keyboard-operable button'); assert.match(trigger, /\btype="button"/);
    if (!state) { assert.equal(loadRun(h.store).status, 'empty'); assert.doesNotMatch(h.app.innerHTML, /data-action="continue"/); }
    await h.advance(60_000);
    assert.equal(h.qa.screen(), 'opening'); assert.deepEqual(h.qa.run(), before); assert.equal(h.saves, 0);
    h.click('open-chest');
    const opening = [...h.timers];
    assert.equal(opening.length, 1); assert.equal(opening[0][1].delay, 1050);
    await h.advance(500); h.click('open-chest');
    assert.deepEqual([...h.timers], opening, 'a second click must not restart the opening delay');
    await h.advance(549); assert.equal(h.qa.screen(), 'opening');
    await h.advance(1); assert.equal(h.qa.screen(), 'lobby'); assert.equal(h.timers.size, 0);
    h.click('open-chest'); await h.advance(10_000);
    assert.equal(h.qa.screen(), 'lobby'); assert.deepEqual(h.qa.run(), before); assert.equal(h.saves, 0);
    if (!state) {
      assert.doesNotMatch(h.app.innerHTML, /data-action="continue"/); assert.equal(loadRun(h.store).status, 'empty');
      h.click('new-run'); assert.equal(h.qa.screen(), 'run'); assert.equal(h.saves, 1);
      assert.equal(loadRun(h.store).status, 'restored'); assert.deepEqual(loadRun(h.store).state, h.qa.run());
    }
  }
});

test('skip and direct continuation cancel chest timers, including a callback already dequeued', async () => {
  const untouched = harness(null, { enterRun: false });
  untouched.click('enter-lobby'); assert.equal(untouched.qa.screen(), 'lobby'); assert.equal(untouched.timers.size, 0);
  for (const route of ['skip', 'continue', 'new-run']) {
    const h = harness(prepared(), { enterRun: false }); h.click('open-chest');
    const lateCallback = [...h.timers.values()][0].fn;
    if (route === 'skip') { h.click('enter-lobby'); assert.equal(h.qa.screen(), 'lobby'); h.click('continue'); }
    else if (route === 'continue') h.click('continue');
    else h.qa.newRun();
    const before = copy(h.qa.run()), saves = h.saves;
    assert.equal(h.qa.screen(), 'run'); assert.equal(h.timers.size, 0);
    lateCallback(); await h.advance(5000);
    assert.equal(h.qa.screen(), 'run'); assert.deepEqual(h.qa.run(), before); assert.equal(h.saves, saves);
    h.click('lobby'); h.click('continue'); await h.advance(5000);
    assert.equal(h.qa.screen(), 'run'); assert.deepEqual(h.qa.run(), before); assert.equal(h.timers.size, 0);
  }
});

test('reduced motion still waits for a player action and enters the lobby without an animation timer', async () => {
  for (const action of ['open-chest', 'enter-lobby']) {
    const h = harness(prepared(), { enterRun: false, reducedMotion: true }), before = copy(h.qa.run());
    await h.advance(60_000); assert.equal(h.qa.screen(), 'opening'); assert.equal(h.timers.size, 0);
    h.click(action); assert.equal(h.qa.screen(), 'lobby'); assert.equal(h.timers.size, 0);
    assert.deepEqual(h.qa.run(), before); assert.equal(h.saves, 0);
  }
});

test('dragging a shop card to the hand and then onto the board requires two actions and never starts combat', async () => {
  const state = engine.createRun({ seed: 771 }), h = harness(state), offer = h.qa.run().shop.offers[0];
  h.drag('offer', offer.uid, { dropZone: 'board', dropIndex: '0' }); await h.finishAction();
  assert.equal(h.qa.run().player.gold, 3); assert.equal(h.qa.run().player.board.length, 0); assert.equal(h.saves, 0);
  h.drag('offer', offer.uid, { buyZone: 'bench' }); await h.finishAction();
  const bought = h.qa.run().player.bench[0];
  assert.equal(h.qa.run().player.gold, 0); assert.equal(h.qa.run().player.board.length, 0); assert.equal(bought.cardId, offer.cardId);
  h.drag('unit', bought.uid, { dropZone: 'board', dropIndex: '0' }); await h.finishAction();
  assert.equal(h.qa.run().player.bench.length, 0); assert.equal(h.qa.run().player.board[0].uid, bought.uid);
  assert.equal(h.qa.run().phase, 'recruit'); assert.equal(h.qa.run().combat, null);
  assert.equal(h.calls.some(({ step }) => ['attack', 'damage'].includes(step.type)), false);
  assert.equal(h.saves, 2); assert.equal(h.document.body.children.length, 0); assert.equal(h.timers.size, 0);
});

test('merchant drops sell owned cards exactly once and reject shop cards or cancelled sales', async () => {
  for (const zone of ['board', 'bench']) for (const mode of ['sale', 'cancel', 'offer']) {
    const state = prepared();
    if (zone === 'bench') { state.player.bench = state.player.board; state.player.board = []; }
    const h = harness(state), before = copy(h.qa.run());
    // Read the real rendered attribute: a fabricated nonempty stub would hide a bare-attribute bug.
    const merchantTag = h.app.innerHTML.match(/<[^>]*\bdata-sell-zone(?:\s|=|>)[^>]*>/)?.[0];
    assert(merchantTag, 'the rendered merchant must expose a sale drop target');
    const merchantValue = merchantTag.match(/\bdata-sell-zone="([^"]*)"/)?.[1];
    assert(merchantValue, 'the handler requires an explicit nonempty sale target value');
    const uid = mode === 'offer' ? before.shop.offers[0].uid : before.player[zone][0].uid;
    h.drag(mode === 'offer' ? 'offer' : 'unit', uid, { sellZone: merchantValue }, mode === 'cancel'); await h.finishAction();
    if (mode === 'sale') {
      assert.equal(h.qa.run().player.gold, before.player.gold + 1); assert.equal(h.qa.run().player[zone].length, 0); assert.equal(h.saves, 1);
      assert.deepEqual(loadRun(h.store).state, h.qa.run());
    } else { assert.deepEqual(h.qa.run(), before); assert.equal(h.saves, 0); }
    assert.equal(h.document.body.children.length, 0); assert.equal(h.timers.size, 0);
  }
});

test('cancelled drags and lobby transitions ignore late pointer frames and releases', async () => {
  for (const kind of ['offer', 'unit']) for (const route of ['cancel', 'escape', 'blur', 'resize', 'hidden', 'lobby']) {
    const h = harness(), before = copy(h.qa.run());
    const uid = kind === 'offer' ? before.shop.offers[0].uid : before.player.board[0].uid;
    const destination = kind === 'offer' ? { buyZone: 'bench' } : { dropZone: 'bench', dropIndex: '0' };
    const pointer = h.beginDrag(kind, uid, destination);
    const frame = [...h.timers.values()].find(timer => timer.delay === 16)?.fn;
    assert(frame); assert.equal(h.document.body.children.length, 1);
    if (route === 'cancel') pointer.release(true);
    else if (route === 'escape') h.document.dispatch('keydown', { key: 'Escape' });
    else if (route === 'blur') h.window.dispatch('blur');
    else if (route === 'resize') h.window.dispatch('resize');
    else if (route === 'hidden') h.visible(false);
    else h.click('lobby');
    assert.equal(h.document.body.children.length, 0); assert.equal(h.timers.size, 0);
    await h.advance(401);
    if (route === 'lobby') { assert.equal(h.qa.screen(), 'lobby'); h.click('continue'); }
    if (route === 'hidden') h.visible(true);
    frame(); pointer.release(); await h.finishAction();
    assert.equal(h.qa.screen(), 'run'); assert.deepEqual(h.qa.run(), before); assert.equal(h.saves, 0);
    assert.equal(h.document.body.children.length, 0); assert.equal(h.timers.size, 0);
  }
});

test('returning to the lobby during combat keeps its single saved result and ignores the old playback', async () => {
  const h = harness(), playback = h.qa.act(engine.startCombat); await tick();
  assert.equal(h.qa.busy(), true); assert.equal(h.qa.run().phase, 'result');
  const result = copy(h.qa.run()), saves = h.saves;
  h.click('lobby'); assert.equal(h.qa.screen(), 'lobby'); await h.settled(playback);
  h.click('continue'); await h.advance(6000);
  assert.equal(h.qa.screen(), 'run'); assert.deepEqual(h.qa.run(), result); assert.deepEqual(h.qa.shown(), result);
  assert.deepEqual(loadRun(h.store).state, result); assert.equal(h.saves, saves); assert.equal(h.qa.busy(), false);
  assert.equal(h.timers.size, 0); assert.equal(h.document.count('visibilitychange'), h.visibilityBaseline);
});

function inspection(h) {
  const html = h.inspector.innerHTML;
  return {
    html, id: Number(html.match(/data-inspected-card="(\d+)"/)?.[1]),
    uid: html.match(/data-inspected-uid="([^"]*)"/)?.[1], source: html.match(/data-inspected-source="([^"]*)"/)?.[1],
    status: html.match(/class="inspector-status">([^<]*)<\/p>/)?.[1],
    attack: Number(html.match(/class="inspector-attack">[\s\S]*?<b>(\d+)<\/b>/)?.[1]),
    hp: Number(html.match(/class="inspector-health">[\s\S]*?<b>(\d+)<\/b>/)?.[1]),
  };
}
async function untilVisual(h, predicate) {
  for (let step = 0; step < 400 && !predicate(); step++) { h.pending.shift()?.(); await tick(); }
  assert(predicate(), 'expected real combat snapshot must be reached');
}
function encounterRun(round = 3) {
  const state = prepared(); Object.assign(state.player.board[0], { attack: 100, hp: 100, maxHp: 100 });
  while (state.round < round) { engine.startCombat(state, { recordTimeline: false }); engine.nextRound(state); }
  Object.assign(state.player.board[0], { attack: 3, hp: 8, maxHp: 8 });
  return state;
}

test('hover and focus inspect exact duplicate-card UIDs without spending, selecting or rebuilding the board', () => {
  const state = prepared(), first = state.player.board[0];
  const second = { ...first, uid: `u-${state.nextUid++}`, golden: true, attack: 8, hp: 10, maxHp: 10 };
  state.player.bench = [second]; state.shop.offers = [{ uid: `u-${state.nextUid++}`, cardId: first.cardId }];
  const h = harness(state), before = copy(h.qa.run()), renders = h.renders;
  h.inspect({ inspectSource: 'owned', inspectUid: first.uid });
  assert.equal(inspection(h).uid, first.uid); assert.equal(inspection(h).attack, 3); assert.equal(inspection(h).hp, 8);
  h.inspect({ inspectSource: 'owned', inspectUid: second.uid }, 'focusin');
  assert.equal(inspection(h).uid, second.uid); assert.equal(inspection(h).attack, 8); assert.equal(inspection(h).hp, 10);
  assert.match(inspection(h).html, /金卡/);
  h.inspect({ inspectSource: 'shop', inspectOffer: state.shop.offers[0].uid });
  assert.equal(inspection(h).attack, 1); assert.equal(inspection(h).hp, 5); assert.equal(inspection(h).source, 'shop');
  assert.equal(h.renders, renders); assert.equal(h.qa.selection(), null); assert.equal(h.saves, 0); assert.deepEqual(h.qa.run(), before);
  h.inspect({ inspectSource: 'owned', inspectUid: first.uid }, 'click');
  h.click('inspector-pin'); // Allow previews again while keeping the placement selection.
  const selectedRenders = h.renders;
  h.inspect({ inspectSource: 'owned', inspectUid: second.uid }, 'focusin');
  assert.equal(h.qa.selection(), first.uid); assert.equal(inspection(h).uid, second.uid);
  assert.equal(h.renders, selectedRenders); assert.equal(h.saves, 0); assert.deepEqual(h.qa.run(), before);
});

test('all 24 card panels show their current identity, rules, quote and original story', () => {
  for (const card of ROSTER) {
    const state = prepared(); state.shop.offers = [{ uid: `u-${state.nextUid++}`, cardId: card.id }]; state.player.tier = 4; state.player.upgradeCost = 0;
    const h = harness(state); h.inspect({ inspectSource: 'shop', inspectCard: card.id }, 'focusin');
    const shown = inspection(h);
    assert.equal(shown.id, card.id); assert.equal(shown.attack, card.attack); assert.equal(shown.hp, card.health);
    for (const text of [card.region, card.job, card.shortText, card.quote, CHARACTER_STORIES[card.id], CHARACTER_STORY_NOTE]) assert(shown.html.includes(text), `${card.id}: ${text}`);
    assert.equal(h.saves, 0); assert.equal(h.qa.run().phase, 'recruit');
  }
});

test('pinned owned and opponent panels follow shown combat damage and never restore a defeated unit to permanent HP', async () => {
  for (const source of ['owned', 'opponent']) {
    const h = harness(), unit = source === 'owned' ? h.qa.run().player.board[0] : h.qa.run().opponent.board[0];
    if (source === 'opponent') h.click('team-info');
    h.inspect({ inspectSource: source, inspectUid: unit.uid }, 'click');
    const play = h.qa.act(engine.startCombat); await tick();
    const side = source === 'owned' ? 'player' : 'enemy';
    await untilVisual(h, () => h.qa.shown().phase === 'combat' && h.qa.shown().combat[side].some(item => item.uid === unit.uid && item.hp > 0 && item.hp < unit.hp));
    const current = h.qa.shown().combat[side].find(item => item.uid === unit.uid);
    assert.equal(inspection(h).source, `combat-${side}`); assert.equal(inspection(h).hp, current.hp);
    assert.equal(inspection(h).attack, current.attack); assert.match(inspection(h).status, /戰鬥中/);
    if (source === 'owned') {
      await untilVisual(h, () => h.qa.shown().phase === 'combat' && !h.qa.shown().combat.player.some(item => item.uid === unit.uid));
      assert.equal(inspection(h).hp, 0); assert.match(inspection(h).status, /已退場/);
      assert.equal(h.qa.run().player.board[0].hp, unit.hp, 'permanent board is healed but the inspector must not use it');
    }
    await h.drain(play); assert.equal(h.saves, 1);
    if (source === 'owned') assert.equal(inspection(h).hp, 0);
    h.click('next'); await h.finishAction(); assert.match(h.inspector.innerHTML, /inspector-empty/);
  }
});

test('a pinned encounter preview becomes the real enemy instance and follows its first damage', async () => {
  const h = harness(encounterRun()), monster = engine.getEncounterOffer(h.qa.run()).board[0];
  h.click('encounter-info'); h.inspect({ inspectSource: 'encounter', inspectUid: monster.uid }, 'click');
  assert.equal(inspection(h).hp, 4);
  const play = h.qa.act(engine.startEncounter); await tick();
  await untilVisual(h, () => h.qa.shown().phase === 'combat' && h.qa.shown().combat.enemy.some(unit => unit.uid === monster.uid && unit.hp > 0 && unit.hp < monster.hp));
  const damaged = h.qa.shown().combat.enemy.find(unit => unit.uid === monster.uid);
  assert.equal(inspection(h).source, 'combat-enemy'); assert.equal(inspection(h).hp, damaged.hp);
  assert.match(inspection(h).status, /戰鬥中/); assert(inspection(h).html.includes(CHARACTER_STORIES[monster.cardId]));
  await h.drain(play); assert.equal(h.saves, 1);
});

test('bench cards and uninvolved opponents do not become defeated units in a different combat', async () => {
  for (const source of ['owned', 'opponent', 'encounter']) {
    const state = encounterRun();
    state.player.bench = [{ ...state.player.board[0], uid: `u-${state.nextUid++}`, attack: 9, hp: 9, maxHp: 9 }];
    const h = harness(state);
    const unit = source === 'owned' ? state.player.bench[0] : source === 'opponent' ? state.opponent.board[0] : engine.getEncounterOffer(state).board[0];
    if (source === 'opponent') h.click('team-info');
    if (source === 'encounter') h.click('encounter-info');
    h.inspect({ inspectSource: source, inspectUid: unit.uid }, 'click');
    const play = h.qa.act(source === 'opponent' ? engine.startEncounter : engine.startCombat); await tick();
    await untilVisual(h, () => h.qa.shown().phase === 'combat');
    assert.equal(inspection(h).source, source); assert.equal(inspection(h).hp, unit.hp);
    assert.doesNotMatch(inspection(h).status, /已退場/);
    await h.drain(play); assert.equal(h.saves, 1);
  }
});

test('all three monster panels use encounter stats and the combat-only puppet uses its summon record', async () => {
  for (const [round, cardId] of [[3, 201], [6, 202], [9, 203]]) {
    const h = harness(encounterRun(round)), monster = engine.getEncounterOffer(h.qa.run()).board.find(unit => unit.cardId === cardId);
    h.click('encounter-info'); h.inspect({ inspectSource: 'encounter', inspectUid: monster.uid }, 'click');
    assert.equal(inspection(h).id, cardId); assert.equal(inspection(h).attack, monster.attack); assert.equal(inspection(h).hp, monster.hp);
    assert(inspection(h).html.includes(CHARACTER_STORIES[cardId])); assert.equal(h.saves, 0);
  }
  const state = prepared(); Object.assign(state.player.board[0], { cardId: 13, attack: 3, hp: 3, maxHp: 3 });
  const h = harness(state), play = h.qa.act(engine.startCombat); await tick();
  await untilVisual(h, () => h.qa.shown().combat?.player.some(unit => unit.cardId === 101));
  const puppet = h.qa.shown().combat.player.find(unit => unit.cardId === 101);
  h.inspect({ inspectSource: 'combat-player', inspectUid: puppet.uid }, 'focusin');
  assert.equal(inspection(h).id, 101); assert.equal(inspection(h).attack, puppet.attack); assert.equal(inspection(h).hp, puppet.hp);
  assert.match(inspection(h).html, /召喚物紀錄/); assert(inspection(h).html.includes(getCharacter(101).description));
  await h.drain(play);
});

test('dragging ignores card previews and still performs only the intended purchase or deployment', async () => {
  for (const kind of ['offer', 'unit']) {
    const h = harness(), before = copy(h.qa.run()), own = before.player.board[0];
    h.inspect({ inspectSource: 'owned', inspectUid: own.uid }); const shown = inspection(h);
    const uid = kind === 'offer' ? before.shop.offers[0].uid : own.uid;
    const pointer = h.beginDrag(kind, uid, kind === 'offer' ? { buyZone: 'bench' } : { dropZone: 'bench', dropIndex: '0' });
    const renders = h.renders;
    h.inspect({ inspectSource: 'shop', inspectOffer: before.shop.offers[1].uid });
    h.inspect({ inspectSource: 'shop', inspectOffer: before.shop.offers[1].uid }, 'focusin');
    assert.deepEqual(inspection(h), shown); assert.equal(h.renders, renders); assert.equal(h.saves, 0);
    pointer.release(); pointer.release(); await h.finishAction();
    assert.equal(h.saves, 1); assert.equal(h.qa.run().player.bench.length, 1);
    assert.equal(h.qa.run().player.gold, kind === 'offer' ? 0 : 3);
    assert.equal(h.qa.run().phase, 'recruit'); assert.equal(h.document.body.children.length, 0); assert.equal(h.timers.size, 0);
  }
});

test('touch inspection closes without changing selection and its buy or deploy shortcuts stay atomic', async () => {
  const h = harness(prepared(), { canHover: false }), offer = h.qa.run().shop.offers[0];
  h.inspect({ inspectSource: 'shop', inspectOffer: offer.uid }, 'pointerover', 'touch');
  assert.match(h.inspector.innerHTML, /inspector-empty/);
  h.inspect({ inspectSource: 'shop', inspectOffer: offer.uid }, 'click', 'touch');
  assert.equal(h.panel.classList.contains('is-open'), true); assert.equal(h.saves, 0);
  h.click('inspector-close'); assert.equal(h.panel.classList.contains('is-open'), false); assert.equal(h.saves, 0);
  h.inspect({ inspectSource: 'shop', inspectOffer: offer.uid }, 'click', 'touch');
  h.click('inspector-buy'); h.click('inspector-buy'); await h.finishAction();
  assert.equal(h.saves, 1); assert.equal(h.qa.run().player.gold, 0); assert.equal(h.qa.run().player.bench.length, 1);
  const unit = h.qa.run().player.bench[0];
  h.click('inspect', { id: String(unit.cardId), uid: unit.uid, inspectSource: 'owned' });
  assert.equal(h.panel.classList.contains('is-open'), true);
  const selected = h.qa.selection(); h.click('inspector-close');
  assert.equal(h.qa.selection(), selected); assert.equal(h.saves, 1); assert.equal(h.panel.classList.contains('is-open'), false);
  h.click('inspect', { id: String(unit.cardId), uid: unit.uid, inspectSource: 'owned' });
  h.click('inspector-deploy'); h.click('inspector-deploy'); await h.finishAction();
  assert.equal(h.saves, 2); assert.equal(h.qa.run().player.bench.length, 0); assert.equal(h.qa.run().player.board.at(-1).uid, unit.uid);
  assert.equal(h.panel.classList.contains('is-open'), false); assert.equal(h.qa.run().phase, 'recruit');
  h.click('lobby'); h.click('continue'); assert.match(h.inspector.innerHTML, /inspector-empty/);
  h.qa.newRun(); assert.match(h.inspector.innerHTML, /inspector-empty/); assert.equal(h.panel.classList.contains('is-open'), false);
});

test('a queued modal close cannot steal focus from a newly opened phone inspector or another modal', () => {
  const h = harness(prepared(), { canHover: false, narrowScreen: true });
  const origin = h.cardTarget({ inspectSource: 'owned', inspectUid: h.qa.run().player.board[0].uid });
  function focusable(node) {
    node.getClientRects = () => [{}]; node.focus = () => { h.document.activeElement = node; };
    const closest = node.closest;
    node.closest = selector => selector === '[data-focus]' ? node : closest?.(selector);
    return node;
  }
  focusable(origin);
  assert.match(h.app.innerHTML, /<button\b[^>]*data-action="inspector-close"/);
  const close = focusable({ dataset: { action: 'inspector-close' } });
  const query = h.app.querySelector;
  h.app.querySelector = selector => selector === '[data-action="inspector-close"]' ? close : query(selector);
  h.app.querySelectorAll = selector => selector === '[data-focus]' ? [origin] : [];
  origin.focus(); h.click('team-info'); assert.equal(h.dialog.open, true);
  h.inspect({ inspectSource: 'opponent', inspectUid: h.qa.run().opponent.board[0].uid }, 'click');
  assert.equal(h.dialog.open, false); assert.equal(h.document.activeElement, close);
  h.dialog.dispatch('close'); assert.equal(h.document.activeElement, close, 'old modal close must respect the open inspector');
  h.click('rules'); assert.equal(h.dialog.open, true);
  const newModalControl = focusable({ dataset: { action: 'close-dialog' } }); newModalControl.focus();
  h.dialog.dispatch('close'); assert.equal(h.document.activeElement, newModalControl, 'old close must not steal focus from a later modal');
  assert.equal(h.saves, 0);
});
