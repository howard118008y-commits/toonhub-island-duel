import assert from 'node:assert/strict';
import test from 'node:test';
import { createBattleEffects } from '../public/game/src/effects.js';
import { createRun, startCombat, buy, chooseTripleReward } from '../public/game/src/autobattler.js';
import { getCharacter } from '../public/game/src/roster.js';

function scene() {
  let time = 0, timerId = 0, reduced = false, animationMode = 'normal';
  const timers = new Map(), active = new Set(), records = [], events = new Map();
  const win = {
    innerWidth: 375, innerHeight: 667, performance: { now: () => time },
    matchMedia: () => ({ get matches() { return reduced; } }),
    addEventListener: (name, fn) => events.set(name, fn),
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame(fn) { return this.setTimeout(fn, 16); }, cancelAnimationFrame: id => timers.delete(id),
  };
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('effects must not restore speed'); } });
  class Element {
    constructor(rect = { left: 0, top: 0, width: 80, height: 100 }) {
      Object.assign(this, { ownerDocument: doc, rect, children: [], dataset: {}, style: {}, className: '', selectors: new Map(), textContent: '' });
    }
    get classList() { return { add: name => { this.className += ` ${name}`; } }; }
    get offsetWidth() { return this.className.includes('speech') ? 170 : 60; }
    get offsetHeight() { return this.className.includes('speech') ? 48 : 40; }
    getBoundingClientRect() { return this.rect; }
    append(child) { child.parentElement = this; this.children.push(child); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    setAttribute() {}
    removeAttribute(name) { if (name === 'data-card-uid') delete this.dataset.cardUid; }
    querySelector(selector) { return this.selectors.get(selector) || null; }
    querySelectorAll(selector) { return selector === '[data-card-uid]' ? this.children.filter(child => child.dataset.cardUid) : []; }
    cloneNode() {
      const clone = new Element(this.rect); clone.className = this.className; clone.dataset = { ...this.dataset }; clone.style = { ...this.style }; clone.textContent = this.textContent;
      for (const [selector, value] of this.selectors) clone.selectors.set(selector, value.cloneNode ? value.cloneNode() : structuredClone(value));
      return clone;
    }
    getAnimations({ subtree = false } = {}) {
      return [...active].filter(animation => animation.element === this || subtree && this.children.some(child => child.getAnimations({ subtree: true }).includes(animation)));
    }
    animate(frames, options) {
      if (animationMode === 'throw') throw new Error('Web Animations unavailable');
      let resolve, reject;
      const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
      const animation = { element: this, finished, cancel() { win.clearTimeout(timer); active.delete(animation); reject(new Error('animation cancelled')); } };
      active.add(animation); records.push({ element: this, frames, options });
      const timer = win.setTimeout(() => { active.delete(animation); if (animationMode === 'reject') reject(new Error('animation interrupted')); else resolve(); }, options.duration);
      return animation;
    }
  }
  const doc = { defaultView: win, documentElement: { clientWidth: 375 }, addEventListener: (name, fn) => events.set(name, fn), createElement: () => new Element() };
  doc.body = new Element(); const root = new Element();
  function stat(number) { const outer = new Element(), value = new Element(); value.textContent = String(number); outer.selectors.set('b', value); return outer; }
  for (const side of ['player', 'enemy']) {
    const board = new Element();
    const card = new Element({ left: 12, top: side === 'player' ? 350 : 130, width: 77, height: 135 });
    card.dataset.cardUid = `${side}-0`;
    card.selectors.set('[data-id]', { dataset: { id: side === 'player' ? '1' : '2' } });
    card.selectors.set('.attack-stat', stat(3)); card.selectors.set('.health-stat', stat(8));
    board.append(card); root.selectors.set(`.${side}-board`, board);
  }
  const fx = createBattleEffects({ root }), layer = doc.body.children[0];
  const actor = { side: 'player', kind: 'card', uid: 'player-0', cardId: 1, slot: 0 };
  const target = { side: 'enemy', kind: 'card', uid: 'enemy-0', cardId: 2, slot: 0 };
  const attack = { type: 'attack', actor, target, changes: [] };
  const damage = { type: 'damage', actor, target, changes: [{ target: actor, field: 'hp', before: 8, after: 5, amount: -3 }] };
  async function flush() { for (let index = 0; index < 8; index++) await Promise.resolve(); }
  async function advance(duration) {
    const end = time + duration;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    time = end; await flush();
  }
  function clean() { assert.equal(layer.children.length, 0, 'effect DOM released'); assert.equal(active.size, 0, 'animations released'); assert.equal(timers.size, 0, 'animation timers and playback waiters released'); }
  return { fx, layer, root, actor, target, attack, damage, records, timers, active, events, flush, advance, clean,
    get card() { return root.querySelector('.player-board').children[0]; },
    set reduced(value) { reduced = value; }, set animationMode(value) { animationMode = value; },
  };
}

test('collision reaches the target at 350ms, HP syncs during return, and damage stays readable', async () => {
  const h = scene(); const original = h.card;
  let impacted = false; const attack = h.fx.play(h.attack, h.fx.capture()).then(() => { impacted = true; });
  const ghost = h.layer.children.find(node => node.dataset.effect === 'attack'); assert(ghost);
  const charge = h.records.find(record => record.element === ghost);
  assert.equal(charge.options.duration, 850);
  assert(charge.frames.some(frame => frame.offset === 350 / 850 && frame.transform.includes('translate(0px,-220px)')));
  await h.advance(349); assert.equal(impacted, false);
  await h.advance(1); await attack; assert(impacted);
  assert(h.layer.children.some(node => node.dataset.effect === 'impact-burst'));
  const replacement = original.cloneNode(); replacement.style.visibility = '';
  replacement.querySelector('.health-stat').querySelector('b').textContent = '5';
  h.root.querySelector('.player-board').children[0] = replacement; h.fx.sync();
  assert.equal(replacement.style.visibility, 'hidden');
  assert.equal(ghost.querySelector('.health-stat').querySelector('b').textContent, '5');
  let read = false; const damage = h.fx.play(h.damage, h.fx.capture()).then(() => { read = true; });
  assert(h.layer.children.some(node => node.textContent === '−3'));
  await h.advance(500); assert.equal(read, false); assert(!h.layer.children.includes(ghost));
  await h.advance(20); await damage; assert(read);
  assert.equal(original.style.visibility, ''); assert.equal(replacement.style.visibility, '');
  h.fx.cancel(); await h.flush(); h.clean();
  assert(!h.events.has('keydown'), 'keyboard access must not silently disable motion');
});

test('zero-damage shield exchanges wait for return, and cancel prevents a queued attack from reappearing', async () => {
  const h = scene(); const first = h.fx.play(h.attack); await h.advance(350); await first;
  const shield = { type: 'shield', target: h.target, changes: [{ target: h.target, field: 'shield', amount: -1 }] };
  await h.fx.play(shield); await h.fx.play({ ...shield, target: h.actor });
  const queued = h.fx.play({ ...h.attack, actor: h.target, target: h.actor });
  assert.equal(h.layer.children.filter(node => node.dataset.effect === 'attack').length, 1);
  await h.advance(200); h.fx.cancel(); await queued; await h.flush(); h.clean();
  await h.advance(2000); h.clean();
});

test('50 attack, damage, DOM replacement and cancel cycles release every resource', async () => {
  const h = scene();
  for (let index = 0; index < 50; index++) {
    const pending = [h.fx.play(h.attack)];
    await h.advance(index % 3 === 0 ? 350 : 100);
    if (index % 3 === 0) pending.push(h.fx.play(h.damage));
    const replacement = h.card.cloneNode(); replacement.style.visibility = '';
    h.root.querySelector('.player-board').children[0] = replacement; h.fx.sync();
    h.fx.cancel(); await Promise.all(pending); await h.flush();
    assert.equal(replacement.style.visibility, ''); h.clean();
  }
  await h.advance(5000); h.clean();
});

test('missing nodes and absent, throwing or rejecting animation APIs cannot hang playback', async () => {
  for (const mode of ['missing', 'absent', 'throw', 'reject']) {
    const h = scene(); h.animationMode = mode;
    if (mode === 'missing') h.root.selectors.clear();
    if (mode === 'absent') h.card.animate = undefined;
    const pending = h.fx.play(h.attack); await h.advance(350); await pending;
    const damage = h.fx.play(h.damage); await h.advance(520); await damage;
    h.fx.cancel(); await h.flush(); h.clean();
  }
});

test('resize restores the source card, and live reduced motion preserves readable damage', async () => {
  const h = scene(); const pending = h.fx.play(h.attack);
  assert.equal(h.card.style.visibility, 'hidden');
  h.events.get('resize')(); await h.advance(16);
  assert.equal(h.card.style.visibility, '');
  await h.advance(334); await pending; h.fx.cancel(); await h.flush(); h.clean();
  h.reduced = true; const beginning = h.records.length;
  const reducedAttack = h.fx.play(h.attack); await h.advance(350); await reducedAttack;
  assert(!h.layer.children.some(node => node.dataset.effect === 'attack'));
  let complete = false; const damage = h.fx.play(h.damage).then(() => { complete = true; });
  assert(h.layer.children.some(node => node.textContent === '−3'));
  await h.advance(519); assert.equal(complete, false);
  await h.advance(1); await damage;
  assert(h.records.slice(beginning).every(record => record.frames.every(frame => !('transform' in frame))));
  h.fx.cancel(); await h.flush(); h.clean();
});

test('real death and puppet summon events cannot leave the defeated unit damage on the new unit', async () => {
  const state = createRun({ seed: 4 });
  state.player.board = [{ uid: 'changhua', cardId: 11, golden: false, attack: 2, hp: 20, maxHp: 20, shield: 0 }];
  state.opponent.board = [{ uid: 'yunlin', cardId: 13, golden: false, attack: 1, hp: 2, maxHp: 2, shield: 0 }];
  const result = startCombat(state);
  assert.equal(result.timeline.find(step => step.type === 'attack').actor.uid, 'changhua');
  const h = scene(), template = h.card.cloneNode();
  function render(snapshot) {
    for (const side of ['player', 'enemy']) {
      const board = h.root.querySelector(`.${side}-board`); board.children = [];
      for (const [slot, unit] of (snapshot.combat?.[side] || []).entries()) {
        const card = template.cloneNode(); card.style.visibility = ''; card.dataset.cardUid = String(unit.uid);
        card.rect = { left: 12 + slot * 88, top: side === 'player' ? 350 : 130, width: 77, height: 135 };
        card.selectors.set('[data-id]', { dataset: { id: String(unit.cardId) } });
        card.querySelector('.health-stat').querySelector('b').textContent = String(Math.max(0, unit.hp));
        board.append(card);
      }
    }
    h.fx.sync();
  }
  let summoned = false;
  for (const step of result.timeline) {
    if (step.type === 'damage') render(step.snapshot);
    let done = false;
    const pending = h.fx.play(step, h.fx.capture()).then(() => { done = true; }); await h.flush();
    for (let index = 0; index < 150 && !done; index++) await h.advance(10);
    assert(done, 'real combat step settles'); await pending;
    if (step.type !== 'damage') render(step.snapshot);
    const frame = h.fx.capture();
    const orphaned = h.layer.children.filter(node => node.dataset.effectUid && !frame.entities.has(`${node.dataset.side}:card:${node.dataset.effectUid}`));
    assert.equal(orphaned.length, 0, `removed unit effects must be cleared after ${step.type}`);
    if (step.type === 'summon') { summoned = true; assert.equal(step.snapshot.combat.enemy[0].cardId, 101); break; }
  }
  assert(summoned); h.fx.cancel(); await h.flush(); h.clean();
});

test('damage follows the surviving UID when another unit leaves its earlier board position', async () => {
  const h = scene(), board = h.root.querySelector('.player-board');
  const survivor = h.card.cloneNode(); survivor.dataset.cardUid = 'survivor'; survivor.rect = { ...survivor.rect, left: 100 };
  board.append(survivor);
  const target = { ...h.actor, uid: 'survivor', slot: 1 };
  const pending = h.fx.play({ type: 'damage', changes: [{ target, field: 'hp', amount: -2 }] });
  const popup = h.layer.children.find(node => node.dataset.effect === 'damage');
  assert.equal(popup.dataset.effectUid, 'survivor'); assert.equal(popup.style.left, '108.5px');
  board.children = [survivor]; survivor.rect = { ...survivor.rect, left: 12 }; h.fx.sync();
  assert(h.layer.children.includes(popup), 'a live unit keeps its damage message');
  assert.equal(popup.style.left, '20.5px', 'damage anchors to the surviving UID at its new location');
  h.fx.cancel(); await pending; await h.flush(); h.clean();
});

test('impact numbers stay at their own card centre instead of yielding to speech or a prior hit', async () => {
  const h = scene(); h.card.rect = { ...h.card.rect, top: 0 };
  const shield = h.fx.play({ type: 'shield', target: h.actor, changes: [{ target: h.actor, field: 'shield', amount: 1 }] });
  const hit = h.fx.play(h.damage);
  const first = h.layer.children.find(node => node.dataset.effect === 'damage'); assert(first);
  const expected = { left: '20.5px', top: '37.5px' };
  assert.equal(first.style.left, expected.left); assert.equal(first.style.top, expected.top);
  await h.advance(520); await Promise.all([shield, hit]);
  const next = h.fx.play({ ...h.damage, changes: [{ target: h.actor, field: 'hp', before: 5, after: 3, amount: -2 }] });
  const damage = h.layer.children.filter(node => node.dataset.effect === 'damage');
  assert.equal(damage.length, 1); assert.equal(damage[0].textContent, '−2'); assert(!h.layer.children.includes(first));
  assert.equal(damage[0].style.left, expected.left); assert.equal(damage[0].style.top, expected.top);
  for (const speech of h.layer.children.filter(node => node.dataset.effect === 'speech')) {
    const overlaps = Number.parseFloat(speech.style.left) < 80.5 && Number.parseFloat(speech.style.left) + speech.offsetWidth > 20.5 && Number.parseFloat(speech.style.top) < 77.5 && Number.parseFloat(speech.style.top) + speech.offsetHeight > 37.5;
    assert.equal(overlaps, false, 'speech never covers the central damage number');
  }
  h.fx.cancel(); await next; await h.flush(); h.clean();
});

test('gold changes remain above the real coin balance and cancel releases their presentation', async () => {
  const h = scene(), hero = h.card.cloneNode(), coin = h.card.cloneNode();
  coin.rect = { left: 140, top: 560, width: 72, height: 34 };
  h.root.selectors.set('[data-hero="player"]', hero);
  h.root.selectors.set('[data-gold="player"]', coin);
  const pending = h.fx.play({ type: 'buy', actor: h.actor, changes: [
    { target: { side: 'player', kind: 'hero' }, field: 'gold', before: 15, after: 12, amount: -3 },
  ] }, h.fx.capture());
  const popup = h.layer.children.find(node => node.dataset.effect === 'gold');
  assert(popup); assert.equal(popup.textContent, '−3 金');
  assert(Number.parseFloat(popup.style.top) + popup.offsetHeight <= coin.rect.top - 8, 'gold badge must leave the balance unobscured');
  assert(h.records.filter(record => record.element === popup).every(record => record.frames.every(frame => !frame.transform)), 'gold uses opacity without enlarging across the balance');
  h.fx.cancel(); await pending; await h.flush(); h.clean();
  await h.advance(1500); h.clean();
});

test('one buff combines attack and health without duplicate healing or max-health numbers', async () => {
  const h = scene();
  const pending = h.fx.play({ type: 'buff', actor: h.actor, target: h.actor, changes: [
    { target: h.actor, field: 'attack', before: 3, after: 5, amount: 2 },
    { target: h.actor, field: 'maxHp', before: 8, after: 11, amount: 3 },
    { target: h.actor, field: 'hp', before: 8, after: 11, amount: 3 },
  ] });
  const buffs = h.layer.children.filter(node => node.dataset.effect === 'buff');
  assert.equal(buffs.length, 1); assert.match(buffs[0].textContent, /攻擊 \+2/); assert.match(buffs[0].textContent, /生命 \+3/);
  assert.equal(h.layer.children.filter(node => node.dataset.effect === 'heal').length, 0);
  await h.advance(400); await pending; h.fx.cancel(); await h.flush(); h.clean();
});

test('five simultaneous buffs retain distinct UID anchors and each compact badge fits its card width', async () => {
  const h = scene(), board = h.root.querySelector('.player-board'), template = h.card;
  board.children = []; const changes = [];
  for (let slot = 0; slot < 5; slot++) {
    const card = template.cloneNode(); card.dataset.cardUid = `ally-${slot}`;
    card.rect = { left: 12 + slot * 70, top: 350, width: 64, height: 135 }; board.append(card);
    const target = { ...h.actor, uid: card.dataset.cardUid, slot };
    changes.push({ target, field: 'attack', amount: 2 }, { target, field: 'maxHp', amount: 3 }, { target, field: 'hp', amount: 3 });
  }
  const pending = h.fx.play({ type: 'buff', actor: changes[0].target, changes });
  const buffs = h.layer.children.filter(node => node.dataset.effect === 'buff'); assert.equal(buffs.length, 5);
  assert.equal(new Set(buffs.map(node => node.dataset.effectUid)).size, 5);
  for (const popup of buffs) {
    const card = board.children.find(node => node.dataset.cardUid === popup.dataset.effectUid);
    assert(Number.parseFloat(popup.style.width) <= card.rect.width);
    assert.equal(popup.dataset.buffAttack, '+2 攻'); assert.equal(popup.dataset.buffHealth, '+3 血');
    assert.match(popup.textContent, /攻擊 \+2/); assert.match(popup.textContent, /生命 \+3/);
  }
  const ordered = buffs.toSorted((a, b) => Number.parseFloat(a.style.left) - Number.parseFloat(b.style.left));
  for (let index = 1; index < ordered.length; index++) assert(Number.parseFloat(ordered[index - 1].style.left) + Number.parseFloat(ordered[index - 1].style.width) <= Number.parseFloat(ordered[index].style.left));
  h.fx.cancel(); await pending; await h.flush(); h.clean();
});

test('simultaneous retaliation stays separated on the two original UID anchors while the attacker ghost touches its target', async () => {
  const h = scene(), attack = h.fx.play(h.attack); await h.advance(350); await attack;
  assert(h.layer.children.some(node => node.dataset.effect === 'attack'), 'the moving attacker still exists at contact');
  const damage = h.fx.play({ type: 'damage', actor: h.actor, target: h.target, changes: [
    { target: h.actor, field: 'hp', before: 8, after: 5, amount: -3 },
    { target: h.target, field: 'hp', before: 8, after: 4, amount: -4 },
  ] }, h.fx.capture());
  const popups = h.layer.children.filter(node => node.dataset.effect === 'damage'); assert.equal(popups.length, 2);
  const own = popups.find(node => node.dataset.effectUid === h.actor.uid), enemy = popups.find(node => node.dataset.effectUid === h.target.uid);
  assert.equal(own.textContent, '−3'); assert.equal(enemy.textContent, '−4');
  assert.equal(Number.parseFloat(own.style.top) - Number.parseFloat(enemy.style.top), 220);
  assert.equal(own.style.left, enemy.style.left);
  assert(Number.parseFloat(enemy.style.top) + enemy.offsetHeight < Number.parseFloat(own.style.top));
  h.fx.cancel(); await damage; await h.flush(); h.clean();
});

test('a broken shield, a later hit and healing share one central value channel on the same UID', async () => {
  const h = scene();
  const shield = h.fx.play({ type: 'shield', target: h.actor, changes: [{ target: h.actor, field: 'shield', amount: -1 }] });
  assert(h.layer.children.some(node => node.dataset.effect === 'guard' && node.className.includes('battle-fx-popup')));
  const hit = h.fx.play(h.damage);
  assert.equal(h.layer.children.filter(node => node.dataset.effect === 'guard' && node.className.includes('battle-fx-popup')).length, 0, 'real HP damage replaces the old shield label');
  await h.advance(520); await Promise.all([shield, hit]);
  const pending = h.fx.play({ type: 'heal', actor: h.actor, changes: [{ target: h.actor, field: 'hp', before: 5, after: 7, amount: 2 }] });
  const numbers = h.layer.children.filter(node => ['damage', 'heal', 'buff', 'guard'].includes(node.dataset.effect) && node.dataset.effectUid === h.actor.uid);
  assert.equal(numbers.length, 1, 'sequential effects on one UID must remain readable'); assert.equal(numbers[0].textContent, '+2');
  h.fx.cancel(); await pending; await h.flush(); h.clean();
});

function evolutionEvents() {
  const state = createRun({ seed: 1209 }); state.player.gold = 30;
  const card = getCharacter(1);
  const unit = () => ({ uid: `u-${state.nextUid++}`, cardId: card.id, golden: false, evolution: 0, attack: card.attack, hp: card.health, maxHp: card.health, shield: 0 });
  state.player.board = [unit(), unit()];
  const events = [];
  for (let rank = 1; rank <= 3; rank++) {
    const offer = { uid: `u-${state.nextUid++}`, cardId: card.id }; state.shop.offers = [offer];
    const result = buy(state, offer.uid); assert(result.ok);
    events.push(result.timeline.find(step => step.type === 'triple'));
    if (state.pendingReward) assert(chooseTripleReward(state, state.pendingReward.choices[0]).ok);
  }
  return events;
}
function effectDescendants(node) { return node.children.flatMap(child => [child, ...effectDescendants(child)]); }

test('real gold, epic and legendary events reveal their true before/after values and release the complete presentation', async () => {
  const events = evolutionEvents();
  for (const [index, event] of events.entries()) {
    const h = scene(); h.card.dataset.cardUid = event.evolution.consumedUids[0]; const frame = h.fx.capture();
    h.card.dataset.cardUid = event.target.uid;
    let finished = false; const pending = h.fx.play(event, frame).then(() => { finished = true; });
    const stage = h.layer.children.find(node => node.dataset.effect === 'evolution'); assert(stage);
    assert.equal(stage.dataset.evolution, String(index + 1));
    const parts = effectDescendants(stage);
    assert.equal(parts.filter(node => node.className === 'evolution-mote').length, index === 0 ? 3 : 2, 'newly bought materials still contribute a flight when they had no prior DOM card');
    assert(parts.some(node => node.className === 'evolution-name' && node.textContent.includes(['金卡', '紫卡', '傳說'][index])));
    for (const field of ['attack', 'hp']) {
      const line = parts.find(node => node.className === `evolution-${field}`);
      assert.equal(line.children.find(node => node.className === 'evolution-before').textContent, String(event.evolution.before[field]));
      assert.equal(line.children.find(node => node.className === 'evolution-after').textContent, String(event.evolution.after[field]));
    }
    const note = parts.find(node => node.className === 'evolution-note').textContent;
    assert.equal(note.includes('免費夥伴'), index === 0, 'higher evolutions cannot advertise another reward');
    await h.advance(1000); assert.equal(finished, false); await h.advance(400); await pending; h.clean();
  }
});

test('cancel during material flight and reduced-motion evolution never retain overlays, animations or waiters', async () => {
  const event = evolutionEvents()[0];
  for (const reduce of [false, true]) {
    const h = scene(); h.reduced = reduce;
    h.card.dataset.cardUid = event.evolution.consumedUids[0]; const frame = h.fx.capture(); h.card.dataset.cardUid = event.target.uid;
    const pending = h.fx.play(event, frame);
    const stage = h.layer.children.find(node => node.dataset.effect === 'evolution'); assert(stage);
    if (reduce) assert.equal(effectDescendants(stage).filter(node => node.className === 'evolution-mote' || node.className === 'evolution-flare').length, 0);
    const dequeued = [...h.timers.values()].map(timer => timer.fn);
    await h.advance(200); h.fx.cancel(); await pending; await h.flush(); h.clean();
    for (const callback of dequeued) callback();
    await h.flush(); h.clean();
    await h.advance(2000); h.clean();
  }
});
