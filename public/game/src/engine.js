import { CARDS, DEFAULT_DECK, getCard } from './cards.js';

const other = side => side === 'player' ? 'enemy' : 'player';
const sideName = side => side === 'player' ? '我方' : '對手';
const cardName = cardId => {
  const card = getCard(cardId);
  return `${card.region}・${card.job}`;
};

function report(state, events, message) {
  state.log.push(message);
  if (state.log.length > 30) state.log.splice(0, state.log.length - 30);
  events.push(message);
}

function finish(state, events) {
  if (state.winner) return true;
  const playerDead = state.players.player.hp <= 0;
  const enemyDead = state.players.enemy.hp <= 0;
  if (!playerDead && !enemyDead) return false;
  state.winner = playerDead && enemyDead ? 'draw' : playerDead ? 'enemy' : 'player';
  report(state, events, state.winner === 'draw' ? '雙方英雄同時倒下，平手。' : state.winner === 'player' ? '我方獲勝！這座島，交給你了。' : '對手獲勝。重整牌組，再來一局。');
  return true;
}

function cleanup(state, events) {
  for (const side of ['player', 'enemy']) {
    const owner = state.players[side];
    owner.board = owner.board.filter(unit => {
      if (unit.hp > 0) return true;
      report(state, events, `${sideName(side)}的${cardName(unit.cardId)}退場。`);
      return false;
    });
  }
  finish(state, events);
}

function nextUid(state) {
  return `card-${state.nextUid++}`;
}

function draw(state, side, count, events) {
  const owner = state.players[side];
  for (let i = 0; i < count && !state.winner; i++) {
    if (!owner.deck.length) {
      owner.fatigue++;
      owner.hp -= owner.fatigue;
      report(state, events, `${sideName(side)}牌庫已空，受到 ${owner.fatigue} 點疲勞傷害。`);
      finish(state, events);
      continue;
    }
    const cardId = owner.deck.shift();
    if (owner.hand.length >= 8) {
      report(state, events, `${sideName(side)}手牌已滿，${cardName(cardId)}被燒毀。`);
    } else {
      owner.hand.push({ uid: nextUid(state), cardId });
      report(state, events, side === 'player' ? `我方抽到${cardName(cardId)}。` : '對手抽了 1 張牌。');
    }
  }
}

function shuffle(ids, rng) {
  const deck = [...ids];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function makeSide(deck) {
  return { hp: 24, maxHp: 24, mana: 3, maxMana: 3, deck, hand: [], board: [], fatigue: 0, turnCount: 0 };
}

export function createGame(playerDeckIds = DEFAULT_DECK, { rng = Math.random } = {}) {
  if (!Array.isArray(playerDeckIds) || playerDeckIds.length !== 12 || new Set(playerDeckIds).size !== 12 || playerDeckIds.some(id => !CARDS.some(card => card.id === id))) {
    throw new Error('牌組必須包含 12 張不重複的地域角色。');
  }
  const state = {
    turn: 'player', round: 1, winner: null, log: [], nextUid: 1,
    players: {
      player: makeSide(shuffle(playerDeckIds, rng)),
      enemy: makeSide(shuffle(DEFAULT_DECK, rng)),
    },
  };
  state.players.player.turnCount = 1;
  const events = [];
  draw(state, 'player', 5, events);
  draw(state, 'enemy', 5, events);
  report(state, events, '第 1 回合開始。我方先手，雙方起始費用為 3。');
  return state;
}

function heal(target, amount) {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return target.hp - before;
}

function applyAbility(state, side, unit, events) {
  const owner = state.players[side];
  const foe = state.players[other(side)];
  const card = getCard(unit.cardId);
  const healHero = amount => {
    const restored = heal(owner, amount);
    report(state, events, `${sideName(side)}英雄恢復 ${restored} 點生命。`);
  };
  switch (card.ability) {
    case 'healHero4': healHero(4); break;
    case 'healHero3': healHero(3); break;
    case 'healHero2': healHero(2); break;
    case 'healHero2Draw1': healHero(2); draw(state, side, 1, events); break;
    case 'draw1': draw(state, side, 1, events); break;
    case 'draw2': draw(state, side, 2, events); break;
    case 'heroDamage3':
      foe.hp -= 3;
      report(state, events, `${cardName(card.id)}對${sideName(other(side))}英雄造成 3 點傷害。`);
      break;
    case 'buffAllAttack1':
    case 'buffOthersAttack1': {
      const targets = owner.board.filter(ally => card.ability === 'buffAllAttack1' || ally.uid !== unit.uid);
      targets.forEach(ally => ally.attack++);
      report(state, events, `${sideName(side)}的 ${targets.length} 位角色獲得 +1 攻擊。`);
      break;
    }
    case 'buffOthersHealth2': {
      const targets = owner.board.filter(ally => ally.uid !== unit.uid);
      targets.forEach(ally => { ally.hp += 2; ally.maxHp += 2; });
      report(state, events, `${sideName(side)}的其他 ${targets.length} 位角色獲得 +2 生命與生命上限。`);
      break;
    }
    case 'healAll3':
      healHero(3);
      owner.board.forEach(ally => heal(ally, 3));
      report(state, events, `${sideName(side)}所有角色各恢復最多 3 點生命。`);
      break;
    case 'damageWeakest2': {
      const target = foe.board.reduce((weakest, candidate) => !weakest || candidate.hp < weakest.hp ? candidate : weakest, null);
      if (target) {
        target.hp -= 2;
        report(state, events, `${cardName(card.id)}對${cardName(target.cardId)}造成 2 點傷害。`);
      }
      break;
    }
    case 'damageAll1':
    case 'damageAll2': {
      const damage = card.ability === 'damageAll2' ? 2 : 1;
      foe.board.forEach(target => { target.hp -= damage; });
      report(state, events, `${cardName(card.id)}對所有敵方角色造成 ${damage} 點傷害。`);
      break;
    }
    case 'summonPuppet':
      if (owner.board.length < 4) {
        owner.board.push(makeUnit({ uid: nextUid(state), cardId: 101 }));
        report(state, events, `${sideName(side)}召喚一個 2／2 掌中戲偶。`);
      } else {
        report(state, events, `${sideName(side)}場上已滿，無法召喚掌中戲偶。`);
      }
      break;
  }
  if (!state.winner) cleanup(state, events);
}

function makeUnit(handCard) {
  const card = getCard(handCard.cardId);
  return { uid: handCard.uid, cardId: card.id, attack: card.attack, hp: card.health, maxHp: card.health, ready: card.keywords.includes('rush') };
}

function playForSide(state, side, handUid, events) {
  const owner = state.players[side];
  const handIndex = owner.hand.findIndex(card => card.uid === handUid);
  if (handIndex === -1) return '找不到這張手牌。';
  const handCard = owner.hand[handIndex];
  const card = getCard(handCard.cardId);
  if (owner.board.length >= 4) return '場上最多 4 位角色，請先騰出空位。';
  if (owner.mana < card.cost) return `費用不足：這張牌需要 ${card.cost} 點費用。`;
  owner.mana -= card.cost;
  owner.hand.splice(handIndex, 1);
  const unit = makeUnit(handCard);
  owner.board.push(unit);
  report(state, events, `${sideName(side)}花費 ${card.cost} 點費用，派出${cardName(card.id)}。`);
  applyAbility(state, side, unit, events);
  return '';
}

function attackForSide(state, side, attackerUid, targetUidOrHero, events) {
  const attacker = state.players[side].board.find(unit => unit.uid === attackerUid);
  const foe = state.players[other(side)];
  if (!attacker) return '找不到這位我方角色。';
  if (!attacker.ready) return '這位角色本回合無法再攻擊，或正在等待下一回合。';
  const target = targetUidOrHero === 'hero' ? null : foe.board.find(unit => unit.uid === targetUidOrHero);
  if (targetUidOrHero !== 'hero' && !target) return '請選擇敵方角色或敵方英雄。';
  const guards = foe.board.filter(unit => getCard(unit.cardId).keywords.includes('guard'));
  if (guards.length && (!target || !guards.some(guard => guard.uid === target.uid))) return '敵方有守護角色，必須先攻擊守護。';
  attacker.ready = false;
  if (target) {
    target.hp -= attacker.attack;
    attacker.hp -= target.attack;
    report(state, events, `${cardName(attacker.cardId)}攻擊${cardName(target.cardId)}，雙方互受 ${attacker.attack}／${target.attack} 點傷害。`);
  } else {
    foe.hp -= attacker.attack;
    report(state, events, `${cardName(attacker.cardId)}對${sideName(other(side))}英雄造成 ${attacker.attack} 點傷害。`);
  }
  cleanup(state, events);
  return '';
}

function playerActionError(state) {
  if (state.winner) return '對局已結束，請開始新對局。';
  if (state.turn !== 'player') return '請等待對手完成回合。';
  return '';
}

function result(error, events, fallback) {
  return { ok: !error, message: error || events.at(-1) || fallback, events };
}

export function playCard(state, handUid) {
  const events = [];
  const error = playerActionError(state) || playForSide(state, 'player', handUid, events);
  return result(error, events, '出牌完成。');
}

export function attack(state, attackerUid, targetUidOrHero) {
  const events = [];
  const error = playerActionError(state) || attackForSide(state, 'player', attackerUid, targetUidOrHero, events);
  return result(error, events, '攻擊完成。');
}

function startTurn(state, side, events) {
  state.turn = side;
  const owner = state.players[side];
  if (owner.turnCount > 0) owner.maxMana = Math.min(8, owner.maxMana + 1);
  owner.turnCount++;
  owner.mana = owner.maxMana;
  owner.board.forEach(unit => { unit.ready = true; });
  report(state, events, `${sideName(side)}回合開始，費用 ${owner.mana}／${owner.maxMana}。`);
  draw(state, side, 1, events);
}

function playScore(state, handCard) {
  const card = getCard(handCard.cardId);
  const owner = state.players.enemy;
  const foe = state.players.player;
  let score = card.attack + card.health / 2 + card.cost / 5;
  if (card.keywords.includes('rush')) score += 2;
  if (card.keywords.includes('guard') && owner.hp < 12) score += 4;
  if (card.ability === 'heroDamage3') score += foe.hp <= 3 ? 100 : 2;
  if (card.ability === 'damageAll2' || card.ability === 'damageAll1') {
    const damage = card.ability === 'damageAll2' ? 2 : 1;
    score += foe.board.reduce((value, unit) => value + Math.min(damage, unit.hp) + (unit.hp <= damage ? 2 : 0), 0);
  }
  if (card.ability === 'damageWeakest2') score += foe.board.some(unit => unit.hp <= 2) ? 5 : foe.board.length ? 2 : 0;
  if (card.ability === 'buffAllAttack1') score += owner.board.length * 2 + 1;
  if (card.ability === 'buffOthersAttack1' || card.ability === 'buffOthersHealth2') score += owner.board.length * 2;
  if (card.ability === 'summonPuppet' && owner.board.length <= 2) score += 3;
  if (card.ability.startsWith('heal')) score += Math.min(4, owner.maxHp - owner.hp);
  if ((card.ability === 'draw1' || card.ability === 'draw2' || card.ability === 'healHero2Draw1') && owner.deck.length === 0) {
    const draws = card.ability === 'draw2' ? 2 : 1;
    const damage = draws * owner.fatigue + draws * (draws + 1) / 2;
    const recovery = card.ability === 'healHero2Draw1' ? Math.min(2, owner.maxHp - owner.hp) : 0;
    if (damage >= owner.hp + recovery) return -Infinity;
    score -= damage;
  }
  return score;
}

function chooseAttack(state) {
  const attackers = state.players.enemy.board.filter(unit => unit.ready);
  const foe = state.players.player;
  if (!attackers.length) return null;
  const guards = foe.board.filter(unit => getCard(unit.cardId).keywords.includes('guard'));
  if (!guards.length && attackers.reduce((total, unit) => total + unit.attack, 0) >= foe.hp) {
    return { attacker: attackers[0], target: 'hero', score: 1000 };
  }
  let best = null;
  for (const attacker of attackers) {
    if (!guards.length) {
      const option = { attacker, target: 'hero', score: attacker.attack + (foe.hp <= 10 ? 3 : 0) };
      if (!best || option.score > best.score) best = option;
    }
    for (const target of guards.length ? guards : foe.board) {
      const kills = attacker.attack >= target.hp;
      const survives = attacker.hp > target.attack;
      const score = Math.min(attacker.attack, target.hp) / 2 + (kills ? target.attack + getCard(target.cardId).cost / 2 + 3 : 0) + (survives ? 2 : -attacker.attack - getCard(attacker.cardId).cost / 2) + (guards.length ? 2 : 0);
      if (!best || score > best.score) best = { attacker, target: target.uid, score };
    }
  }
  return best;
}

function enemyTurn(state, events) {
  const owner = state.players.enemy;
  // Each action consumes a hand card or a unit's attack; the cap bounds a turn.
  for (let actionCount = 0; actionCount < 40 && !state.winner; actionCount++) {
    const attackChoice = chooseAttack(state);
    if (attackChoice?.score >= 1000) {
      attackForSide(state, 'enemy', attackChoice.attacker.uid, attackChoice.target, events);
      continue;
    }
    let playChoice = null;
    let bestPlayScore = -Infinity;
    if (owner.board.length < 4) {
      for (const handCard of owner.hand) {
        if (getCard(handCard.cardId).cost > owner.mana) continue;
        const score = playScore(state, handCard);
        if (score > bestPlayScore) { playChoice = handCard; bestPlayScore = score; }
      }
    }
    if (playChoice) {
      playForSide(state, 'enemy', playChoice.uid, events);
    } else if (attackChoice) {
      attackForSide(state, 'enemy', attackChoice.attacker.uid, attackChoice.target, events);
    } else {
      break;
    }
  }
}

export function endTurn(state) {
  const events = [];
  const error = playerActionError(state);
  if (error) return result(error, events, '');
  report(state, events, '我方結束回合。');
  startTurn(state, 'enemy', events);
  if (!state.winner) enemyTurn(state, events);
  if (!state.winner) {
    report(state, events, '對手結束回合。');
    state.round++;
    startTurn(state, 'player', events);
  }
  return result('', events, '回合完成。');
}
