import { CONFIG, ROSTER, getCharacter } from './roster.js';
import { canReceiveUnit, getSynergies } from './autobattler.js';

export const GUIDE_ADVICE_NOTE = '本機策略建議，並非保證最優。';
const recruitable = new Set(ROSTER.map(card => card.id));
const owned = state => [...state.player.board, ...state.player.bench];
const cardUnit = card => ({ cardId: card.id, attack: card.attack, hp: card.health, maxHp: card.health, shield: card.keywords.includes('shield') ? 1 : 0, golden: false });

// A small deterministic estimate, not a battle simulation or win probability.
function strength(board, enemyCount) {
  let value = 0;
  board.forEach((unit, index) => {
    const card = getCharacter(unit.cardId), amount = (CONFIG.abilityValues[card.ability] || 0) * (unit.golden ? 2 : 1);
    const neighbors = Number(index > 0) + Number(index < board.length - 1);
    value += unit.attack + unit.hp * .65 + (unit.shield ? 2.5 : 0);
    if (card.keywords.includes('guard')) value += 1;
    if (card.keywords.includes('doubleAttack')) value += unit.attack * .6;
    const abilities = {
      guide: amount * .65, buffAll: amount * 1.65 * board.length, shieldWeakest: 2.5,
      adjacentAttack: amount * neighbors, adjacentHealth: amount * .65 * neighbors,
      adjacentShield: (amount * .65 + 2.5) * neighbors,
      weakestPing: amount, startBlast: amount * enemyCount, firstStrike: amount,
      selfHeal: amount * .45, healWeakest: amount * .65, healAll: amount * .4 * board.length,
      deathBuff: board.length > 1 ? amount * 1.65 : 0,
      deathBlast: amount * enemyCount, deathWave: amount * enemyCount, deathThrow: amount,
      splash: amount * Math.min(2, Math.max(0, enemyCount - 1)) * .75,
      attackGrowth: amount * .8, puppet: unit.golden ? 6.6 : 3.3,
    };
    value += abilities[card.ability] || 0;
  });
  for (const trait of getSynergies(board)) {
    if (!trait.level) continue;
    const members = board.filter(unit => getCharacter(unit.cardId).faction === trait.id);
    const amount = CONFIG.traitValues[trait.id][trait.level === 4 ? 1 : 0];
    if (trait.id === 'city') value += (trait.level === 4 ? members : members.slice(0, 1)).filter(unit => !unit.shield).length * 2.5;
    if (trait.id === 'forge') value += amount * members.length;
    if (trait.id === 'forest') value += amount * members.length * .65;
    if (trait.id === 'transit') value += amount * members.length * .7;
    if (trait.id === 'folk') value += amount * members.length * Math.max(0, board.length - 1) * .7;
    if (trait.id === 'tide') value += amount * enemyCount;
  }
  return value;
}
function bestAddition(board, unit, enemyCount) {
  if (board.length < CONFIG.boardSize) return { board: [...board, unit], index: board.length, score: strength([...board, unit], enemyCount) };
  let best = { board, index: -1, score: strength(board, enemyCount) };
  board.forEach((_, index) => {
    const next = board.map((current, slot) => slot === index ? unit : current), score = strength(next, enemyCount);
    if (score > best.score + .001) best = { board: next, index, score };
  });
  return best;
}
function traitReason(before, after) {
  const previous = getSynergies(before);
  const improved = getSynergies(after).find((trait, index) => trait.level > previous[index].level);
  return improved ? `湊滿${improved.level}位不同${improved.name}角色` : null;
}
function advice(action, target, title, reason, extra = {}) {
  return { key: [action, target.kind, target.uid ?? target.action ?? target.index, extra.destination?.index].filter(value => value !== undefined).join(':'), action, target, title, reason, note: GUIDE_ADVICE_NOTE, ...extra };
}
const control = (action, title, reason) => advice(action, { kind: 'control', action }, title, reason);
function placeAdvice(unit, fromZone, index, board, selectedUid, reason) {
  const destination = { zone: 'board', index };
  if (selectedUid && String(selectedUid) !== String(unit.uid)) return control('unselect', '先取消目前選取', `再選${getCharacter(unit.cardId).region}調整位置`);
  if (String(selectedUid) !== String(unit.uid)) return advice('select', { kind: 'unit', uid: unit.uid, zone: fromZone }, `選取${getCharacter(unit.cardId).region}`, reason, { destination });
  return board[index]
    ? advice('select', { kind: 'unit', uid: board[index].uid, zone: 'board' }, '點此調整站位', reason, { destination })
    : advice('place', { kind: 'board-slot', index }, '放上這個位置', reason, { destination });
}
function sellAdvice(unit, selectedUid) {
  if (selectedUid && String(selectedUid) !== String(unit.uid)) return control('unselect', '先取消目前選取', '再選手牌，換出免費援軍空位');
  return String(selectedUid) === String(unit.uid)
    ? control('sell', '出售換出空位', '空出手牌，再領免費援軍')
    : advice('select', { kind: 'unit', uid: unit.uid, zone: 'bench' }, `選取${getCharacter(unit.cardId).region}`, '手牌已滿，先選一位出售');
}
function snapshotKey(state) {
  return JSON.stringify([state.phase, state.round, state.player.gold, state.player.tier, state.player.upgradeCost,
    state.player.board, state.player.bench, state.shop, state.pendingReward, state.result]);
}

export function getGuideAdvice({ run, shown = run, screen = 'run', busy = false, dialogOpen = false, selectedUid = null, adventureStarted = false, chestOpening = false } = {}) {
  if (busy || dialogOpen || chestOpening) return null;
  if (screen === 'opening') return control('open-chest', '打開台卡木盒', '點木盒，進入旅店大廳');
  if (screen === 'lobby') return adventureStarted && run?.phase !== 'gameover'
    ? control('continue', '繼續這場冒險', '接續已儲存的旅店進度')
    : control('new-run', '開始島嶼冒險', '進入旅店，招募第一位夥伴');
  if (screen !== 'run' || !run || !shown || run.phase === 'combat' || shown.phase === 'combat' || snapshotKey(run) !== snapshotKey(shown)) return null;
  if (run.phase === 'gameover') return control('new-run', '再開一場冒險', '這局已結束，可以重新組隊');
  if (run.phase === 'result') return run.result?.kind === 'encounter'
    ? control('return-tavern', '回旅店繼續', '小怪結果已保存，回去編排')
    : control('next', '前往下一輪', '結果已保存，領新一輪金幣');
  if (run.phase !== 'recruit') return null;
  const state = shown, { board, bench, gold } = state.player, all = owned(state);
  const ids = [...all, ...state.shop.offers].map(unit => unit.uid);
  if (new Set(ids).size !== ids.length || [...all, ...state.shop.offers].some(unit => !recruitable.has(unit.cardId))) return null;
  const enemyCount = state.opponent.board.length, before = strength(board, enemyCount);
  const deployed = bench.map(unit => ({ unit, ...bestAddition(board, unit, enemyCount) })).sort((a, b) => b.score - a.score);
  if (state.pendingReward?.choices.some(id => recruitable.has(id) && canReceiveUnit(state, id))) return control('open-reward', '領取免費援軍', '先選三合一獎勵，不花金幣');
  if (bench.length && board.length < CONFIG.boardSize) {
    const choice = deployed[0];
    return placeAdvice(choice.unit, 'bench', board.length, board, selectedUid, traitReason(board, choice.board) || `補滿第${board.length + 1}個上場位置`);
  }
  if (state.pendingReward) {
    const expendable = [...bench].sort((a, b) => {
      const keep = unit => strength([unit], enemyCount) + (all.filter(other => other.cardId === unit.cardId && !other.golden).length >= 2 ? 10 : 0);
      return keep(a) - keep(b);
    })[0];
    return expendable ? sellAdvice(expendable, selectedUid) : null;
  }
  if (deployed[0]?.score > before + 1.5) {
    const choice = deployed[0];
    return placeAdvice(choice.unit, 'bench', choice.index, board, selectedUid, traitReason(board, choice.board) || '換上即戰力較高的手牌');
  }
  const candidates = gold >= CONFIG.buyCost ? state.shop.offers.filter(offer => canReceiveUnit(state, offer.cardId)).map(offer => {
    const card = getCharacter(offer.cardId), addition = bestAddition(board, cardUnit(card), enemyCount);
    const triple = all.filter(unit => unit.cardId === card.id && !unit.golden).length >= 2;
    return { offer, card, addition, triple, gain: addition.score - before + (triple ? 18 : 0) };
  }).filter(candidate => candidate.triple || candidate.gain > 1.5).sort((a, b) => Number(b.triple) - Number(a.triple) || b.gain - a.gain) : [];
  if (candidates.length) {
    const choice = candidates[0];
    return advice('buy', { kind: 'shop-card', uid: choice.offer.uid }, `招募${choice.card.region}`,
      choice.triple ? '這張可以三合一成金卡' : traitReason(board, choice.addition.board) || (board.length < CONFIG.boardSize ? `補上第${board.length + 1}位上場夥伴` : '這張可換上，改善目前陣容'));
  }
  if (!board.length) {
    if (gold >= CONFIG.buyCost + CONFIG.refreshCost && !state.shop.offers.length) return control('refresh', '補上商店角色', '刷新後仍留有三金招募');
    return control('lobby', '回大廳重新組隊', '資源不足，回大廳另開一局');
  }
  // Only an actual score improvement permits reordering; ties keep the layout.
  let arranged = null;
  board.forEach((unit, from) => board.forEach((_, to) => {
    if (from === to) return;
    const next = [...board]; next.splice(from, 1); next.splice(to, 0, unit);
    const score = strength(next, enemyCount);
    if (score > before + .9 && (!arranged || score > arranged.score + .001)) arranged = { unit, to, score };
  }));
  if (arranged) return placeAdvice(arranged.unit, 'board', arranged.to, board, selectedUid, '調整位置，讓相鄰技能多照顧一人');
  // The engine records these bounded, local round events; if the marker was
  // trimmed, conservatively avoid suggesting additional spending.
  const marker = state.log.findLastIndex(entry => entry.startsWith(`第 ${state.round} 輪招募`));
  const roundLog = marker < 0 ? null : state.log.slice(marker);
  const enemyStrength = strength(state.opponent.board, board.length);
  const desiredTier = state.round >= 7 ? 4 : state.round >= 4 ? 3 : state.round >= 2 ? 2 : 1;
  const enoughUnits = board.length >= Math.min(3, enemyCount);
  if (roundLog && state.round <= 8 && state.player.tier < desiredTier && enoughUnits && before >= enemyStrength * .95 &&
      gold >= state.player.upgradeCost + (board.length < CONFIG.boardSize ? CONFIG.buyCost : 0) && !roundLog.some(entry => entry.startsWith('商店升至'))) {
    return control('upgrade', '升級旅店', '目前陣容可用，增加後續選擇');
  }
  if (roundLog && !state.shop.frozen && !roundLog.includes('商店已刷新。') && gold >= CONFIG.buyCost + CONFIG.refreshCost &&
      bench.length < CONFIG.benchSize && before < enemyStrength * 1.05) return control('refresh', '刷新找新夥伴', '未見明顯提升，換一批且留三金');
  return control('combat', '準備好了就開戰', gold < CONFIG.buyCost ? '現有隊伍已上場，可挑戰本輪' : '未見明顯提升，保留目前陣容');
}
