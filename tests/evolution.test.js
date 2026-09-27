import test from 'node:test';
import assert from 'node:assert/strict';
import { EVOLUTIONS, getCharacter, getEvolution, getEvolutionMultiplier } from '../public/game/src/roster.js';
import { createRun, buy, sell, moveUnit, canReceiveUnit, getEvolutionOffer, chooseTripleReward, startCombat, getSynergies, validateRun } from '../public/game/src/autobattler.js';
import { STORAGE_KEY, saveRun, loadRun } from '../public/game/src/storage.js';

const copy = value => structuredClone(value);
const held = state => [...state.player.board, ...state.player.bench];
function unit(state, cardId, evolution = 0, extra = {}) {
  const card = getCharacter(cardId), multiplier = EVOLUTIONS[evolution].multiplier;
  return { uid: `u-${state.nextUid++}`, cardId, evolution, golden: evolution > 0, attack: card.attack * multiplier, hp: card.health * multiplier, maxHp: card.health * multiplier, shield: card.keywords.includes('shield') ? 1 : 0, ...extra };
}
function offer(state, cardId) { const result = { uid: `u-${state.nextUid++}`, cardId }; state.shop.offers = [result]; return result.uid; }
function store() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
function failsAtomically(state, action) { const before = copy(state); assert.equal(action().ok, false); assert.deepEqual(state, before); }

test('five ordinary copies cost 15 gold and evolve once per purchase, with one initial free reward', () => {
  const state = createRun({ seed: 701 }); state.player.gold = 15;
  for (let index = 0; index < 2; index++) { assert(buy(state, offer(state, 6)).ok); assert(moveUnit(state, state.player.bench.at(-1).uid, 'board', index).ok); }
  const firstUid = state.player.board[0].uid, materials = state.player.board.map(unit => unit.uid);
  const gold = buy(state, offer(state, 6)); assert(gold.ok);
  const card = state.player.board[0], evolution = gold.timeline[0].evolution;
  assert.notEqual(card.uid, firstUid); assert.equal(card.evolution, 1); assert.equal(card.attack, 6); assert.equal(card.hp, 4);
  assert.equal(evolution.from, 0); assert.equal(evolution.to, 1); assert(materials.every(id => evolution.consumedUids.includes(id))); assert.equal(evolution.consumedUids.length, 3);
  assert.deepEqual(evolution.before, { attack: 3, hp: 2, maxHp: 2 }); assert.deepEqual(evolution.after, { attack: 6, hp: 4, maxHp: 4 });
  assert(state.pendingReward); const storage = store(); assert(saveRun(state, storage).ok);
  assert.deepEqual(loadRun(storage).state, state); const rewardId = state.pendingReward.choices[0]; assert(chooseTripleReward(state, rewardId).ok);
  failsAtomically(state, () => chooseTripleReward(state, rewardId));
  for (const rank of [2, 3]) {
    const purchaseUid = offer(state, 6), result = buy(state, purchaseUid); assert(result.ok);
    const evolved = state.player.board[0]; assert.equal(evolved.uid, card.uid); assert.equal(evolved.evolution, rank);
    assert.equal(evolved.attack, 3 * (rank + 1)); assert.equal(evolved.hp, 2 * (rank + 1)); assert.equal(state.pendingReward, null);
    assert.equal(result.timeline[0].evolution.consumedUids.length, 1); assert.equal(result.timeline[0].evolution.to, rank);
    assert.equal(state.phase, 'recruit'); assert.equal(state.combat, null); assert(saveRun(state, storage).ok); assert.deepEqual(loadRun(storage).state, state);
    failsAtomically(state, () => buy(state, purchaseUid));
  }
  assert.equal(state.player.gold, 0); assert.equal(held(state).filter(unit => unit.cardId === 6).length, 1); assert(validateRun(state).ok);
});

test('evolution remains legal at every board and hand capacity and keeps its existing slot and UID', () => {
  let checked = 0;
  for (let boards = 0; boards <= 5; boards++) for (let hands = 0; hands <= 3; hands++) for (const zone of ['board', 'bench']) for (const rank of [1, 2]) {
    if (!(zone === 'board' ? boards : hands)) continue;
    const state = createRun({ seed: 702 }); state.player.board = Array.from({ length: boards }, () => unit(state, 5)); state.player.bench = Array.from({ length: hands }, () => unit(state, 9));
    const slot = state.player[zone].length - 1, target = unit(state, 6, rank); state.player[zone][slot] = target;
    const beforeCount = held(state).length; assert(canReceiveUnit(state, 6)); assert(buy(state, offer(state, 6)).ok);
    assert.equal(held(state).length, beforeCount); assert.equal(state.player[zone][slot].uid, target.uid); assert.equal(state.player[zone][slot].evolution, rank + 1);
    assert.equal(state.pendingReward, null); assert(validateRun(state).ok); checked++;
  }
  assert.equal(checked, 76);
});

test('legendary cards never eat extra copies; ordinary copies can form a second golden card', () => {
  const state = createRun({ seed: 703 }); state.player.gold = 15;
  const legendary = unit(state, 6, 3); state.player.board = [legendary];
  assert.equal(getEvolutionOffer(state, 6), null);
  for (let n = 0; n < 2; n++) { assert(buy(state, offer(state, 6)).ok); assert.equal(state.player.bench.length, n + 1); assert.deepEqual(state.player.board[0], legendary); }
  assert(buy(state, offer(state, 6)).ok); assert.equal(state.player.bench.length, 1); assert.equal(state.player.bench[0].evolution, 1); assert(state.pendingReward);
  assert.deepEqual(state.player.board[0], legendary); assert(chooseTripleReward(state, state.pendingReward.choices[0]).ok);
  state.player.bench.push(unit(state, 9)); assert.equal(state.player.bench.length, 3); assert(buy(state, offer(state, 6)).ok);
  assert.equal(state.player.bench[0].evolution, 2); assert.equal(state.player.bench.length, 3); assert.deepEqual(state.player.board[0], legendary);
  const full = createRun({ seed: 704 }); full.player.board = [legendary, ...[3, 4, 5, 7].map(id => unit(full, id))]; full.player.board[0] = unit(full, 6, 3); full.player.bench = [8, 9, 10].map(id => unit(full, id));
  assert.equal(canReceiveUnit(full, 6), false); const unavailable = offer(full, 6); failsAtomically(full, () => buy(full, unavailable));
});

test('multiple eligible copies use the highest evolution then stable board order, without multiplying existing bonuses', () => {
  const state = createRun({ seed: 705 }); state.player.gold = 9;
  state.player.board = [unit(state, 6, 1), unit(state, 6, 2, { attack: 11, hp: 9, maxHp: 9 }), unit(state, 6, 2)];
  const selected = state.player.board[1].uid, others = copy([state.player.board[0], state.player.board[2]]);
  assert.equal(getEvolutionOffer(state, 6).targetUid, selected); assert(buy(state, offer(state, 6)).ok);
  assert.equal(state.player.board[1].uid, selected); assert.equal(state.player.board[1].attack, 14); assert.equal(state.player.board[1].hp, 11);
  assert.deepEqual([state.player.board[0], state.player.board[2]], others); assert.equal(getEvolutionOffer(state, 6).targetUid, state.player.board[2].uid);
  assert(buy(state, offer(state, 6)).ok); assert.equal(getEvolutionOffer(state, 6).targetUid, state.player.board[0].uid);
  const capped = createRun({ seed: 706 }); capped.player.board = [unit(capped, 6, 2, { attack: 10000 })]; const id = offer(capped, 6); failsAtomically(capped, () => buy(capped, id));
});

test('v1 and v2 golden saves remain playable, while malformed evolution values are rejected', () => {
  for (const version of [1, 2]) {
    const state = createRun({ seed: 707 }); state.player.board = [unit(state, 6, 1)]; delete state.player.board[0].evolution;
    if (version === 1) { state.schemaVersion = 1; delete state.player.xp; delete state.encounters; }
    const storage = store(); storage.setItem(STORAGE_KEY, JSON.stringify({ version, savedAt: 0, state }));
    const restored = loadRun(storage); assert.equal(restored.status, 'restored'); assert.equal(getEvolution(restored.state.player.board[0]), 1);
    assert(buy(restored.state, offer(restored.state, 6)).ok); assert.equal(restored.state.player.board[0].evolution, 2); assert.equal(restored.state.player.board[0].attack, 9); assert(validateRun(restored.state).ok);
  }
  for (const evolution of [-1, 4, 1.5, null, '2', NaN]) {
    const state = createRun({ seed: 708 }); state.player.board = [unit(state, 6, 1, { evolution })]; assert.equal(validateRun(state).ok, false); assert.equal(saveRun(state, store()).ok, false);
  }
  for (const [evolution, golden] of [[0, true], [1, false], [2, false], [3, false]]) {
    const state = createRun({ seed: 709 }); state.player.board = [unit(state, 6, evolution, { golden })]; assert.equal(validateRun(state).ok, false);
  }
});

test('upgraded skills and summon stats scale on both sides without changing permanent cards', () => {
  for (const side of ['player', 'enemy']) for (const rank of [1, 2, 3]) {
    const state = createRun({ seed: 710 }); state.player.board = [unit(state, 9, 0, { hp: 50, maxHp: 50 })]; state.opponent.board = [unit(state, 9, 0, { hp: 50, maxHp: 50 })];
    const list = side === 'player' ? state.player : state.opponent; list.board = [unit(state, 3, rank)]; const persistent = copy(list.board);
    const result = startCombat(state); const buff = result.timeline.find(step => step.type === 'buff' && step.actor?.uid === persistent[0].uid);
    assert(buff); assert.equal(buff.changes.find(change => change.field === 'maxHp').amount, 2 * (rank + 1)); assert.deepEqual(list.board, persistent);
    assert(validateRun(state).ok);
    const summons = createRun({ seed: 711 }); summons.player.board = [unit(summons, 13, rank)]; summons.opponent.board = [unit(summons, 9, 0, { attack: 100, hp: 100, maxHp: 100 })];
    const summon = startCombat(summons).timeline.find(step => step.type === 'summon'); assert(summon);
    const puppet = summon.snapshot.combat.player.find(unit => unit.cardId === 101); assert.equal(puppet.evolution, rank); assert.equal(puppet.attack, 2 * (rank + 1)); assert.equal(puppet.maxHp, 2 * (rank + 1));
    assert(!held(summons).some(unit => unit.cardId === 101)); assert.equal(canReceiveUnit(summons, 101), false); assert.equal(canReceiveUnit(summons, 201), false);
  }
});

test('legendary shields, double attacks, traits and sale price retain their original counts', () => {
  const state = createRun({ seed: 712 }); state.player.board = [unit(state, 19, 3), unit(state, 18, 3)]; state.opponent.board = [unit(state, 9, 0, { hp: 100, maxHp: 100 })];
  const shielded = state.player.board[0]; assert.equal(shielded.shield, 1); const result = startCombat(state);
  assert.equal(result.timeline.filter(step => step.type === 'shield' && step.blocked && step.target?.uid === shielded.uid).length, 1);
  const attackers = result.timeline.filter(step => step.type === 'attack').map(step => step.actor.uid), double = state.player.board[1].uid;
  let longest = 0, streak = 0; for (const id of attackers) { streak = id === double ? streak + 1 : 0; longest = Math.max(longest, streak); } assert(longest <= 2);
  const sale = createRun({ seed: 713 }); sale.player.board = [unit(sale, 3, 3), unit(sale, 3, 2), unit(sale, 4, 3)];
  assert.equal(getSynergies(sale.player.board).find(trait => trait.id === 'city').count, 2); const gold = sale.player.gold;
  assert(sell(sale, sale.player.board[0].uid).ok); assert.equal(sale.player.gold, gold + 1); assert.equal(getEvolutionMultiplier({ golden: true }), 2);
});

test('a free reward may evolve a matching golden card once even with a full hand', () => {
  const state = createRun({ seed: 714 }); state.player.board = [unit(state, 11, 1), ...[3, 5, 6, 7].map(id => unit(state, id))]; state.player.bench = [8, 9, 10].map(id => unit(state, id)); state.pendingReward = { choices: [11, 12, 13] };
  const beforeGold = state.player.gold; assert(chooseTripleReward(state, 11).ok); assert.equal(state.player.board[0].evolution, 2); assert.equal(state.pendingReward, null); assert.equal(state.player.gold, beforeGold); assert(validateRun(state).ok);
  failsAtomically(state, () => chooseTripleReward(state, 11));
});
