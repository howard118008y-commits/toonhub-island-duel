import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, ROSTER, getCharacter } from '../public/game/src/roster.js';
import { ENCOUNTER_CARDS } from '../public/game/src/encounters.js';
import { characterVoice } from '../public/game/src/voices.js';
import { createRun, startCombat, nextRound, startEncounter, getEncounterOffer, getSquadLevel, resumeRecruitment, validateRun, buy, sell, chooseTripleReward, refreshShop } from '../public/game/src/autobattler.js';
import { saveRun, loadRun, STORAGE_KEY } from '../public/game/src/storage.js';
const copy = value => structuredClone(value);
function unit(state, attack = 100, hp = 100, cardId = 9) {
  return { uid: `u-${state.nextUid++}`, cardId, attack, hp, maxHp: hp, golden: false, shield: 0 };
}
function atRound(round, seed = 40) {
  const state = createRun({ seed }); state.player.board = [unit(state)];
  while (state.round < round) { assert(startCombat(state, { recordTimeline: false }).ok); assert(nextRound(state).ok); }
  assert(validateRun(state).ok); return state;
}
function unchanged(state, action) { const before = copy(state); const result = action(); assert.equal(result.ok, false); assert.deepEqual(state, before); assert.deepEqual(result.timeline, []); }
function storage() { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
function legacy(state) {
  const old = copy(state); old.schemaVersion = 1; delete old.encounters; delete old.player.xp;
  if (old.result) delete old.result.kind;
  if (old.combat) { delete old.combat.kind; delete old.combat.opponentName; }
  return old;
}

test('three monsters have display metadata and voices but never join the 24-character pool', () => {
  assert.equal(ROSTER.length, 24); assert.deepEqual(ENCOUNTER_CARDS.map(card => card.id), [201, 202, 203]);
  for (const monster of ENCOUNTER_CARDS) {
    assert.equal(getCharacter(monster.id), monster); assert.equal(monster.kind, 'monster'); assert.equal(monster.faction, null);
    assert.equal(monster.art, `monster-${monster.id}.webp`);
    for (const kind of ['summon', 'attack', 'hurt', 'defend']) assert.equal(characterVoice(monster.id, kind), monster.voices[kind]);
    const state = createRun({ seed: 90 }); state.shop.offers = [{ uid: `u-${state.nextUid++}`, cardId: monster.id }];
    unchanged(state, () => buy(state, state.shop.offers[0].uid)); assert.equal(validateRun(state).ok, false);
    const reward = createRun({ seed: 91 }); reward.pendingReward = { choices: [monster.id, 7, 8] };
    unchanged(reward, () => chooseTripleReward(reward, monster.id));
    const owned = createRun({ seed: 92 }); owned.player.bench = [unit(owned, monster.attack, monster.health, monster.id)];
    unchanged(owned, () => sell(owned, owned.player.bench[0].uid)); assert.equal(saveRun(owned, storage()).ok, false);
  }
  const state = atRound(9); state.player.tier = 4; state.player.upgradeCost = 0;
  for (let index = 0; index < 40; index++) { state.player.gold = 10; assert(refreshShop(state).ok); assert(state.shop.offers.every(offer => ROSTER.some(card => card.id === offer.cardId))); }
});

test('only rounds 3, 6 and 9 offer one encounter; invalid attempts stay atomic', () => {
  for (let round = 1; round <= 10; round++) {
    const state = atRound(round); const offer = getEncounterOffer(state);
    assert.equal(Boolean(offer), [3, 6, 9].includes(round));
    if (!offer) unchanged(state, () => startEncounter(state));
    else {
      const before = copy(state); state.player.board = [];
      unchanged(state, () => startEncounter(state)); Object.assign(state, before);
      state.pendingReward = { choices: [7, 8, 9] }; unchanged(state, () => startEncounter(state));
    }
  }
});

test('winning saves one gold and XP before animation, reload and repeated actions cannot claim again', () => {
  const state = atRound(3); state.player.gold = 10; state.shop.frozen = true;
  const before = copy(state), store = storage();
  const result = startEncounter(state);
  assert(result.ok); assert.equal(state.round, 3); assert.equal(state.phase, 'result'); assert.equal(state.result.kind, 'encounter');
  assert.equal(state.result.outcome, 'win'); assert.deepEqual(state.result.reward, { gold: 1, xp: 1 });
  assert.equal(state.player.gold, 11); assert.equal(state.player.xp, 1); assert.equal(state.player.hp, before.player.hp);
  assert.deepEqual(state.encounters, [{ round: 3, outcome: 'win' }]); assert.equal(getEncounterOffer(state), null);
  assert.deepEqual(state.player.board, before.player.board); assert.deepEqual(state.shop, before.shop); assert.deepEqual(state.opponent, before.opponent);
  assert.equal(result.timeline[0].snapshot.combat.kind, 'encounter'); assert(result.timeline[0].snapshot.combat.enemy.every(enemy => enemy.cardId >= 201));
  assert.equal(result.timeline.at(-1).snapshot.player.gold, 11); assert.equal(result.timeline.at(-1).snapshot.player.xp, 1);
  assert(saveRun(state, store).ok); const restored = loadRun(store).state;
  unchanged(restored, () => startEncounter(restored)); unchanged(restored, () => nextRound(restored));
  assert(resumeRecruitment(restored).ok); assert.equal(restored.phase, 'recruit'); assert.equal(restored.round, 3);
  for (const key of ['income', 'upgradeCost', 'tier', 'hp']) assert.equal(restored.player[key], before.player[key]);
  assert.equal(restored.rngState, before.rngState); assert.deepEqual(restored.shop, before.shop); assert.deepEqual(restored.opponent, before.opponent);
  unchanged(restored, () => resumeRecruitment(restored)); unchanged(restored, () => startEncounter(restored));
  assert(saveRun(restored, store).ok); const reloaded = loadRun(store).state;
  assert.equal(reloaded.player.gold, 11); assert.equal(reloaded.player.xp, 1); unchanged(reloaded, () => startEncounter(reloaded));
  assert(startCombat(reloaded).ok); assert.equal(reloaded.result.kind, 'round'); assert(nextRound(reloaded).ok);
  assert.equal(reloaded.round, 4); assert.equal(reloaded.player.gold, 6); assert.equal(reloaded.player.xp, 1);
});

test('loss, lethal loss and draw consume the opportunity without XP or gold', () => {
  for (const hp of [24, 1]) {
    const state = atRound(3); state.player.board = [unit(state, 1, 1)]; state.player.hp = hp;
    const gold = state.player.gold; const battle = startEncounter(state); assert(battle.ok);
    assert.equal(state.result.outcome, 'loss'); assert.equal(state.result.damage, Math.min(hp, 2));
    assert.equal(state.player.hp, Math.max(0, hp - 2)); assert.equal(state.player.gold, gold); assert.equal(state.player.xp, 0);
    assert.equal(state.phase, hp === 1 ? 'gameover' : 'result'); assert(validateRun(state).ok);
    assert.equal(battle.timeline.filter(step => step.type === 'damage' && step.target?.kind === 'hero')[0].changes[0].amount, -Math.min(hp, 2));
    if (hp === 1) { assert.equal(state.winner, 'enemy'); unchanged(state, () => resumeRecruitment(state)); }
    else { assert(resumeRecruitment(state).ok); unchanged(state, () => startEncounter(state)); }
  }
  const draw = atRound(3); draw.player.board = [unit(draw, 4, 2), unit(draw, 4, 2)];
  assert(startEncounter(draw).ok); assert.equal(draw.result.outcome, 'draw'); assert.equal(draw.player.hp, 24); assert.equal(draw.player.xp, 0);
  assert.deepEqual(draw.encounters, [{ round: 3, outcome: 'draw' }]); assert(resumeRecruitment(draw).ok); unchanged(draw, () => startEncounter(draw));
});

test('normal combat skips an optional encounter, keeps ten-round victory, and new runs reset progression', () => {
  const state = atRound(3); assert(startCombat(state).ok); assert.deepEqual(state.encounters, [{ round: 3, outcome: 'skipped' }]);
  unchanged(state, () => resumeRecruitment(state)); assert(nextRound(state).ok); assert.equal(getEncounterOffer(state), null);
  const final = atRound(10); assert.equal(getEncounterOffer(final), null); assert(startCombat(final).ok);
  assert.equal(final.phase, 'gameover'); assert.equal(final.winner, 'player'); assert.equal(final.result.kind, 'round');
  const fresh = createRun({ seed: 3 }); assert.equal(fresh.player.xp, 0); assert.deepEqual(fresh.encounters, []); assert.equal(getSquadLevel(fresh.player.xp), 1);
});

test('squad levels buff only the first combat copy once and never change permanent card values', () => {
  assert.deepEqual([0, 1, 2, 3].map(getSquadLevel), [1, 1, 2, 3]);
  const state = atRound(9); state.encounters = [{ round: 3, outcome: 'win' }, { round: 6, outcome: 'win' }]; state.player.xp = 2;
  state.player.board = [unit(state), unit(state)]; const owned = copy(state.player.board);
  const encounter = startEncounter(state); const levelTwo = encounter.timeline.find(step => step.type === 'buff');
  assert.equal(levelTwo.snapshot.combat.player[0].maxHp, 101); assert.equal(levelTwo.snapshot.combat.player[0].attack, 100);
  assert.equal(levelTwo.snapshot.combat.player[1].maxHp, 100); assert.deepEqual(state.player.board, owned); assert.equal(state.player.xp, 3);
  assert(resumeRecruitment(state).ok); const combat = startCombat(state); const levelThree = combat.timeline.find(step => step.type === 'buff');
  assert.equal(levelThree.snapshot.combat.player[0].maxHp, 101); assert.equal(levelThree.snapshot.combat.player[0].attack, 101);
  assert.equal(levelThree.snapshot.combat.player[1].attack, 100); assert.deepEqual(state.player.board, owned);
  assert(nextRound(state).ok); const again = startCombat(state).timeline.find(step => step.type === 'buff');
  assert.equal(again.snapshot.combat.player[0].maxHp, 101); assert.equal(again.snapshot.combat.player[0].attack, 101);
});

test('v1 recruitment, result and gameover saves migrate in place without retroactive rewards', () => {
  for (const phase of ['recruit', 'result', 'gameover']) {
    const state = atRound(phase === 'gameover' ? 10 : 6);
    if (phase !== 'recruit') assert(startCombat(state).ok);
    const old = legacy(state), store = storage(); store.setItem(STORAGE_KEY, JSON.stringify({ version: 1, savedAt: 1, state: old }));
    const loaded = loadRun(store); assert.equal(loaded.status, 'restored'); const migrated = loaded.state;
    assert.equal(migrated.schemaVersion, CONFIG.version); assert.equal(migrated.player.xp, 0);
    for (const key of ['round', 'phase', 'seed', 'rngState', 'opponent', 'shop']) assert.deepEqual(migrated[key], old[key]);
    const { xp, ...player } = migrated.player; assert.deepEqual(player, old.player);
    assert.deepEqual(migrated.encounters.map(entry => entry.round), phase === 'recruit' ? [3] : phase === 'result' ? [3, 6] : [3, 6, 9]);
    assert(migrated.encounters.every(entry => entry.outcome === 'skipped')); assert(validateRun(migrated).ok);
    if (phase === 'recruit') assert(getEncounterOffer(migrated));
    assert(saveRun(migrated, store).ok); assert.equal(JSON.parse(store.getItem(STORAGE_KEY)).version, 2); assert.deepEqual(loadRun(store).state, migrated);
  }
});

test('corrupted encounter ledgers, rewards and monster placement are rejected on restore', () => {
  const state = atRound(3); assert(startEncounter(state).ok);
  for (const mutate of [
    value => value.player.xp++, value => value.encounters.push({ round: 3, outcome: 'win' }),
    value => value.encounters[0].round = 4, value => value.encounters[0].outcome = 'skipped',
    value => value.result.reward.gold = 2, value => value.result.kind = 'round',
    value => value.player.board[0].cardId = 201, value => value.opponent.board[0].cardId = 201,
    value => value.combat.player[0].cardId = 201,
  ]) {
    const corrupted = copy(state); mutate(corrupted); assert.equal(validateRun(corrupted).ok, false);
    const store = storage(); store.setItem(STORAGE_KEY, JSON.stringify({ version: 2, savedAt: 1, state: corrupted })); assert.equal(loadRun(store).status, 'invalid');
  }
});
