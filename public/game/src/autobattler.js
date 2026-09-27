import { CONFIG, ROSTER, TRAITS, EVOLUTIONS, getCharacter, getEvolution, getEvolutionMultiplier } from './roster.js';
import { ENCOUNTER_ROUNDS, getEncounterCard, getEncounterDefinition } from './encounters.js';

const contexts = new WeakMap();
const other = side => side === 'player' ? 'enemy' : 'player';
const clone = value => structuredClone(value);
class RuleError extends Error {}
const requireRule = (condition, message) => { if (!condition) throw new RuleError(message); };
const uid = state => `u-${state.nextUid++}`;
const name = unit => getCharacter(unit.cardId).region;
const clampHp = value => Math.max(0, value);
function random(holder, key = 'rngState') {
  holder[key] = (holder[key] + 0x6D2B79F5) >>> 0;
  let value = holder[key];
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
const roundSeed = (seed, round, salt) => (Math.imul(seed ^ salt, 1664525) + Math.imul(round, 1013904223)) >>> 0;
const pick = (values, holder, key) => values[Math.floor(random(holder, key) * values.length)];
function entity(state, side, unit = null, zone = 'board') {
  if (!unit) return { side, kind: 'hero' };
  const list = zone === 'shop' ? state.shop.offers : state.phase === 'combat' ? state.combat[side] : side === 'enemy' ? state.opponent.board : state.player[zone];
  return { side, kind: 'card', uid: unit.uid, cardId: unit.cardId, slot: list.indexOf(unit), zone };
}
function note(state, text) {
  state.log.push(text);
  if (state.log.length > CONFIG.maxLog) state.log.shift();
  contexts.get(state)?.events.push(text);
}
function emit(state, type, side = 'player', details = {}) {
  const context = contexts.get(state);
  if (!context?.record) return;
  context.timeline.push({ seq: context.timeline.length + 1, type, side, changes: [], ...details, snapshot: clone(state) });
}
function delta(target, object, field, value) {
  const before = field === 'hp' ? clampHp(object[field]) : object[field];
  object[field] = field === 'hp' ? clampHp(value) : value;
  const after = object[field];
  return { target, field, before, after, amount: after - before };
}
function action(state, phases, run, record = true) {
  if (!phases.includes(state.phase)) return { ok: false, message: '目前階段無法進行這個操作。', events: [], timeline: [] };
  const before = clone(state);
  const context = { events: [], timeline: [], record };
  contexts.set(state, context);
  try {
    run();
    if (context.timeline.length) context.timeline.at(-1).snapshot = clone(state);
    return { ok: true, message: context.events.at(-1) || '操作完成。', events: context.events, timeline: context.timeline };
  } catch (error) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, before);
    if (!(error instanceof RuleError)) throw error;
    return { ok: false, message: error.message, events: [], timeline: [] };
  } finally { contexts.delete(state); }
}
function recruitAction(state, run, allowReward = false) {
  return action(state, ['recruit'], () => {
    requireRule(allowReward || !state.pendingReward, '請先選擇三合一獎勵。');
    run();
  });
}
function makeUnit(state, cardId, evolution = 0, fixedUid) {
  const card = getCharacter(cardId);
  const factor = EVOLUTIONS[evolution].multiplier;
  return { uid: fixedUid || uid(state), cardId, evolution, golden: evolution > 0, attack: card.attack * factor, hp: card.health * factor, maxHp: card.health * factor, shield: card.keywords.includes('shield') ? 1 : 0 };
}
export function getSynergies(units) {
  return TRAITS.map(trait => {
    const count = new Set(units.filter(unit => getCharacter(unit.cardId)?.faction === trait.id).map(unit => unit.cardId)).size;
    return { ...trait, count, level: count >= 4 ? 4 : count >= 2 ? 2 : 0 };
  });
}
function rollOffer(state) {
  const weights = CONFIG.shopWeights[state.player.tier - 1];
  const roll = random(state);
  let cumulative = 0;
  const tier = weights.findIndex(weight => (cumulative += weight) > roll) + 1;
  return { uid: uid(state), cardId: pick(ROSTER.filter(card => card.tier === tier), state).id };
}
function fillShop(state, preserve = false) {
  if (!preserve) state.shop.offers = [];
  while (state.shop.offers.length < CONFIG.shopSizes[state.player.tier - 1]) state.shop.offers.push(rollOffer(state));
  state.shop.frozen = false;
}
function makeOpponent(state) {
  const source = { rngState: roundSeed(state.seed, state.round, 0xA13F) };
  const focus = pick(TRAITS, source).id;
  const used = new Set();
  const bonus = CONFIG.enemyBonuses[state.round - 1];
  const board = CONFIG.enemyTiers[state.round - 1].map((tier, index) => {
    const pool = ROSTER.filter(card => card.tier === tier && !used.has(card.id));
    const focused = pool.filter(card => card.faction === focus);
    const card = pick(focused.length && random(source) < 0.65 ? focused : pool, source);
    used.add(card.id);
    const unit = makeUnit(state, card.id, 0, `enemy-${state.round}-${index}`);
    unit.attack += bonus;
    unit.hp += bonus;
    unit.maxHp += bonus;
    return unit;
  });
  return { name: state.round === CONFIG.rounds ? '全島壓軸聯隊' : `${TRAITS.find(trait => trait.id === focus).name}挑戰隊`, round: state.round, tier: Math.min(4, 1 + Math.floor((state.round - 1) / 3)), board };
}
export function createRun({ seed = Date.now() >>> 0 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error('種子必須是有效的非負整數。');
  const state = {
    schemaVersion: CONFIG.version, seed, rngState: seed, nextUid: 1, round: 1, phase: 'recruit', winner: null,
    player: { hp: CONFIG.heroHealth, maxHp: CONFIG.heroHealth, gold: 3, income: 3, tier: 1, xp: 0, upgradeCost: CONFIG.upgradeCosts[0], board: [], bench: [] },
    shop: { offers: [], frozen: false }, opponent: null, combat: null, result: null, pendingReward: null, encounters: [], log: [],
  };
  fillShop(state);
  state.opponent = makeOpponent(state);
  note(state, '第 1 輪招募：角色先進備戰區，手動上場、調整站位，再準備開戰。');
  return state;
}
function spend(state, amount) {
  requireRule(state.player.gold >= amount, '金幣不足。');
  return delta(entity(state, 'player'), state.player, 'gold', state.player.gold - amount);
}
const owned = state => [...state.player.board, ...state.player.bench];
export function getEvolutionOffer(state, cardId) {
  if (!ROSTER.some(card => card.id === cardId)) return null;
  const matches = owned(state).filter(unit => unit.cardId === cardId);
  const target = matches.filter(unit => getEvolution(unit) > 0 && getEvolution(unit) < 3).sort((a, b) => getEvolution(b) - getEvolution(a))[0];
  if (target) return { from: getEvolution(target), to: getEvolution(target) + 1, targetUid: target.uid, materialUids: [] };
  const ordinary = matches.filter(unit => getEvolution(unit) === 0);
  return ordinary.length >= 2 ? { from: 0, to: 1, targetUid: ordinary[0].uid, materialUids: ordinary.slice(0, 2).map(unit => unit.uid) } : null;
}
function mergeEvolution(state, incoming, evolution, changes) {
  if (!evolution) return;
  const { cardId } = incoming;
  const first = owned(state).find(unit => unit.uid === evolution.targetUid);
  const merging = evolution.from ? [first, incoming] : [...owned(state).filter(unit => evolution.materialUids.includes(unit.uid)), incoming];
  const zone = state.player.board.includes(first) ? 'board' : 'bench';
  const index = state.player[zone].indexOf(first);
  const card = getCharacter(cardId);
  const before = { attack: first.attack, hp: first.hp, maxHp: first.maxHp };
  const bonusAttack = merging.reduce((sum, unit) => sum + unit.attack - card.attack * getEvolutionMultiplier(unit), 0);
  const bonusHealth = merging.reduce((sum, unit) => sum + unit.maxHp - card.health * getEvolutionMultiplier(unit), 0);
  const evolved = makeUnit(state, cardId, evolution.to, evolution.from ? first.uid : undefined);
  evolved.attack += bonusAttack;
  evolved.hp += bonusHealth;
  evolved.maxHp += bonusHealth;
  requireRule(evolved.attack > 0 && evolved.attack <= 10000 && evolved.hp > 0 && evolved.hp <= 10000, '角色數值已達上限，無法進化。');
  const ids = new Set(merging.map(unit => unit.uid));
  for (const key of ['board', 'bench']) state.player[key] = state.player[key].filter(unit => !ids.has(unit.uid));
  state.player[zone].splice(Math.min(index, state.player[zone].length), 0, evolved);
  if (evolution.to === 1) {
    const pool = ROSTER.filter(card => card.tier === Math.min(4, state.player.tier + 1));
    const choices = [];
    while (choices.length < 3) {
      const card = pick(pool.filter(card => !choices.includes(card.id)), state);
      choices.push(card.id);
    }
    state.pendingReward = { choices };
  }
  note(state, evolution.to === 1 ? `${card.region}三合一升金！選擇一位免費援軍。` : `${card.region}進化為${EVOLUTIONS[evolution.to].name}！攻血與技能數值提升至${EVOLUTIONS[evolution.to].multiplier}倍。`);
  emit(state, 'triple', 'player', { actor: entity(state, 'player', evolved, zone), target: entity(state, 'player', evolved, zone), changes,
    evolution: { from: evolution.from, to: evolution.to, consumedUids: [...ids].filter(id => id !== evolved.uid), before, after: { attack: evolved.attack, hp: evolved.hp, maxHp: evolved.maxHp } } });
  return { unit: evolved, zone, merged: true };
}
export function canReceiveUnit(state, cardId) {
  return ROSTER.some(card => card.id === cardId) && (state.player.bench.length < CONFIG.benchSize || Boolean(getEvolutionOffer(state, cardId)));
}
function addOwned(state, cardId, changes = []) {
  requireRule(ROSTER.some(card => card.id === cardId), '小怪無法招募或加入隊伍。');
  requireRule(canReceiveUnit(state, cardId), '手牌已滿，請先上場、出售角色，或招募可合成進化的角色。');
  const evolution = getEvolutionOffer(state, cardId);
  const zone = 'bench';
  const unit = makeUnit(state, cardId);
  state.player[zone].push(unit);
  return mergeEvolution(state, unit, evolution, changes) || { unit, zone, merged: false };
}
export function buy(state, shopUid) {
  return recruitAction(state, () => {
    const index = state.shop.offers.findIndex(offer => offer.uid === shopUid);
    requireRule(index >= 0, '這位角色已不在商店。');
    const offer = state.shop.offers[index];
    const change = spend(state, CONFIG.buyCost);
    state.shop.offers.splice(index, 1);
    const { unit, zone, merged } = addOwned(state, offer.cardId, [change]);
    note(state, `花 ${CONFIG.buyCost} 金幣招募${name(unit)}。`);
    if (!merged) emit(state, 'buy', 'player', { target: entity(state, 'player', unit, zone), changes: [change] });
  });
}
export function sell(state, unitUid) {
  return recruitAction(state, () => {
    const zone = ['board', 'bench'].find(key => state.player[key].some(unit => unit.uid === unitUid));
    requireRule(zone, '找不到這位角色。');
    const index = state.player[zone].findIndex(unit => unit.uid === unitUid);
    const unit = state.player[zone][index];
    requireRule(ROSTER.some(card => card.id === unit.cardId), '小怪無法出售。');
    const target = entity(state, 'player', unit, zone);
    state.player[zone].splice(index, 1);
    const change = delta(entity(state, 'player'), state.player, 'gold', state.player.gold + CONFIG.sellValue);
    note(state, `出售${name(unit)}，獲得 ${CONFIG.sellValue} 金幣。`);
    emit(state, 'sell', 'player', { target, changes: [change] });
  }, true);
}
export function refreshShop(state) {
  return recruitAction(state, () => {
    const change = spend(state, CONFIG.refreshCost);
    fillShop(state);
    note(state, '商店已刷新。');
    emit(state, 'shop', 'player', { changes: [change] });
  });
}
export function toggleFreeze(state) {
  return recruitAction(state, () => {
    state.shop.frozen = !state.shop.frozen;
    note(state, state.shop.frozen ? '已凍結：保留剩下角色到下一輪。' : '已解除凍結。');
    emit(state, 'freeze');
  });
}
export function upgradeTavern(state) {
  return recruitAction(state, () => {
    requireRule(state.player.tier < 4, '商店已達最高階。');
    const change = spend(state, state.player.upgradeCost);
    const tier = delta(entity(state, 'player'), state.player, 'tier', state.player.tier + 1);
    state.player.upgradeCost = CONFIG.upgradeCosts[state.player.tier - 1] || 0;
    note(state, `商店升至 ${state.player.tier} 階；新角色會於刷新時出現。`);
    emit(state, 'upgrade', 'player', { changes: [change, tier] });
  });
}
export function moveUnit(state, unitUid, toZone, toIndex) {
  return recruitAction(state, () => {
    const fromZone = ['board', 'bench'].find(key => state.player[key].some(unit => unit.uid === unitUid));
    requireRule(fromZone && ['board', 'bench'].includes(toZone), '找不到有效的角色或席位。');
    const destination = state.player[toZone];
    const cap = toZone === 'board' ? CONFIG.boardSize : CONFIG.benchSize;
    requireRule(Number.isInteger(toIndex) && toIndex >= 0 && toIndex <= destination.length && (toIndex < cap || fromZone === toZone && toIndex === destination.length), '這個席位無法放置角色。');
    const source = state.player[fromZone];
    const fromIndex = source.findIndex(unit => unit.uid === unitUid);
    requireRule(fromZone !== toZone || fromIndex !== Math.min(toIndex, source.length - 1), '角色已在這個席位。');
    const unit = source[fromIndex];
    if (fromZone === toZone) { source.splice(fromIndex, 1); source.splice(Math.min(toIndex, source.length), 0, unit); }
    else if (destination[toIndex]) { source[fromIndex] = destination[toIndex]; destination[toIndex] = unit; }
    else { source.splice(fromIndex, 1); destination.push(unit); }
    note(state, `${name(unit)}已調整站位。`);
    emit(state, 'move', 'player', { target: entity(state, 'player', unit, toZone) });
  }, true);
}
export function chooseTripleReward(state, cardId) {
  return action(state, ['recruit'], () => {
    requireRule(state.pendingReward?.choices.includes(cardId), '請選擇列出的免費角色。');
    state.pendingReward = null;
    const { unit, zone, merged } = addOwned(state, cardId);
    note(state, `免費援軍${name(unit)}加入。`);
    if (!merged) emit(state, 'reward', 'player', { target: entity(state, 'player', unit, zone) });
  });
}

function combatBonus(state, side, targets, attack, health, actor) {
  const changes = [];
  for (const unit of targets.filter(unit => unit.hp > 0)) {
    const target = entity(state, side, unit);
    if (attack) changes.push(delta(target, unit, 'attack', unit.attack + attack));
    if (health) { changes.push(delta(target, unit, 'maxHp', unit.maxHp + health)); changes.push(delta(target, unit, 'hp', unit.hp + health)); }
  }
  if (changes.length) emit(state, 'buff', side, { actor, changes });
}
function giveShield(state, side, targets, actor) {
  const changes = targets.filter(unit => unit.hp > 0 && !unit.shield).map(unit => delta(entity(state, side, unit), unit, 'shield', 1));
  if (changes.length) emit(state, 'shield', side, { actor, target: changes[0].target, changes });
}
function damage(state, sourceSide, hits, actor) {
  const unblocked = [];
  for (const { side, unit, amount } of hits) {
    if (unit.hp <= 0 || amount <= 0) continue;
    const target = entity(state, side, unit);
    if (unit.shield) {
      const change = delta(target, unit, 'shield', 0);
      emit(state, 'shield', side, { actor, target, changes: [change], blocked: true });
    } else unblocked.push({ target, unit, amount });
  }
  // Resolve shields before applying the simultaneous HP batch, so every snapshot
  // contains only changes already announced by its event.
  const changes = unblocked.map(({ target, unit, amount }) => delta(target, unit, 'hp', unit.hp - amount));
  if (changes.length) emit(state, 'damage', sourceSide, { actor, target: changes[0].target, changes });
}
function healUnits(state, side, targets, amount, actor) {
  const changes = targets.filter(unit => unit.hp > 0 && unit.hp < unit.maxHp).map(unit => delta(entity(state, side, unit), unit, 'hp', Math.min(unit.maxHp, unit.hp + amount)));
  if (changes.length) emit(state, 'heal', side, { actor, changes });
}
const weakest = units => units.filter(unit => unit.hp > 0).reduce((best, unit) => !best || unit.hp < best.hp ? unit : best, null);
const adjacent = (units, unit) => { const index = units.indexOf(unit); return [units[index - 1], units[index + 1]].filter(Boolean); };
function clearDead(state) {
  // Remove all already-lethal units before any death effect can buff or heal survivors.
  for (let wave = 0; wave < 30; wave++) {
    const deaths = [];
    for (const side of ['player', 'enemy']) {
      for (const unit of [...state.combat[side]]) {
        if (unit.hp > 0) continue;
        const actor = entity(state, side, unit);
        const index = state.combat[side].indexOf(unit);
        state.combat[side].splice(index, 1);
        deaths.push({ side, unit, actor, index });
        emit(state, 'death', side, { target: actor });
      }
    }
    if (!deaths.length) return;
    for (const { side, unit, actor, index } of deaths) {
      const card = getCharacter(unit.cardId);
      const factor = getEvolutionMultiplier(unit);
      const allies = state.combat[side];
      const enemies = state.combat[other(side)];
      const traits = state.combat.traits[side];
      if (card.faction === 'folk' && traits.folk) combatBonus(state, side, allies, traits.folk, traits.folk, actor);
      if (traits.tide && !state.combat.tideUsed[side]) {
        state.combat.tideUsed[side] = true;
        damage(state, side, enemies.map(target => ({ side: other(side), unit: target, amount: traits.tide })), actor);
      }
      const amount = CONFIG.abilityValues[card.ability] * factor;
      if (card.ability === 'deathBuff' && allies.some(unit => unit.hp > 0)) combatBonus(state, side, [pick(allies.filter(unit => unit.hp > 0), state.combat)], amount, amount, actor);
      if (card.ability === 'deathBlast' || card.ability === 'deathWave') damage(state, side, enemies.map(target => ({ side: other(side), unit: target, amount })), actor);
      if (card.ability === 'deathThrow' && enemies.some(unit => unit.hp > 0)) damage(state, side, [{ side: other(side), unit: pick(enemies.filter(unit => unit.hp > 0), state.combat), amount }], actor);
      if (card.ability === 'puppet' && allies.length < CONFIG.boardSize) {
        const puppet = makeUnit(state, 101, getEvolution(unit));
        puppet.order = unit.order + 0.1;
        puppet.attacks = 0;
        allies.splice(Math.min(index, allies.length), 0, puppet);
        emit(state, 'summon', side, { actor: entity(state, side, puppet), target: entity(state, side, puppet) });
      }
    }
  }
}
function applyStart(state, side, unit) {
  if (unit.hp <= 0) return;
  const card = getCharacter(unit.cardId);
  const factor = getEvolutionMultiplier(unit);
  const allies = state.combat[side];
  const enemies = state.combat[other(side)];
  const actor = entity(state, side, unit);
  const amount = CONFIG.abilityValues[card.ability] * factor;
  switch (card.ability) {
    case 'guide': combatBonus(state, side, allies.slice(0, 1), 0, amount, actor); break;
    case 'buffAll': combatBonus(state, side, allies, amount, amount, actor); break;
    case 'shieldWeakest': giveShield(state, side, [weakest(allies)].filter(Boolean), actor); break;
    case 'adjacentAttack': combatBonus(state, side, adjacent(allies, unit), amount, 0, actor); break;
    case 'adjacentHealth': combatBonus(state, side, adjacent(allies, unit), 0, amount, actor); break;
    case 'adjacentShield': {
      const targets = adjacent(allies, unit);
      combatBonus(state, side, targets, 0, amount, actor); giveShield(state, side, targets, actor); break;
    }
    case 'weakestPing': {
      const target = weakest(enemies);
      if (target) damage(state, side, [{ side: other(side), unit: target, amount }], actor);
      break;
    }
    case 'startBlast': damage(state, side, enemies.map(target => ({ side: other(side), unit: target, amount })), actor); break;
  }
  clearDead(state);
}
function attackOnce(state, side, unit) {
  const enemies = state.combat[other(side)];
  if (!enemies.length || unit.hp <= 0) return;
  const guards = enemies.filter(target => getCharacter(target.cardId).keywords.includes('guard'));
  const target = pick(guards.length ? guards : enemies, state.combat);
  const neighbors = adjacent(enemies, target);
  const card = getCharacter(unit.cardId);
  const factor = getEvolutionMultiplier(unit);
  const amount = CONFIG.abilityValues[card.ability] * factor;
  const actor = entity(state, side, unit);
  const targetEntity = entity(state, other(side), target);
  if (card.ability === 'attackGrowth') combatBonus(state, side, [unit], amount, 0, actor);
  const first = !unit.attacks;
  let power = unit.attack + (first && card.ability === 'firstStrike' ? amount : 0);
  if (first && card.faction === 'transit') power += state.combat.traits[side].transit || 0;
  unit.attacks++;
  state.combat.attacks++;
  if (guards.length) emit(state, 'guard', side, { actor, target: targetEntity });
  emit(state, 'attack', side, { actor, target: targetEntity });
  // Capture both powers before either participant dies: retaliation is simultaneous.
  damage(state, side, [{ side: other(side), unit: target, amount: power }, { side, unit, amount: target.attack }], actor);
  if (card.ability === 'splash') damage(state, side, neighbors.map(target => ({ side: other(side), unit: target, amount })), actor);
  clearDead(state);
  if (unit.hp <= 0) return;
  if (card.ability === 'selfHeal') healUnits(state, side, [unit], amount, actor);
  if (card.ability === 'healWeakest') healUnits(state, side, [weakest(state.combat[side])].filter(Boolean), amount, actor);
  if (card.ability === 'healAll') healUnits(state, side, state.combat[side], amount, actor);
}
export const getSquadLevel = xp => xp >= 3 ? 3 : xp >= 2 ? 2 : 1;
export function getEncounterOffer(state) {
  const definition = getEncounterDefinition(state.round);
  if (state.phase !== 'recruit' || !definition || state.encounters.some(entry => entry.round === state.round)) return null;
  return { round: state.round, name: definition.name, tier: definition.tier, reward: { gold: 1, xp: 1 }, lossDamage: 2,
    board: definition.cards.map((cardId, index) => {
      const card = getEncounterCard(cardId);
      const hp = card.health + (definition.healthBonus || 0);
      return { uid: `encounter-${state.round}-${index}`, cardId, golden: false, attack: card.attack + (definition.attackBonus || 0), hp, maxHp: hp, shield: card.keywords.includes('shield') ? 1 : 0 };
    }) };
}
export function startCombat(state, { recordTimeline = true } = {}) {
  return resolveCombat(state, 'round', recordTimeline);
}
export function startEncounter(state, { recordTimeline = true } = {}) {
  return resolveCombat(state, 'encounter', recordTimeline);
}
function resolveCombat(state, kind, recordTimeline) {
  return action(state, ['recruit'], () => {
    requireRule(!state.pendingReward, '請先選擇三合一獎勵。');
    requireRule(state.player.board.length > 0, state.player.bench.length ? '請先從備戰區選一位角色，上場後再準備開戰。' : '請先招募一位角色，放上棋盤後再準備開戰。');
    const encounter = getEncounterOffer(state);
    requireRule(kind !== 'encounter' || encounter, '本輪沒有尚未完成的小怪委託。');
    const opponent = kind === 'encounter' ? encounter : state.opponent;
    if (kind === 'round' && encounter) state.encounters.push({ round: state.round, outcome: 'skipped' });
    const battleUnits = units => units.map((unit, order) => ({ ...clone(unit), hp: unit.maxHp, shield: getCharacter(unit.cardId).keywords.includes('shield') ? 1 : 0, order, attacks: 0 }));
    state.phase = 'combat';
    state.combat = { kind, opponentName: opponent.name, player: battleUnits(state.player.board), enemy: battleUnits(opponent.board), activeSide: 'player', attacks: 0, rngState: roundSeed(state.seed, state.round, kind === 'encounter' ? 0xEC0A : 0xBA771E), traits: {}, tideUsed: { player: false, enemy: false } };
    for (const side of ['player', 'enemy']) {
      state.combat.traits[side] = Object.fromEntries(getSynergies(state.combat[side]).map(trait => [trait.id, trait.level ? CONFIG.traitValues[trait.id][trait.level === 4 ? 1 : 0] : 0]));
    }
    note(state, kind === 'encounter' ? `小怪委託：${opponent.name}。` : `第 ${state.round} 輪自動戰鬥開始。`);
    emit(state, 'phase');
    const squadLevel = getSquadLevel(state.player.xp);
    if (squadLevel >= 2) combatBonus(state, 'player', [state.combat.player[0]], squadLevel >= 3 ? 1 : 0, 1);
    const firstSide = state.combat.player.length === state.combat.enemy.length ? (random(state.combat) < 0.5 ? 'player' : 'enemy') : state.combat.player.length > state.combat.enemy.length ? 'player' : 'enemy';
    for (const side of ['player', 'enemy']) {
      const units = state.combat[side];
      for (const unit of units) {
        const faction = getCharacter(unit.cardId).faction;
        if (faction === 'forge') combatBonus(state, side, [unit], state.combat.traits[side].forge, 0);
        if (faction === 'forest') combatBonus(state, side, [unit], 0, state.combat.traits[side].forest);
      }
      const city = units.filter(unit => getCharacter(unit.cardId).faction === 'city');
      giveShield(state, side, state.combat.traits[side].city === CONFIG.traitValues.city[1] ? city : city.slice(0, state.combat.traits[side].city));
    }
    const starters = [...state.combat[firstSide].map(unit => [firstSide, unit]), ...state.combat[other(firstSide)].map(unit => [other(firstSide), unit])];
    for (const [side, unit] of starters) if (state.combat[side].includes(unit)) applyStart(state, side, unit);
    const cursor = { player: -1, enemy: -1 };
    let side = firstSide;
    while (state.combat.player.length && state.combat.enemy.length && state.combat.attacks < CONFIG.maxAttacks) {
      state.combat.activeSide = side;
      const units = state.combat[side];
      const unit = units.find(unit => unit.order > cursor[side]) || units[0];
      cursor[side] = unit.order;
      const strikes = getCharacter(unit.cardId).keywords.includes('doubleAttack') ? 2 : 1;
      for (let strike = 0; strike < strikes && state.combat[side].includes(unit) && state.combat[other(side)].length && state.combat.attacks < CONFIG.maxAttacks; strike++) attackOnce(state, side, unit);
      side = other(side);
    }
    const timeout = state.combat.player.length > 0 && state.combat.enemy.length > 0;
    const outcome = timeout || !state.combat.player.length && !state.combat.enemy.length ? 'draw' : state.combat.player.length ? 'win' : 'loss';
    const damageAmount = outcome === 'loss' ? Math.min(state.player.hp, kind === 'encounter' ? 2 : Math.min(CONFIG.damageCap, opponent.tier + state.combat.enemy.reduce((sum, unit) => sum + getCharacter(unit.cardId).tier, 0))) : 0;
    if (damageAmount) {
      const change = delta(entity(state, 'player'), state.player, 'hp', Math.max(0, state.player.hp - damageAmount));
      emit(state, 'damage', 'enemy', { target: entity(state, 'player'), changes: [change] });
    }
    const rewards = [];
    if (kind === 'encounter') {
      state.encounters.push({ round: state.round, outcome });
      if (outcome === 'win') {
        rewards.push(delta(entity(state, 'player'), state.player, 'gold', state.player.gold + 1));
        rewards.push(delta(entity(state, 'player'), state.player, 'xp', state.player.xp + 1));
      }
    }
    state.result = { kind, outcome, damage: damageAmount, round: state.round, reason: timeout ? 'stalemate' : 'normal',
      ...(kind === 'encounter' ? { encounterId: state.round, reward: { gold: outcome === 'win' ? 1 : 0, xp: outcome === 'win' ? 1 : 0 } } : {}) };
    state.phase = state.player.hp <= 0 || kind === 'round' && state.round === CONFIG.rounds ? 'gameover' : 'result';
    if (state.phase === 'gameover') state.winner = state.player.hp > 0 && outcome === 'win' && state.round === CONFIG.rounds ? 'player' : 'enemy';
    note(state, kind === 'encounter'
      ? outcome === 'win' ? '委託完成！獲得 1 金幣、1 隊伍經驗，回旅店繼續準備。' : outcome === 'draw' ? '委託平手，不扣生命、沒有獎勵，本次機會已使用。' : `委託失利，扣除 ${damageAmount} 點生命，本次機會已使用。`
      : outcome === 'win' ? '本輪獲勝！' : outcome === 'draw' ? '本輪平手，英雄不扣生命。' : `本輪失利，英雄受到 ${damageAmount} 點傷害。`);
    emit(state, 'result', 'player', { changes: rewards });
    if (state.winner) { note(state, state.winner === 'player' ? '十輪闖關成功！這座島交給你了。' : '這次挑戰告一段落，重整陣容再來。'); emit(state, 'winner', state.winner); }
  }, recordTimeline);
}
export function resumeRecruitment(state) {
  return action(state, ['result'], () => {
    requireRule(state.result?.kind === 'encounter' && state.player.hp > 0, '目前沒有可以返回旅店的小怪結算。');
    state.phase = 'recruit';
    state.combat = null;
    state.result = null;
    note(state, '已回到同一輪旅店，金幣、商店與站位保留；準備好了再開戰。');
    emit(state, 'phase');
  });
}
export function nextRound(state) {
  return action(state, ['result'], () => {
    requireRule(state.result?.kind === 'round', '小怪委託結束後，請先回到同一輪旅店。');
    requireRule(state.round < CONFIG.rounds && state.player.hp > 0, '對局已結束。');
    state.round++;
    state.phase = 'recruit';
    state.combat = null;
    state.result = null;
    state.player.income = Math.min(CONFIG.maxGold, state.round + 2);
    const change = delta(entity(state, 'player'), state.player, 'gold', state.player.income);
    if (state.player.tier < 4) state.player.upgradeCost = Math.max(CONFIG.minUpgradeCost, state.player.upgradeCost - 1);
    fillShop(state, state.shop.frozen);
    state.opponent = makeOpponent(state);
    note(state, `第 ${state.round} 輪招募，獲得 ${state.player.income} 金幣。`);
    emit(state, 'phase', 'player', { changes: [change] });
  });
}

export function validateRun(state) {
  const number = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  try {
    requireRule(state && state.schemaVersion === CONFIG.version, '存檔版本不相容。');
    requireRule(['recruit', 'result', 'gameover'].includes(state.phase), '存檔階段無效。');
    requireRule(number(state.seed, 0, 0xFFFFFFFF) && number(state.rngState, 0, 0xFFFFFFFF) && number(state.nextUid, 1, 1000000), '亂數或編號資料無效。');
    requireRule(number(state.round, 1, CONFIG.rounds), '輪次無效。');
    requireRule(Array.isArray(state.encounters) && state.encounters.length <= ENCOUNTER_ROUNDS.length && state.encounters.every((entry, index) => entry && ENCOUNTER_ROUNDS.includes(entry.round) && entry.round <= state.round && ['win', 'loss', 'draw', 'skipped'].includes(entry.outcome) && (!index || entry.round > state.encounters[index - 1].round)), '委託紀錄無效。');
    const p = state.player;
    requireRule(p && number(p.hp, 0, CONFIG.heroHealth) && p.maxHp === CONFIG.heroHealth && number(p.gold, 0, 50) && p.income === Math.min(CONFIG.maxGold, state.round + 2) && number(p.tier, 1, 4) && number(p.upgradeCost, p.tier === 4 ? 0 : 1, 9), '玩家資料無效。');
    requireRule(number(p.xp, 0, 3) && p.xp === state.encounters.filter(entry => entry.outcome === 'win').length, '隊伍經驗與委託紀錄不符。');
    const ids = new Set();
    const validUnit = (unit, seen, allowToken = false, allowMonster = false) => {
      requireRule(unit && typeof unit.uid === 'string' && unit.uid.length < 80 && !seen.has(unit.uid), '角色編號重複或無效。');
      seen.add(unit.uid);
      requireRule(ROSTER.some(card => card.id === unit.cardId) || allowToken && unit.cardId === 101 || allowMonster && Boolean(getEncounterCard(unit.cardId)), '未知角色。');
      requireRule(typeof unit.golden === 'boolean' && number(unit.attack, 1, 10000) && number(unit.hp, 0, 10000) && number(unit.maxHp, 1, 10000) && unit.hp <= unit.maxHp && [0, 1].includes(unit.shield), '角色數值無效。');
      requireRule((unit.evolution === undefined || number(unit.evolution, 0, 3)) && unit.golden === (getEvolution(unit) > 0), '角色進化階級無效。');
    };
    for (const [zone, cap] of [['board', CONFIG.boardSize], ['bench', CONFIG.benchSize]]) {
      requireRule(Array.isArray(p[zone]) && p[zone].length <= cap, '角色容量無效。');
      p[zone].forEach(unit => { validUnit(unit, ids); requireRule(unit.hp === unit.maxHp, '常駐角色不應帶有戰鬥傷害。'); });
    }
    requireRule(state.shop && Array.isArray(state.shop.offers) && state.shop.offers.length <= CONFIG.shopSizes[p.tier - 1] && typeof state.shop.frozen === 'boolean', '商店資料無效。');
    for (const offer of state.shop.offers) { requireRule(typeof offer.uid === 'string' && !ids.has(offer.uid) && ROSTER.some(card => card.id === offer.cardId && card.tier <= p.tier), '商店角色無效。'); ids.add(offer.uid); }
    requireRule([...ids].every(id => /^u-\d+$/.test(id) && Number(id.slice(2)) < state.nextUid), '常駐角色編號超出存檔進程。');
    requireRule(state.opponent && state.opponent.round === state.round && typeof state.opponent.name === 'string' && state.opponent.name.length <= 80 && number(state.opponent.tier, 1, 4) && Array.isArray(state.opponent.board) && state.opponent.board.length <= CONFIG.boardSize, '對手資料無效。');
    state.opponent.board.forEach(unit => validUnit(unit, ids));
    requireRule(Array.isArray(state.log) && state.log.length <= CONFIG.maxLog && state.log.every(line => typeof line === 'string' && line.length <= 300), '紀錄資料無效。');
    if (state.pendingReward) requireRule(state.phase === 'recruit' && Array.isArray(state.pendingReward.choices) && state.pendingReward.choices.length === 3 && new Set(state.pendingReward.choices).size === 3 && state.pendingReward.choices.every(id => ROSTER.some(card => card.id === id && card.tier === Math.min(4, p.tier + 1))), '合成獎勵無效。');
    requireRule(state.phase === 'gameover' ? ['player', 'enemy'].includes(state.winner) : state.winner === null, '勝負資料無效。');
    if (state.phase === 'recruit') requireRule(state.result === null && state.combat === null && p.hp > 0, '招募進程無效。');
    else {
      requireRule(state.result && ['round', 'encounter'].includes(state.result.kind) && ['win', 'loss', 'draw'].includes(state.result.outcome) && state.result.round === state.round && number(state.result.damage, 0, CONFIG.damageCap) && ['normal', 'stalemate'].includes(state.result.reason), '結算資料無效。');
      const encounter = state.result.kind === 'encounter';
      if (encounter) {
        requireRule(state.result.encounterId === state.round && state.encounters.some(entry => entry.round === state.round && entry.outcome === state.result.outcome), '委託結算與紀錄不符。');
        const reward = state.result.outcome === 'win' ? 1 : 0;
        requireRule(state.result.reward?.gold === reward && state.result.reward?.xp === reward && state.result.damage <= 2 && (state.result.outcome === 'loss' || state.result.damage === 0), '委託獎勵或傷害無效。');
      }
      requireRule(state.combat && state.combat.kind === state.result.kind && typeof state.combat.opponentName === 'string' && state.combat.opponentName.length <= 80 && ['player', 'enemy'].includes(state.combat.activeSide) && number(state.combat.attacks, 0, CONFIG.maxAttacks), '戰鬥資料無效。');
      const combatIds = new Set();
      for (const side of ['player', 'enemy']) { requireRule(Array.isArray(state.combat[side]) && state.combat[side].length <= CONFIG.boardSize, '戰鬥容量無效。'); state.combat[side].forEach(unit => validUnit(unit, combatIds, true, encounter && side === 'enemy')); }
      requireRule(state.phase !== 'result' || state.round < CONFIG.rounds && p.hp > 0, '結算階段不可重複通關。');
      requireRule(state.phase !== 'gameover' || p.hp === 0 || state.round === CONFIG.rounds, '對局尚未結束。');
      if (state.phase === 'gameover') requireRule(state.winner === (state.round === CONFIG.rounds && p.hp > 0 && state.result.outcome === 'win' ? 'player' : 'enemy'), '通關條件無效。');
    }
    return { ok: true, message: '' };
  } catch (error) { return { ok: false, message: error instanceof RuleError ? error.message : '存檔資料不完整。' }; }
}
