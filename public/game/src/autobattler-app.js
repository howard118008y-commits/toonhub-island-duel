import { CONFIG, TRAITS, getCharacter } from './roster.js';
import { createRun, buy, sell, refreshShop, toggleFreeze, upgradeTavern, moveUnit, chooseTripleReward, startCombat, nextRound, getSynergies, canReceiveUnit } from './autobattler.js';
import { loadRun, saveRun, clearRun } from './storage.js';
import { createBattleEffects } from './effects.js';
import { installThemeBridge } from './theme.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#game-dialog');
const live = document.querySelector('#live-status');
const effects = createBattleEffects({ root: app });
const loaded = loadRun();
let run = loaded.state || createRun();
let shown = structuredClone(run);
let busy = false;
let playbackId = 0;
let playbackController = null;
let selectedUid = null;
let previewOpen = false;
let renderedPhase = '';
let returnFocus = '';
let draggedUid = null;
let saveMessage = loaded.status === 'restored' ? '已接續本機冒險' : loaded.status === 'empty' ? '進度儲存在此瀏覽器' : loaded.message;
let saveFailed = ['invalid', 'unavailable'].includes(loaded.status);
let message = loaded.status === 'restored' ? `已接續第 ${run.round} 輪，歡迎回來。` : loaded.status === 'empty' ? '先招募一位角色，再編排你的主場。' : loaded.message;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const merchantUrl = new URL('../../characters/merchant.webp', import.meta.url).href;
const imageUrl = (id, detail = false) => new URL(`../../characters/web/${detail ? 'hero' : 'card'}-${String(id === 101 ? 13 : id).padStart(2, '0')}.webp`, import.meta.url).href;
const traitFor = card => TRAITS.find(trait => trait.id === card.faction);
const unitList = state => [...state.player.board, ...state.player.bench];
const selected = () => unitList(shown).find(unit => String(unit.uid) === String(selectedUid));
const isRecruit = () => shown.phase === 'recruit' && !busy;
const disabled = condition => condition ? 'disabled' : '';
const skillText = (card, unit) => unit?.golden && (CONFIG.abilityValues[card.ability] || card.ability === 'puppet') ? card.shortText.replace(/\d+/g, number => String(Number(number) * 2)) : card.shortText;
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>', sword: '<path d="m5 19 3-3m-3-3 6 6m-3-6L18 3l3 3-10 10M4 20l-1 1"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="m12 6 4 6-4 6-4-6Z"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>', arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 12M4 12l2.4 6A7 7 0 0 0 18 17"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>' })[name] || ''}</svg>`;

function announce(text) { message = text; live.textContent = text; }
function persist() {
  const result = saveRun(run);
  saveFailed = !result.ok;
  saveMessage = result.ok ? '已自動儲存' : '本次無法儲存，重整會遺失進度';
}
function focusKey() { return document.activeElement?.closest('[data-focus]')?.dataset.focus || ''; }
function restoreFocus(key) {
  if (dialog.open) return;
  const choices = [...app.querySelectorAll('[data-focus]')].filter(node => node.getClientRects().length > 0);
  const target = choices.find(node => node.dataset.focus === key && !node.disabled) || choices.find(node => node.dataset.action === 'buy' && !node.disabled) || choices.find(node => node.dataset.focus === 'primary' && !node.disabled);
  target?.focus({ preventScroll: true });
}

function cardView(card, { unit, offer, zone = 'board', compact = false, reward = false } = {}) {
  const trait = traitFor(card);
  const ownCount = unitList(shown).filter(item => item.cardId === card.id && !item.golden).length;
  const full = shown.player.bench.length >= CONFIG.benchSize;
  const canBuy = !busy && !shown.pendingReward && shown.player.gold >= CONFIG.buyCost && canReceiveUnit(shown, card.id);
  const selectedCard = unit && String(unit.uid) === String(selectedUid);
  const hp = Math.max(0, unit?.hp ?? card.health);
  const attack = unit?.attack ?? card.attack;
  const selectable = unit && shown.phase === 'recruit' && zone !== 'combat';
  const action = selectable ? 'select' : 'inspect';
  const actionLabel = selectable ? '選取並編排' : '查看詳情';
  const skill = skillText(card, unit);
  return `<article class="unit-card ${zone === 'combat' ? 'card-board combat-card' : offer ? 'shop-card' : `card-${zone}`} ${compact && zone !== 'combat' ? 'piece-card' : ''} ${unit?.golden ? 'is-golden' : ''} ${selectedCard ? 'is-selected' : ''}" ${unit ? `data-card-uid="${esc(unit.uid)}"` : ''} ${selectable ? `draggable="true" data-drag-uid="${esc(unit.uid)}"` : ''}>
    <button class="card-face" type="button" data-action="${action}" data-id="${card.id}" ${unit ? `data-uid="${esc(unit.uid)}"` : ''} data-focus="${unit ? `unit-${esc(unit.uid)}` : `inspect-${esc(offer?.uid || card.id)}`}" ${disabled(selectable && busy)} ${selectable ? `aria-pressed="${Boolean(selectedCard)}"` : ''} aria-label="${esc(`${card.region}，${actionLabel}，${attack}攻擊、${hp}生命。${unit?.golden ? '金卡。' : ''}${skill}`)}">
      <span class="card-heading"><strong>${esc(card.id === 101 ? '戲偶' : card.region)}</strong><span class="tier-mark">${unit?.golden ? '金卡' : `${card.tier}階`}</span></span>
      <span class="portrait"><img src="${imageUrl(card.id)}" width="320" height="480" alt="" loading="lazy" decoding="async" data-art-id="${card.id}"></span>
      ${!compact ? `<span class="card-trait">${esc(trait?.name || '召喚物')}${ownCount && offer ? `<span>已擁有 ${ownCount}/3</span>` : ''}</span><span class="card-skill">${esc(skill)}</span>` : `<span class="combat-badges">${unit?.shield ? `${icon('shield')}護盾` : card.keywords.includes('guard') ? '守護' : unit?.golden ? '金卡' : ''}</span>`}
      <span class="card-stats"><span class="attack-stat">${icon('sword')}<b>${attack}</b></span><span class="health-stat ${hp < (unit?.maxHp ?? card.health) ? 'is-hurt' : ''}">${icon('heart')}<b>${hp}</b></span></span>
    </button>
    ${offer ? `<button class="buy-button" type="button" data-action="buy" data-uid="${esc(offer.uid)}" data-focus="buy-${esc(offer.uid)}" ${disabled(!canBuy)} aria-label="購買${esc(card.region)}，${CONFIG.buyCost}金幣">${icon('coin')}${full && ownCount < 2 ? '備位已滿' : shown.player.gold < CONFIG.buyCost ? `還差 ${CONFIG.buyCost - shown.player.gold} 金` : `購買 ${CONFIG.buyCost} 金`}</button>` : ''}
    ${reward ? `<button class="buy-button" type="button" data-action="reward" data-id="${card.id}" data-focus="reward-${card.id}" aria-label="免費選擇${esc(card.region)}，0金幣" ${disabled(!canReceiveUnit(shown, card.id))}><span>${canReceiveUnit(shown, card.id) ? '免費選擇' : '備位已滿'}<small>0 金幣</small></span></button>` : ''}
    ${selectable ? `<button class="card-detail-trigger" type="button" data-action="inspect" data-id="${card.id}" data-uid="${esc(unit.uid)}" data-focus="detail-${esc(unit.uid)}" aria-label="查看${esc(card.region)}完整技能">${icon('info')}</button>` : ''}
  </article>`;
}

function hud() {
  return `<header class="run-hud"><div class="run-progress"><span class="overline">地域自走棋</span><strong>第 ${shown.round}<span>／${CONFIG.rounds} 輪</span></strong></div><div class="hero-player player" data-hero="player"><div class="hero-health">${icon('heart')}<b>${Math.max(0, shown.player.hp)}</b><span>生命</span></div><div class="gold-display" data-gold="player">${icon('coin')}<b>${shown.player.gold}</b><span>金幣</span></div></div><nav class="utility-actions" aria-label="遊戲選單"><button class="icon-button" data-action="rules" data-focus="rules" aria-label="玩法說明">${icon('info')}<span>玩法</span></button><button class="icon-button" data-action="restart" data-focus="restart" aria-label="重新開始冒險">${icon('refresh')}<span>重開</span></button></nav></header><div class="save-line ${saveFailed ? 'save-failed' : ''}"><span>${saveFailed ? '⚠' : '✓'} ${esc(saveMessage)}</span><span>${saveFailed ? '重新整理可能遺失本次進度' : '僅此瀏覽器・此裝置'}</span></div>`;
}

function shopView() {
  const player = shown.player;
  const locked = busy || Boolean(shown.pendingReward);
  const selectedInReserve = shown.player.bench.some(unit => String(unit.uid) === String(selectedUid));
  const speech = shown.pendingReward ? '三張合一！來，挑一位免費夥伴。' : selectedInReserve ? '夥伴在等你，點下方棋盤把他擺上場。' : shown.player.board.length ? `已有 ${shown.player.board.length} 位夥伴上場，準備好了再開戰。` : shown.round === 1 && !unitList(shown).length ? '歡迎！先招募一位，親手擺上棋盤吧。' : '慢慢挑，這裡沒有倒數。站位由你決定。';
  return `<section class="shop-section tavern-shop panel" aria-labelledby="shop-title"><header class="merchant-counter"><div class="merchant-portrait"><img src="${merchantUrl}" width="300" height="300" alt="旅店商人阿島" data-merchant></div><div class="merchant-intro"><span class="overline">阿島的旅店 · 第 ${shown.round} 輪備戰</span><h1 id="shop-title" tabindex="-1" data-focus="shop-title">島嶼旅店 <small>${player.tier} 階</small></h1><p>${speech}</p></div><div class="tavern-sign" aria-hidden="true"><span>嶼</span><small>旅人歇腳 · 英雄集合</small></div></header><div class="shop-tools"><span class="shop-tools-label">每位 3 金 · 招募到備位</span><button class="upgrade-button" data-action="upgrade" data-focus="upgrade" ${disabled(locked || player.tier >= 4 || player.gold < player.upgradeCost)}>${icon('star')}${player.tier >= 4 ? '最高 4 階' : `升階 ${player.upgradeCost} 金`}</button><button class="small-button" data-action="refresh" data-focus="refresh" ${disabled(locked || player.gold < CONFIG.refreshCost)}>${icon('refresh')}刷新 1 金</button><button class="small-button ${shown.shop.frozen ? 'is-frozen' : ''}" data-action="freeze" data-focus="freeze" aria-pressed="${shown.shop.frozen}" ${disabled(locked)}>${icon('lock')}${shown.shop.frozen ? '已鎖店' : '鎖店・免費'}</button></div><div class="card-rail shop-rail" aria-label="旅店角色，每頁可看三位">${shown.shop.offers.map(offer => cardView(getCharacter(offer.cardId), { offer })).join('')}${Array.from({ length: CONFIG.shopSizes[player.tier - 1] - shown.shop.offers.length }, () => '<div class="sold-slot"><span>已招募</span><small>刷新補貨</small></div>').join('')}</div><div class="shop-footer"><p class="rail-hint">${shown.shop.frozen ? '下輪保留未買角色；刷新會解鎖。' : '點角色看技能 · 招募先進備位'}</p>${CONFIG.shopSizes[player.tier - 1] > 3 ? `<div class="shop-page-controls"><button class="small-button" data-action="shop-scroll" data-direction="-1" aria-label="上一組旅店角色" data-focus="shop-prev">←</button><span>共 ${CONFIG.shopSizes[player.tier - 1]} 位</span><button class="small-button" data-action="shop-scroll" data-direction="1" aria-label="下一組旅店角色" data-focus="shop-next">→</button></div>` : ''}</div></section>`;
}

function lineUp(zone) {
  const units = shown.player[zone];
  const capacity = zone === 'board' ? CONFIG.boardSize : CONFIG.benchSize;
  return `<div class="${zone === 'board' ? 'player-board board-rail' : 'player-bench bench-rail'} card-rail placement-row" aria-label="${zone === 'board' ? '上場棋盤，從左至右出手' : '備位'}">${Array.from({ length: capacity }, (_, index) => {
    const unit = units[index];
    const label = zone === 'board' ? `第 ${index + 1} 位` : `備位 ${index + 1}`;
    const canPlace = Boolean(selectedUid) && index === units.length && String(units.at(-1)?.uid) !== String(selectedUid);
    return `<div class="position-slot ${unit ? 'is-occupied' : 'is-empty'} ${canPlace ? 'can-place' : ''}" data-drop-zone="${zone}" data-drop-index="${index}"><span class="position-number">${label}${zone === 'board' && index < capacity - 1 ? '<i aria-hidden="true">→</i>' : ''}</span>${unit ? cardView(getCharacter(unit.cardId), { unit, zone, compact: true }) : `<button class="empty-slot" data-action="place" data-zone="${zone}" data-index="${index}" data-focus="slot-${zone}-${index}" ${disabled(!canPlace || busy)} aria-label="${label}，${canPlace ? '移入已選角色' : '等待前一個位置排滿'}"><span aria-hidden="true">${canPlace ? '＋' : '◇'}</span><strong>${canPlace ? '放這裡' : '等待夥伴'}</strong></button>`}</div>`;
  }).join('')}</div>`;
}

function unitActions() {
  const unit = selected();
  if (!unit) return '<p class="arrange-hint"><strong>親手擺上場</strong> 點備位角色，再點棋盤空位；也可以拖曳。隊伍依順序靠左排列。</p>';
  const locked = busy;
  const zone = shown.player.board.includes(unit) ? 'board' : 'bench';
  const index = shown.player[zone].indexOf(unit);
  const other = zone === 'board' ? 'bench' : 'board';
  const capacity = other === 'board' ? CONFIG.boardSize : CONFIG.benchSize;
  return `<div class="selection-actions"><strong>${esc(getCharacter(unit.cardId).region)}已選取 <small>點空位放置；點其他角色調位</small></strong><div><button data-action="shift" data-direction="-1" data-focus="move-left" ${disabled(locked || index === 0)}>← 前移</button><button data-action="shift" data-direction="1" data-focus="move-right" ${disabled(locked || index === shown.player[zone].length - 1)}>後移 →</button><button data-action="transfer" data-focus="transfer" ${disabled(locked || shown.player[other].length >= capacity)}>${other === 'board' ? '放上棋盤' : '撤回備位'}</button><button class="sell-button" data-action="sell" data-uid="${esc(unit.uid)}" data-focus="sell" ${disabled(locked)}>出售 ＋1 金</button><button data-action="unselect" data-focus="unselect">取消</button></div></div>`;
}

function synergies() {
  return `<section class="synergy-section"><div class="section-heading compact"><h2>隊伍羈絆</h2><span>不同角色才計數</span></div><div class="synergy-list">${getSynergies(shown.player.board).map(trait => `<button class="synergy-chip ${trait.level ? 'is-active' : ''}" data-action="trait" data-id="${trait.id}" data-focus="trait-${trait.id}" aria-label="${esc(trait.name)}羈絆，${trait.count}位不同角色，查看效果"><span>${esc(trait.name)}</span><b>${trait.count}/${trait.level >= 2 ? 4 : 2}</b>${trait.level ? '<small>已啟動</small>' : ''}</button>`).join('')}</div></section>`;
}

function teamView() {
  return `<section class="team-section battle-table panel" aria-labelledby="team-title"><div class="section-heading"><div><span class="overline">上場後才會參戰 · 從左至右出手</span><h2 id="team-title" tabindex="-1" data-focus="team-title">你的棋盤 <small>${shown.player.board.length}／${CONFIG.boardSize} 位</small></h2></div><span class="board-direction">出手順序 <b>1 → 5</b></span></div>${lineUp('board')}${unitActions()}<div class="reserve-area"><div class="section-heading compact"><h2>備位 <small>${shown.player.bench.length}／${CONFIG.benchSize}</small></h2><span>買到這裡，再親手上場</span></div>${lineUp('bench')}</div>${synergies()}</section>`;
}

function preview() {
  return `<details class="opponent-preview panel" ${previewOpen ? 'open' : ''}><summary><span>下個對手 <strong>${esc(shown.opponent.name)}</strong></span><span>查看 ${shown.opponent.board.length} 位敵陣 ↓</span></summary><div class="preview-units">${shown.opponent.board.map(unit => `<button data-action="inspect" data-id="${unit.cardId}" data-uid="${esc(unit.uid)}" data-focus="enemy-${esc(unit.uid)}" aria-label="查看敵方${esc(getCharacter(unit.cardId).region)}"><img src="${imageUrl(unit.cardId)}" width="48" height="72" loading="lazy" alt=""><span><strong>${esc(getCharacter(unit.cardId).region)}</strong><small>${unit.attack} 攻／${unit.hp} 血</small></span></button>`).join('')}</div><p>敵陣已公開，可以慢慢想，沒有準備倒數。</p></details>`;
}

function recruitView() {
  const ready = shown.player.board.length > 0;
  return `<nav class="first-steps" aria-label="備戰流程"><button data-action="section" data-section="shop"><b>1</b> 旅店招募</button><span aria-hidden="true">→</span><button data-action="section" data-section="team"><b>2</b> 親手擺位</button><span aria-hidden="true">→</span><span><b>3</b> 準備開戰</span></nav><main class="recruit-layout">${shopView()}${teamView()}${preview()}</main><footer class="action-dock recruit-dock"><div><strong>${shown.pendingReward ? '金卡誕生，選一位免費夥伴' : ready ? `${shown.player.board.length} 位上場 · 站位由你決定` : shown.player.bench.length ? '夥伴已招募，先擺上棋盤' : '先到旅店招募一位夥伴'}</strong><small>${shown.pendingReward ? '三選一獎勵，不花金幣' : '沒有倒數；按下準備開戰才會開始'}</small></div><button class="primary-button" data-action="${shown.pendingReward ? 'open-reward' : 'combat'}" data-focus="primary" ${disabled(busy || (!shown.pendingReward && !ready))}>${shown.pendingReward ? '選擇免費角色' : '準備好了，開戰'}${icon('arrow')}</button></footer>`;
}

function combatView() {
  const player = shown.combat?.player || shown.player.board;
  const enemy = shown.combat?.enemy || shown.opponent.board;
  const row = (units, side) => `<div class="${side}-board combat-row" aria-label="${side === 'player' ? '我方' : '敵方'}棋盤">${Array.from({ length: CONFIG.boardSize }, (_, index) => units[index] ? cardView(getCharacter(units[index].cardId), { unit: units[index], zone: 'combat', compact: true }) : '<div class="combat-empty" aria-hidden="true"><span>◇</span></div>').join('')}</div>`;
  return `<main class="combat-stage combat-table"><div class="combat-heading" data-hero="enemy"><span class="overline">第 ${shown.round} 輪 · 敵方棋盤</span><h1>${esc(shown.opponent.name)}</h1></div>${row(enemy, 'enemy')}<div class="versus-line"><span></span><strong>碰撞、出招，守住主場。</strong><span></span></div>${row(player, 'player')}<p class="combat-caption">你的棋盤 · 攻擊、反擊與護盾逐步結算</p></main><footer class="action-dock combat-dock"><div><strong><span class="thinking-dot"></span> 正常速度 · 自動對戰中</strong><small>每次攻擊都會播放完整出手動作</small></div><button class="secondary-button skip-button" data-action="skip" data-focus="primary">略過動畫</button></footer>`;
}

function resultView() {
  const end = shown.phase === 'gameover';
  const won = shown.result?.outcome === 'win';
  const draw = shown.result?.outcome === 'draw';
  const cleared = end && shown.winner === 'player';
  const title = end ? cleared ? '十輪闖關，主場制霸！' : '這次的冒險，先到這裡。' : won ? '漂亮，這輪守住主場！' : draw ? '勢均力敵，平手。' : '調整陣容，下一輪再來。';
  const endReason = cleared ? '十輪挑戰完成。你的地域夥伴，一起守住了主場。' : shown.player.hp <= 0 ? '生命已歸零。重新招募，試試不同羈絆與出場順序。' : '最後一輪需要獲勝才能通關。換個陣容，再挑戰一次。';
  return `<main class="result-page"><span class="result-symbol">${icon(cleared || won ? 'star' : 'shield')}</span><p class="overline">${end ? cleared ? '冒險通關' : '冒險結束' : `第 ${shown.round} 輪結果`}</p><h1>${title}</h1><div class="result-stats"><span><small>本輪結果</small><strong>${won ? '勝利' : draw ? '平手' : '落敗'}</strong></span><span><small>扣除生命</small><strong class="result-damage">${shown.result?.damage ? `−${shown.result.damage}` : '0'}</strong></span><span><small>剩餘生命</small><strong>${Math.max(0, shown.player.hp)}<small>／24</small></strong></span></div><p>${end ? endReason : `隊伍已恢復，下一輪可領 ${Math.min(CONFIG.maxGold, shown.round + 3)} 金幣。`}</p><div class="result-team">${shown.player.board.map(unit => `<img src="${imageUrl(unit.cardId)}" width="90" height="135" alt="${esc(getCharacter(unit.cardId).region)}" loading="lazy">`).join('')}</div><button class="primary-button" data-action="${end ? 'new-run' : 'next'}" data-focus="primary">${end ? '開始新的冒險' : '下一輪招募'} ${icon('arrow')}</button><span class="result-save-note">${saveFailed ? '本次進度尚未成功儲存' : '已儲存此結果；重新整理不會重打或重複領錢'}</span></main>`;
}

function render(preferredFocus = focusKey()) {
  const rails = [...app.querySelectorAll('.card-rail')].map(node => [node.className, node.scrollLeft]);
  const combat = shown.phase === 'combat' || (busy && run.phase !== 'recruit');
  const phase = combat ? 'combat' : shown.phase;
  app.innerHTML = `<div class="autobattler ${combat ? 'in-combat' : ''}">${hud()}<p class="feedback-line">${esc(message)}</p>${combat ? combatView() : shown.phase === 'recruit' ? recruitView() : resultView()}</div>`;
  for (const [classes, left] of rails) [...app.querySelectorAll('.card-rail')].find(node => node.className === classes)?.scrollTo({ left, behavior: 'instant' });
  if (renderedPhase && renderedPhase !== phase) window.scrollTo({ top: 0, behavior: 'instant' });
  renderedPhase = phase;
  updateShopControls();
  try { effects.sync?.(); }
  catch (error) {
    if (busy) throw error;
    console.warn('Battle effect synchronisation failed.', error);
    cancelEffects();
  }
  if (preferredFocus) restoreFocus(preferredFocus);
}

function updateShopControls() {
  const rail = app.querySelector('.shop-rail');
  if (!rail) return;
  app.querySelectorAll('[data-action="shop-scroll"]').forEach(button => {
    button.disabled = busy || (button.dataset.direction === '-1' ? rail.scrollLeft <= 2 : rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 2);
  });
}

function cancelEffects() {
  try { effects.cancel(); }
  catch (error) { console.warn('Battle effect cleanup failed.', error); }
}
function stopPlayback() {
  playbackId++;
  playbackController?.abort();
  playbackController = null;
  busy = false;
  cancelEffects();
}
async function playVisualStep(step, signal) {
  while (!signal.aborted) {
    const status = await new Promise((resolve, reject) => {
      let timer, started = false, settled = false;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        document.removeEventListener('visibilitychange', onVisibility);
        if (error) reject(error); else resolve(value);
      };
      const onAbort = () => finish('cancelled');
      const onVisibility = () => {
        if (signal.aborted) { onAbort(); return; }
        if (document.hidden) {
          if (started) { cancelEffects(); finish('paused'); }
          return;
        }
        if (started) return;
        started = true;
        // A broken animation driver must never hold the already-saved result.
        timer = setTimeout(() => finish(null, new Error('Battle animation exceeded 5000ms.')), 5000);
        Promise.resolve().then(() => {
          if (!settled) return effects.play(step, effects.capture());
        }).then(() => finish('complete'), error => finish(null, error));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      document.addEventListener('visibilitychange', onVisibility);
      onVisibility();
    });
    if (status !== 'paused') return;
  }
}
async function act(action, ...args) {
  if (busy) return;
  const preferred = focusKey();
  const previousUids = new Set(unitList(run).map(unit => unit.uid));
  const result = action(run, ...args);
  if (!result.ok) { announce(result.message); render(preferred); return; }
  persist();
  const id = ++playbackId;
  const controller = new AbortController();
  playbackController = controller;
  let playbackFailed = false;
  busy = true;
  announce(action === startCombat ? '戰鬥開始，夥伴正在自動出手。' : result.message || '已完成操作。');
  try {
    render();
    for (const step of result.timeline || []) {
      if (id !== playbackId) return;
      if (step.type === 'attack') {
        message = `${getCharacter(step.actor.cardId).region}出手，攻擊${getCharacter(step.target.cardId).region}。`;
        live.textContent = message;
      }
      const updateAtImpact = step.type === 'damage';
      if (updateAtImpact) { shown = step.snapshot; render(); }
      await playVisualStep(step, controller.signal);
      if (id !== playbackId) return;
      if (!updateAtImpact) { shown = step.snapshot; render(); }
    }
  } catch (error) {
    if (id === playbackId) { playbackFailed = true; console.warn('Battle playback recovered to the saved state.', error); }
  } finally {
    if (id === playbackId) {
      playbackController = null;
      cancelEffects();
      shown = structuredClone(run);
      busy = false;
      announce(playbackFailed ? action === startCombat ? '動畫中斷，已保留本場結果，可繼續下一步。' : '動畫中斷，已完成此次操作。' : result.message || '已完成操作。');
      if (!unitList(shown).some(unit => String(unit.uid) === String(selectedUid))) selectedUid = null;
      render(action === nextRound ? 'shop-title' : action === sell ? 'team-title' : focusKey() || preferred);
      if (action === buy || action === chooseTripleReward) {
        const joined = unitList(run).find(unit => !previousUids.has(unit.uid));
        if (run.pendingReward) { selectedUid = null; announce('三合一金卡完成，請選擇免費夥伴。'); render(); }
        else if (joined && run.player.bench.includes(joined)) { selectedUid = joined.uid; announce(`${getCharacter(joined.cardId).region}已加入備位，點棋盤位置讓他上場。`); render(`unit-${joined.uid}`); app.querySelector('.team-section')?.scrollIntoView({ block: 'center', behavior: 'instant' }); }
      }
      if (action === moveUnit) { announce('站位已調整；準備好了再開戰。'); render(); }
      if (run.pendingReward && ([buy, chooseTripleReward].includes(action) || run.pendingReward.choices.some(id => canReceiveUnit(run, id)))) showReward();
    }
  }
}

function openModal(content) {
  returnFocus = focusKey();
  dialog.innerHTML = `<button class="dialog-close icon-button" data-action="close-dialog" aria-label="關閉對話框">${icon('close')}</button>${content}`;
  if (!dialog.open) dialog.showModal();
}
function details(id, uid) {
  const card = getCharacter(Number(id));
  if (!card) return;
  const trait = traitFor(card);
  const unit = [...(shown.combat?.player || []), ...(shown.combat?.enemy || []), ...unitList(shown), ...shown.opponent.board].find(item => String(item.uid) === String(uid));
  const skill = skillText(card, unit);
  const description = card.description.replace(card.shortText, skill);
  openModal(`<div class="character-detail"><div class="detail-art"><img src="${imageUrl(card.id, true)}" width="1024" height="1536" alt="${esc(card.region)}立體角色" data-art-id="${card.id}"></div><div class="detail-copy"><span class="overline">${card.tier} 階 · ${esc(trait?.name || '戰鬥召喚物')}</span><h2 id="dialog-title">${esc(card.region)}<span>${esc(card.job)}</span></h2><blockquote>「${esc(card.quote)}」</blockquote><div class="detail-stats"><span>${icon('sword')}${unit?.attack ?? card.attack} 攻擊</span><span>${icon('heart')}${Math.max(0, unit?.hp ?? card.health)} 生命</span></div><p class="detail-value-note">${unit ? unit.golden ? '金卡目前數值；以下技能已換算金卡效果。' : '角色目前數值。' : '以下為普通角色的基本數值。'}</p><p>${esc(description)}</p>${trait ? `<div class="trait-explanation"><strong>${esc(trait.name)}羈絆</strong><p>${esc(trait.description)}</p></div>` : ''}</div></div>`);
}
function showReward() {
  if (!run.pendingReward) return;
  openModal(`<div class="reward-dialog"><span class="overline">三合一金卡獎勵</span><h2 id="dialog-title">再選一位，免費加入主場。</h2><p>只選一張，0 金幣。${run.pendingReward.choices.every(id => !canReceiveUnit(run, id)) ? '備位已滿，先回棋盤上場或出售一位。' : '新夥伴先進備位，之後再擺上棋盤。'}</p><div class="reward-choices">${run.pendingReward.choices.map(id => cardView(getCharacter(id), { reward: true })).join('')}</div><button class="secondary-button reward-arrange" data-action="close-dialog">先回棋盤編排</button></div>`);
}
function rules() {
  openModal(`<div class="rules-copy"><span class="overline">不用趕，沒有準備倒數</span><h2 id="dialog-title">招募、編排，交給夥伴出手。</h2><ol><li><strong>招募你的主場</strong><p>每次購買先進備位，再親手放上棋盤。買角色 3 金、賣出得 1 金、刷新商店 1 金；凍結免費，下輪保留未買角色並補空位。刷新會解凍。</p></li><li><strong>編排 5 位夥伴</strong><p>5 位上陣、3 位備位。點一位再點目標席位調整順序；跨區會交換。2／4 位不同同羈絆角色可啟動效果，備位不計入。</p></li><li><strong>合金與升階</strong><p>同角色 3 張普通卡自動合為金卡，並免費三選一。升階會出現更高階角色；費用可在商店看到，每過一輪會下降。</p></li><li><strong>自動對戰，挑戰 10 輪</strong><p>按「準備好了，開戰」後自動選目標，守護優先，角色交戰同時互相扣血。戰鬥傷勢不帶回招募。生命歸零即結束；第 10 輪必須獲勝且存活才通關。</p></li><li><strong>金幣與儲存</strong><p>下一輪才領新收入，剩餘金幣不保留。進度僅存此裝置／瀏覽器；戰鬥中重新整理會顯示已結算結果，不重複扣血或領錢。無法儲存時會明確提醒。</p></li></ol><button class="primary-button" data-action="close-dialog">知道了，回到主場</button></div>`);
}
function newRun() {
  stopPlayback();
  clearRun();
  run = createRun();
  shown = structuredClone(run);
  selectedUid = null;
  persist();
  dialog.close();
  announce('新的冒險開始。先招募一位角色，搭配你的主場。');
  render('shop-title');
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'close-dialog') { dialog.close(); return; }
  if (action === 'inspect') { details(button.dataset.id, button.dataset.uid); return; }
  if (action === 'rules') { rules(); return; }
  if (action === 'trait') {
    const trait = TRAITS.find(item => item.id === button.dataset.id);
    openModal(`<div class="rules-copy"><span class="overline">2／4 位不同上陣角色</span><h2 id="dialog-title">${esc(trait.name)}羈絆</h2><p>${esc(trait.description)}</p><p>備位、重複同角與召喚物不增加羈絆人數。</p></div>`);
    return;
  }
  if (action === 'restart') {
    if (run.phase === 'gameover') { newRun(); return; }
    openModal('<div class="confirm-dialog"><span class="overline">重新開始</span><h2 id="dialog-title">要結束這次冒險嗎？</h2><p>新的冒險會取代目前本機進度。</p><div><button class="secondary-button" data-action="close-dialog">保留這次進度</button><button class="primary-button" data-action="new-run">開始新的冒險</button></div></div>');
    return;
  }
  if (action === 'new-run') { newRun(); return; }
  if (action === 'skip') { stopPlayback(); shown = structuredClone(run); announce('已快轉動畫，這是本場結算結果。'); render('primary'); return; }
  if (action === 'section') { app.querySelector(button.dataset.section === 'shop' ? '.shop-section' : '.team-section')?.scrollIntoView({ block: 'start', behavior: 'instant' }); return; }
  if (busy) return;
  if (action === 'shop-scroll') { const rail = app.querySelector('.shop-rail'); rail?.scrollBy({ left: Number(button.dataset.direction) * rail.clientWidth * .85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); return; }
  if (action === 'open-reward') { showReward(); return; }
  if (action === 'reward') { dialog.close(); act(chooseTripleReward, Number(button.dataset.id)); return; }
  if (action === 'next') { selectedUid = null; act(nextRound); return; }
  if (!isRecruit()) return;
  if (run.pendingReward && ['buy', 'refresh', 'freeze', 'upgrade', 'combat'].includes(action)) return;
  if (action === 'buy') { act(buy, run.shop.offers.find(item => String(item.uid) === button.dataset.uid)?.uid); return; }
  if (action === 'refresh') { act(refreshShop); return; }
  if (action === 'freeze') { act(toggleFreeze); return; }
  if (action === 'upgrade') { act(upgradeTavern); return; }
  if (action === 'unselect') { selectedUid = null; announce('已取消選取。'); render(); return; }
  if (action === 'sell') { act(sell, selected()?.uid); return; }
  if (action === 'select') {
    const unit = unitList(run).find(item => String(item.uid) === button.dataset.uid);
    if (!unit) return;
    if (selectedUid && String(selectedUid) !== String(unit.uid)) {
      const zone = run.player.board.includes(unit) ? 'board' : 'bench';
      act(moveUnit, selected().uid, zone, run.player[zone].indexOf(unit));
    } else { selectedUid = String(selectedUid) === String(unit.uid) ? null : unit.uid; announce(selectedUid ? `已選${getCharacter(unit.cardId).region}，點目標席位調整。` : '已取消選取。'); render(); }
    return;
  }
  if (action === 'place' && selected()) { act(moveUnit, selected().uid, button.dataset.zone, Math.min(Number(button.dataset.index), run.player[button.dataset.zone].length)); return; }
  if (action === 'shift' && selected()) { const unit = selected(); const zone = shown.player.board.includes(unit) ? 'board' : 'bench'; act(moveUnit, unit.uid, zone, shown.player[zone].indexOf(unit) + Number(button.dataset.direction)); return; }
  if (action === 'transfer' && selected()) { const unit = selected(); const zone = shown.player.board.includes(unit) ? 'bench' : 'board'; act(moveUnit, unit.uid, zone, shown.player[zone].length); return; }
  if (action === 'combat') {
    selectedUid = null;
    if (!run.player.board.length) { announce('先把備位角色放上棋盤，才能開戰。'); render(); return; }
    act(startCombat);
  }
});
document.addEventListener('dragstart', event => {
  const card = event.target.closest('[data-drag-uid]');
  if (!card || !isRecruit()) { event.preventDefault(); return; }
  draggedUid = unitList(run).find(unit => String(unit.uid) === card.dataset.dragUid)?.uid;
  if (!draggedUid) return;
  selectedUid = draggedUid;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setDragImage?.(card, card.clientWidth / 2, card.clientHeight / 2);
  event.dataTransfer.setData('text/plain', String(draggedUid));
  card.classList.add('is-dragging');
});
function clearDrag() { draggedUid = null; app.querySelectorAll('.drag-target,.is-dragging').forEach(node => node.classList.remove('drag-target', 'is-dragging')); }
app.addEventListener('dragover', event => {
  const slot = event.target.closest('[data-drop-zone]');
  if (!slot || !draggedUid || busy || Number(slot.dataset.dropIndex) > run.player[slot.dataset.dropZone].length) return;
  if (Number(slot.dataset.dropIndex) === run.player[slot.dataset.dropZone].length && run.player[slot.dataset.dropZone].at(-1)?.uid === draggedUid) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  app.querySelectorAll('.drag-target').forEach(node => node.classList.remove('drag-target'));
  slot.classList.add('drag-target');
});
app.addEventListener('drop', event => {
  const slot = event.target.closest('[data-drop-zone]');
  if (!slot || !draggedUid || busy || Number(slot.dataset.dropIndex) > run.player[slot.dataset.dropZone].length) return;
  if (Number(slot.dataset.dropIndex) === run.player[slot.dataset.dropZone].length && run.player[slot.dataset.dropZone].at(-1)?.uid === draggedUid) return;
  event.preventDefault();
  const uid = draggedUid;
  clearDrag();
  act(moveUnit, uid, slot.dataset.dropZone, Math.min(Number(slot.dataset.dropIndex), run.player[slot.dataset.dropZone].length));
});
document.addEventListener('dragend', clearDrag);
document.addEventListener('error', event => {
  const image = event.target;
  if (image.matches?.('img[data-merchant]') && !image.dataset.fallback) { image.dataset.fallback = 'true'; image.src = imageUrl(14, true); return; }
  if (!image.matches?.('img[data-art-id]') || image.dataset.fallback) return;
  image.dataset.fallback = 'true';
  image.src = new URL(`../../characters/portrait-${String(Number(image.dataset.artId) === 101 ? 13 : image.dataset.artId).padStart(2, '0')}.png`, import.meta.url).href;
}, true);
document.addEventListener('scroll', event => { if (event.target.matches?.('.shop-rail')) updateShopControls(); }, true);
window.addEventListener('resize', updateShopControls);
document.addEventListener('toggle', event => { if (event.target.matches?.('.opponent-preview')) previewOpen = event.target.open; }, true);
dialog.addEventListener('close', () => { restoreFocus(returnFocus); });
if (loaded.status === 'empty') persist();
render(run.phase === 'recruit' ? 'shop-title' : 'primary');
installThemeBridge();
if (run.pendingReward) showReward();
