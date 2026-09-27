import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, getCharacter } from '../public/game/src/roster.js';
import * as engine from '../public/game/src/autobattler.js';
import { getGuideAdvice, GUIDE_ADVICE_NOTE } from '../public/game/src/guide-advisor.js';

const copy = value => structuredClone(value);
function unit(state, cardId, extra = {}) {
  const card = getCharacter(cardId);
  return { uid: `u-${state.nextUid++}`, cardId, attack: card.attack, hp: card.health, maxHp: card.health, shield: card.keywords.includes('shield') ? 1 : 0, golden: false, ...extra };
}
function offers(state, ids) { state.shop.offers = ids.map(cardId => ({ uid: `u-${state.nextUid++}`, cardId })); }
function atRound(round) {
  const state = engine.createRun({ seed: 811 });
  state.player.board = [unit(state, 9, { attack: 100, hp: 100, maxHp: 100 })];
  while (state.round < round) { engine.startCombat(state, { recordTimeline: false }); engine.nextRound(state); }
  return state;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function advise(state, selectedUid = null) { return getGuideAdvice({ run: state, selectedUid }); }
function act(state, hint, selectedUid = null) {
  let result;
  if (hint.action === 'select') {
    const target = state.player[hint.target.zone].find(item => item.uid === hint.target.uid);
    assert(target, 'recommended UID exists in the stated zone');
    if (selectedUid && selectedUid !== target.uid) result = engine.moveUnit(state, selectedUid, hint.target.zone, state.player[hint.target.zone].indexOf(target));
    else selectedUid = selectedUid === target.uid ? null : target.uid;
  } else if (hint.action === 'unselect') selectedUid = null;
  else if (hint.action === 'place') result = engine.moveUnit(state, selectedUid, 'board', hint.target.index);
  else if (hint.action === 'buy') result = engine.buy(state, hint.target.uid);
  else if (hint.action === 'sell') { result = engine.sell(state, selectedUid); selectedUid = null; }
  else if (hint.action === 'refresh') result = engine.refreshShop(state);
  else if (hint.action === 'upgrade') result = engine.upgradeTavern(state);
  else if (hint.action === 'combat') result = engine.startCombat(state, { recordTimeline: false });
  else if (hint.action === 'open-reward') {
    const id = state.pendingReward.choices.find(cardId => engine.canReceiveUnit(state, cardId));
    assert.notEqual(id, undefined); result = engine.chooseTripleReward(state, id);
  } else assert.equal(hint.action, 'lobby', `unexpected recruitment action ${hint.action}`);
  if (result) assert.equal(result.ok, true, `${hint.action}: ${result.message}`);
  return selectedUid;
}

test('advisor is deterministic, read-only and suppressed during combat, transitions or dialogs', () => {
  const run = freeze(engine.createRun({ seed: 803 })), serialized = JSON.stringify(run), first = advise(run);
  assert.equal(first.note, GUIDE_ADVICE_NOTE); assert.match(first.note, /非.*保證最優/);
  for (let index = 0; index < 100; index++) assert.deepEqual(advise(run), first);
  assert.equal(JSON.stringify(run), serialized);
  for (const context of [{ busy: true }, { dialogOpen: true }, { chestOpening: true }, { shown: { ...run, phase: 'combat' } }, { shown: { ...run, player: { ...run.player, gold: 0 } } }]) assert.equal(getGuideAdvice({ run, ...context }), null);
  assert.equal(getGuideAdvice(), null);
});

test('opening, lobby and saved results point to their real next controls', () => {
  const run = engine.createRun({ seed: 80 });
  assert.equal(getGuideAdvice({ run, screen: 'opening' }).target.action, 'open-chest');
  assert.equal(getGuideAdvice({ run, screen: 'opening', chestOpening: true }), null);
  assert.equal(getGuideAdvice({ run, screen: 'lobby' }).action, 'new-run');
  assert.equal(getGuideAdvice({ run, screen: 'lobby', adventureStarted: true }).action, 'continue');
  for (const [phase, kind, action] of [['result', 'round', 'next'], ['result', 'encounter', 'return-tavern'], ['gameover', 'round', 'new-run']]) {
    const state = { ...run, phase, result: { kind } }; assert.equal(advise(state).action, action);
  }
});

test('empty teams recruit or deploy legally, and spent-out runs receive a usable menu escape', () => {
  const run = engine.createRun({ seed: 81 });
  const purchase = advise(run); assert.equal(purchase.action, 'buy'); act(run, purchase);
  const recruit = run.player.bench[0]; assert.equal(run.player.gold, 0);
  const selection = advise(run); assert.equal(selection.target.uid, recruit.uid);
  const selected = act(run, selection), placement = advise(run, selected);
  assert.equal(placement.action, 'place'); assert.equal(placement.target.index, 0); act(run, placement, selected);
  assert.equal(advise(run).action, 'combat');
  for (const gold of [0, 1, 2]) {
    const empty = engine.createRun({ seed: 81 }); empty.player.gold = gold;
    assert.equal(advise(empty).target.action, 'lobby');
  }
  const soldOut = engine.createRun({ seed: 82 }); soldOut.shop.offers = []; soldOut.player.gold = 3;
  assert.equal(advise(soldOut).action, 'lobby');
  soldOut.player.gold = 4; assert.equal(advise(soldOut).action, 'refresh'); act(soldOut, advise(soldOut));
  assert.equal(soldOut.player.gold, 3); assert.equal(advise(soldOut).action, 'buy');
});

test('recommendations distinguish duplicate-card UIDs and clear an unrelated selection before moving', () => {
  const run = engine.createRun({ seed: 82 }); run.player.gold = 0;
  run.player.board = [unit(run, 5)];
  run.player.bench = [unit(run, 3), unit(run, 3, { attack: 9, hp: 10, maxHp: 10 })];
  const target = run.player.bench[1], selected = run.player.board[0].uid;
  assert.equal(advise(run).target.uid, target.uid);
  assert.equal(advise(run, selected).action, 'unselect');
  assert.equal(advise(run, target.uid).action, 'place');
  const corrupt = copy(run); corrupt.player.bench[1].uid = corrupt.player.bench[0].uid;
  assert.equal(advise(corrupt), null, 'an ambiguous UID must never select the wrong card');
});

test('full hand and board can buy a real triple but golden copies never count toward that triple', () => {
  const run = engine.createRun({ seed: 83 });
  run.player.board = [9, 9, 3, 4, 5].map(id => unit(run, id, { attack: 10, hp: 10, maxHp: 10 })); run.player.bench = [6, 7, 8].map(id => unit(run, id)); offers(run, [9, 2]);
  const hint = advise(run); assert.equal(hint.action, 'buy'); assert.equal(hint.target.uid, run.shop.offers[0].uid); assert.match(hint.reason, /三合一/);
  act(run, hint); assert(run.pendingReward);
  const makeRoom = advise(run); assert.equal(makeRoom.action, 'select'); assert.equal(makeRoom.target.zone, 'bench');
  const selected = act(run, makeRoom); act(run, advise(run, selected), selected);
  assert.equal(advise(run).action, 'open-reward');
  const golden = engine.createRun({ seed: 84 });
  golden.player.board = [9, 9, 3, 4, 5].map(id => unit(golden, id, id === 9 ? { golden: true, attack: 2, hp: 10, maxHp: 10 } : {}));
  golden.player.bench = [6, 7, 8].map(id => unit(golden, id)); offers(golden, [9]);
  assert.notEqual(advise(golden).action, 'buy');
});

test('pending free rewards make space through legal deployment or sale instead of blocking forever', () => {
  const run = engine.createRun({ seed: 85 });
  run.player.board = [1, 2, 3, 4, 5].map(id => unit(run, id)); run.player.bench = [6, 7, 8].map(id => unit(run, id));
  run.pendingReward = { choices: [9, 10, 11] };
  const hint = advise(run); assert.equal(hint.action, 'select'); assert.equal(hint.target.zone, 'bench');
  const selected = act(run, hint), sale = advise(run, selected); assert.equal(sale.action, 'sell'); act(run, sale, selected);
  assert.equal(advise(run).action, 'open-reward'); act(run, advise(run)); assert.equal(run.pendingReward, null);
  const room = copy(run); room.player.board.pop(); room.pendingReward = { choices: [15, 16, 17] };
  const deploy = advise(room); assert.equal(deploy.action, 'select'); assert.equal(deploy.target.zone, 'bench');
});

test('matching a distinct faction partner is explained truthfully and equal candidates keep shop order', () => {
  const run = engine.createRun({ seed: 86 }); run.player.board = [unit(run, 13)]; offers(run, [3, 14]);
  const hint = advise(run); assert.equal(hint.target.uid, run.shop.offers[1].uid); assert.match(hint.reason, /2位不同人情/);
  const same = engine.createRun({ seed: 87 }); offers(same, [3, 3]);
  assert.equal(advise(same).target.uid, same.shop.offers[0].uid);
});

test('a worthwhile upgrade is suggested at most once per round and never at the last round', () => {
  const run = atRound(4); run.player.board = [3, 4, 5, 6, 9].map(id => unit(run, id, { attack: 100, hp: 100, maxHp: 100 }));
  run.player.gold = 10; offers(run, [3]);
  assert.equal(advise(run).action, 'upgrade'); act(run, advise(run));
  assert.equal(advise(run).action, 'combat');
  const last = atRound(10); last.player.board = copy(run.player.board); last.player.gold = 10; offers(last, [3]);
  assert.notEqual(advise(last).action, 'upgrade');
});

test('refresh preserves recruitment money, respects frozen shops and stops after one bad reroll', () => {
  const run = atRound(6); run.player.board = [3, 5, 9, 14, 7].map(id => unit(run, id));
  run.player.tier = 4; run.player.upgradeCost = 0; run.player.gold = 8; offers(run, [3, 3, 3]);
  assert.equal(advise(run).action, 'refresh');
  const frozen = copy(run); frozen.shop.frozen = true; assert.equal(advise(frozen).action, 'combat');
  const broke = copy(run); broke.player.gold = 3; assert.equal(advise(broke).action, 'combat');
  const noHistory = copy(run); noHistory.log = []; assert.equal(advise(noHistory).action, 'combat');
  act(run, advise(run)); offers(run, [3, 3, 3]); assert.equal(advise(run).action, 'combat');
  assert.equal(run.player.gold, 7);
});

test('strictly useful placement reaches a stable layout without recommending a reverse move', () => {
  for (const cards of [[11, 3, 7], [24, 3, 7, 11, 21], [21, 11, 7, 24, 3], [3, 5, 9]]) {
    const run = engine.createRun({ seed: 88 }); run.player.gold = 0; run.player.board = cards.map(id => unit(run, id));
    let selected = null; const layouts = new Set([run.player.board.map(unit => unit.uid).join(',')]);
    for (let step = 0; step < 30; step++) {
      const hint = advise(run, selected);
      if (hint.action === 'combat') break;
      const oldLayout = run.player.board.map(unit => unit.uid).join(','); selected = act(run, hint, selected);
      const layout = run.player.board.map(unit => unit.uid).join(',');
      if (layout !== oldLayout) { assert(!layouts.has(layout), 'placement must not cycle back'); layouts.add(layout); }
      assert(step < 29, 'small-board placement must converge');
    }
    assert.equal(advise(run, selected).action, 'combat');
  }
});

test('all board/hand capacities and low-money boundaries produce read-only advice executable by the real engine', () => {
  let checked = 0;
  for (let boardCount = 0; boardCount <= CONFIG.boardSize; boardCount++) for (let benchCount = 0; benchCount <= CONFIG.benchSize; benchCount++) for (const gold of [0, 1, 2, 3, 4, 8]) {
    const run = engine.createRun({ seed: 89 }); run.player.gold = gold;
    run.player.board = [3, 5, 9, 14, 7].slice(0, boardCount).map(id => unit(run, id)); run.player.bench = [11, 18, 21].slice(0, benchCount).map(id => unit(run, id));
    assert.equal(engine.validateRun(run).ok, true);
    const before = JSON.stringify(run), hint = advise(freeze(run)); assert(hint);
    assert.equal(JSON.stringify(run), before); assert.equal(typeof hint.title, 'string'); assert.equal(typeof hint.reason, 'string');
    assert(hint.title.length <= 10, hint.title); assert(hint.reason.length <= 20, hint.reason);
    const live = copy(run); let selected = act(live, hint);
    if (hint.action === 'select') { const next = advise(live, selected); selected = act(live, next, selected); }
    assert.equal(engine.validateRun(live).ok, true); checked++;
  }
  assert.equal(checked, 144);
});
