import { CARDS as CARDS24, DEFAULT_DECK as DEFAULT_DECK12, getCard } from './cards.js';
import { createGame, playCard, attack, endTurn } from './engine.js';
import { installThemeBridge } from './theme.js';

const BRAND_NAME = 'Card & TW ＆ Game';
const app = document.querySelector('#app');
const dialog = document.querySelector('#game-dialog');
const live = document.querySelector('#live-status');
let screen = 'home';
let deck = [...DEFAULT_DECK12];
let game = null;
let attacker = null;
let thinking = false;
let aiTimer = null;
let logOpen = false;
let tutorial = true;
let message = '';
let announcedWinner = null;
let focusBeforeDialog = null;
let animationTimer = null;
let attackedThisTurn = new Set();

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, label = '') => {
  const paths = {
    cards: '<rect x="5" y="3" width="13" height="18" rx="2"/><path d="m5 6-3 1 3 14M9 8h5m-5 4h5m-5 4h3"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    sword: '<path d="m5 19 3-3m-3-3 6 6m-3-6L18 3l3 3-10 10M4 20l-1 1"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/>',
    star: '<path d="m12 2 2.5 7 7.5 3-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-3L12 2Z"/>',
    back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
  };
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${escape(label)}"` : 'aria-hidden="true"'}>${paths[name] || paths.star}</svg>`;
};
const busy = () => !game || thinking || game.turn !== 'player' || Boolean(game.winner);
const keywords = card => (card.keywords || []).map(word => `<span class="keyword ${escape(word)}">${icon(word === 'guard' ? 'shield' : 'star')}${word === 'guard' ? '守護' : '快攻'}</span>`).join('');
const art = card => {
  if (card.id === 101) return `background-position:${(card.artX / (1448 - 143) * 100).toFixed(4)}% ${(card.artY / (1086 - 170) * 100).toFixed(4)}%`;
  const sheet = String(Math.floor((card.id - 1) / 6) + 1).padStart(2, '0');
  const cell = (card.id - 1) % 6;
  const source = new URL(`../../characters/regions-${sheet}.png`, import.meta.url).href;
  return `--character-art:url('${source}');--art-x:${cell % 3 * 50}%;--art-y:${Math.floor(cell / 3) * 100}%`;
};
const portrait = card => card.id <= 24
  ? `<img class="card-portrait" src="${escape(new URL(`../../characters/portrait-${String(card.id).padStart(2, '0')}.png`, import.meta.url).href)}" width="1024" height="1536" alt="" loading="lazy" decoding="async" draggable="false">`
  : '';

function cardView(card, options = {}) {
  const { mode = 'collection', uid = '', unit = null, selected = false, disabled = false, reason = '', target = false, action = 'inspect', detail = true, enemy = false } = options;
  const combat = unit || card;
  const health = unit ? unit.hp : card.health;
  const stateLabel = mode === 'board' && unit ? (enemy ? '對手角色' : unit.ready ? '可攻擊' : (attackedThisTurn.has(unit.uid) ? '已攻擊' : '召喚等待')) : '';
  const actionLabel = ({ inspect: '查看詳情', 'toggle-card': selected ? '從牌組移除' : '加入牌組', 'play-card': '出牌', 'select-attacker': '選擇攻擊角色', 'attack-card': '攻擊此角色' })[action] || '';
  const classes = ['card', `card-${mode}`, selected ? 'is-selected' : '', target ? 'is-target' : '', disabled ? 'is-disabled' : '', (card.keywords || []).includes('guard') ? 'has-guard' : ''].filter(Boolean).join(' ');
  return `<div class="${classes}" data-card-uid="${escape(uid)}">
    <button class="card-main" type="button" data-action="${action}" data-id="${card.id}" data-uid="${escape(uid)}" ${disabled ? 'disabled' : ''} ${mode === 'collection' ? `aria-pressed="${selected}"` : ''} aria-label="${escape(`${card.region}，${actionLabel}，${card.job}，${card.cost}費，${combat.attack}攻擊，${health}生命。${card.description}${reason ? `。${reason}` : ''}`)}" title="${escape(reason || card.quote)}">
      <span class="card-top"><span class="cost" aria-label="${card.cost}費">${card.cost}</span><span class="card-region">${escape(card.region)}</span><span class="card-index">${String(card.id).padStart(2, '0')}</span></span>
      <span class="card-art${card.id <= 24 ? ' card-art-regional' : ''}" style="${art(card)}" role="img" aria-label="${escape(`${card.region} ${card.job}角色插圖`)}">${portrait(card)}</span>
      <span class="card-body"><strong class="card-job">${escape(card.job)}</strong><span class="keywords">${keywords(card)}</span><span class="card-skill">${escape(card.description)}</span></span>
      <span class="card-stats"><span class="stat attack-stat">${icon('sword')}<b>${combat.attack}</b></span><span class="card-set">島嶼守護者</span><span class="stat health-stat ${unit && unit.hp < unit.maxHp ? 'is-hurt' : ''}">${icon('heart')}<b>${health}</b></span></span>
      ${mode === 'collection' && selected ? `<span class="selected-ribbon">${icon('check')}已加入</span>` : ''}
      ${stateLabel ? `<span class="board-state ${unit.ready ? 'ready' : ''}">${stateLabel}</span>` : ''}
    </button>
    ${detail ? `<button class="card-info" type="button" data-action="inspect" data-id="${card.id}" aria-label="查看${escape(card.region)}卡牌詳情" title="角色台詞與技能">${icon('info')}</button>` : ''}
    ${mode === 'hand' && disabled && reason ? `<span class="card-reason">${escape(reason)}</span>` : ''}
  </div>`;
}

function header(inBattle = false) {
  return `<header class="site-header"><button class="brand" data-action="home" aria-label="${escape(BRAND_NAME)}主選單"><span class="brand-seal">島</span><span class="brand-name">${escape(BRAND_NAME)}<small>臺灣地域卡牌</small></span></button><nav aria-label="主要選單">${screen !== 'home' ? `<button class="quiet-button" data-action="home">${icon('back')}<span>主選單</span></button>` : '<span class="header-note">把日常，打成一場冒險。</span>'}<button class="quiet-button" data-action="rules">${icon('info')}<span>玩法說明</span></button>${inBattle ? '<span class="round-chip">回合 ' + game.round + '</span>' : ''}</nav></header>`;
}

function homeView() {
  const showcase = [1, 4, 10, 16, 20].map((id, index) => `<div class="fan-position fan-${index}">${cardView(getCard(id), { mode: 'showcase', detail: false })}</div>`).join('');
  return `${header()}<main class="home-page"><section class="hero-copy"><p class="eyebrow"><span></span> 生活圈的傳說，由你出牌</p><h1 class="game-brand-title">${escape(BRAND_NAME)}</h1><p class="hero-tagline">24 個地區，打出你的主場。</p><p class="hero-description">從24位臺灣地域角色中，選12張組成牌組。<br>運用4個戰場席位，出牌、攻擊，挑戰電腦對手。</p><div class="hero-actions"><button id="start-battle" class="button button-primary start-button" data-action="start" ${deck.length !== 12 ? 'disabled' : ''}>${icon('cards')}開始對戰${icon('arrow')}</button><button class="button button-outline" data-action="deck">編輯牌組<span class="deck-count">${deck.length}/12</span></button></div><p class="ready-note"><span class="tiny-dot"></span>${deck.length === 12 ? '牌組已備妥 · 點擊即玩，挑戰電腦對手' : '請先選滿12張不重複角色'}</p></section><section class="hero-showcase" aria-label="島嶼角色卡牌"><div class="compass-ring"></div><div class="showcase-top">每一張牌，都有一個地方的個性。</div><div class="card-fan">${showcase}</div><div class="showcase-bottom"><span>24 位原創角色</span><i>✦</i><span>你的 12 張主場陣容</span></div></section><section class="home-rules" aria-label="玩法一覽"><div><span class="rule-number">01</span><p><strong>集結你的主場</strong><span>24 選 12，組出獨一無二的陣容。</span></p></div><div><span class="rule-number">02</span><p><strong>每點費用，都有意思</strong><span>出牌、進場技能，決定出手時機。</span></p></div><div><span class="rule-number">03</span><p><strong>四個席位，一場對決</strong><span>攻擊對方英雄，將生命降至 0。</span></p></div></section></main><footer class="home-footer"><span>把熟悉的日常，變成下一手好牌。</span><span>台灣地域原創卡牌 · 單人策略對戰</span></footer>`;
}

function deckView() {
  return `${header()}<main class="deck-page"><div class="page-heading"><div><p class="eyebrow">你的主場陣容</p><h1>組出你的主場</h1><p>從 24 位地域角色中，選出 12 位並肩作戰。</p></div><span class="selection-count">已選 <strong>${deck.length}</strong> / 12</span></div><p class="selection-help">點卡片加入或移除，ⓘ 查看技能與角色台詞。<span>${escape(message)}</span></p><div class="collection">${CARDS24.map(card => cardView(card, { selected: deck.includes(card.id), action: 'toggle-card' })).join('')}</div><div class="deck-toolbar"><span class="deck-progress" aria-label="已選${deck.length}張，共需12張"><span style="width:${deck.length / 12 * 100}%"></span></span><div class="deck-toolbar-inner"><strong>已選 ${deck.length}<span> / 12</span></strong><div class="deck-secondary"><button class="quiet-button" data-action="clear-deck">清空</button><button class="quiet-button" data-action="default-deck">預設牌組</button></div><button class="button button-primary" data-action="finish-deck" ${deck.length !== 12 ? 'disabled title="需選滿12張角色"' : ''}>完成${icon('check')}</button></div></div></main>`;
}

function heroView(sideName) {
  const side = game.players[sideName];
  const visibleHp = Math.max(0, side.hp);
  const enemy = sideName === 'enemy';
  const guarded = game.players.enemy.board.some(unit => getCard(unit.cardId).keywords.includes('guard'));
  const target = enemy && attacker && !guarded && !busy();
  return `<div class="hero-player ${enemy ? 'enemy' : 'player'} ${target ? 'is-target' : ''}" data-hero="${sideName}"><button class="hero-emblem" ${target ? 'data-action="attack-hero"' : 'disabled'} aria-label="${enemy ? '對手' : '我方'}英雄，${visibleHp}生命${target ? '，點擊攻擊' : ''}">${icon(enemy ? 'shield' : 'star')}</button><div class="hero-name"><strong>${enemy ? '島嶼挑戰者' : '你的主場'}<span>${enemy ? '電腦對手' : '我方玩家'}</span></strong><div class="hero-health"><span>${icon('heart')}<b>${visibleHp}</b><small> / ${side.maxHp}</small></span><span class="health-track"><i style="width:${visibleHp / side.maxHp * 100}%"></i></span></div></div><div class="hero-resources">${enemy ? `<span>${icon('cards')}手牌 <b>${side.hand.length}</b></span><span>牌庫 <b>${side.deck.length}</b></span>` : `<span class="mana-label">可用費用 <strong>${side.mana}<small> / ${side.maxMana}</small></strong></span><span class="mana-gems" aria-label="${side.mana}點可用費用">${Array.from({ length: side.maxMana }, (_, index) => `<i class="${index < side.mana ? 'filled' : ''}"></i>`).join('')}</span>`}</div></div>`;
}

function boardView(sideName) {
  const side = game.players[sideName];
  const enemy = sideName === 'enemy';
  const guarded = game.players.enemy.board.some(unit => getCard(unit.cardId).keywords.includes('guard'));
  const cards = side.board.map(unit => {
    const card = getCard(unit.cardId);
    const target = enemy && attacker && !busy() && (!guarded || card.keywords.includes('guard'));
    const disabled = enemy ? !target : busy() || !unit.ready;
    const reason = enemy ? (guarded && !card.keywords.includes('guard') ? '先攻擊守護角色' : attacker ? '' : '先選擇可攻擊的己方角色') : busy() ? '目前無法操作' : !unit.ready ? '本回合無法攻擊，等待下回合' : '點擊選擇攻擊目標';
    return cardView(card, { mode: 'board', uid: unit.uid, unit, selected: attacker === unit.uid, disabled, reason, target, enemy, action: enemy ? 'attack-card' : 'select-attacker' });
  });
  for (let index = cards.length; index < 4; index++) cards.push(`<div class="empty-slot" aria-label="空席位"><span>✦</span><small>${enemy ? '對手席位' : '等待登場'}</small></div>`);
  return `<div class="board-row ${sideName}-board" aria-label="${enemy ? '對手' : '己方'}戰場">${cards.join('')}</div>`;
}

function battleView() {
  const player = game.players.player;
  const guard = game.players.enemy.board.some(unit => getCard(unit.cardId).keywords.includes('guard'));
  const turnText = game.winner ? game.winner === 'player' ? '你的主場，贏了！' : game.winner === 'draw' ? '勢均力敵 · 平手' : '這回合，先記住。' : thinking ? '對手思考中…' : attacker ? guard ? '對手有守護：請選擇守護角色' : '選擇敵方角色或英雄，發動攻擊' : '你的回合 · 點手牌出牌，點己方角色攻擊';
  return `${header(true)}<main class="battle-page">${tutorial ? `<div class="tutorial"><span>${icon('info')}花費用出牌 → 點己方角色 → 點對手攻擊。新角色需等待一回合。</span><button data-action="dismiss-tip" aria-label="關閉操作提示">${icon('close')}</button></div>` : ''}<section class="battlefield" aria-label="對戰桌面">${heroView('enemy')}${boardView('enemy')}<div class="battle-divider"><span></span><b>${thinking ? '<i class="thinking-dot"></i> 對手回合' : '✦ 第 ' + game.round + ' 回合 ✦'}</b><span></span></div>${boardView('player')}${heroView('player')}</section><section class="turn-controls" aria-label="回合操作"><div class="turn-guidance"><strong>${escape(turnText)}</strong><span class="action-message">${escape(message || (guard ? '守護角色在場時，需優先攻擊守護。' : '每位角色每回合可攻擊一次。'))}</span></div>${attacker && !busy() ? '<button class="quiet-button cancel-attack" data-action="cancel-attack">取消選取</button>' : ''}<button id="end-turn" class="button button-primary end-turn" data-action="end-turn" ${busy() ? 'disabled' : ''}>${thinking ? '對手思考中' : game.winner ? '對戰結束' : '結束回合'}${icon('arrow')}</button></section><section class="hand-area" aria-label="你的手牌"><div class="hand-heading"><strong>你的手牌 <span>${player.hand.length} / 8</span></strong><span>牌庫 ${player.deck.length} 張${player.fatigue ? ` · 疲勞 ${player.fatigue}` : ''}</span></div><div class="hand-scroll"><div class="hand-cards">${player.hand.map(item => { const card = getCard(item.cardId); const reason = busy() ? thinking ? '對手回合' : '無法出牌' : player.board.length >= 4 ? '戰場已滿' : card.cost > player.mana ? `還缺 ${card.cost - player.mana} 費` : ''; return cardView(card, { mode: 'hand', uid: item.uid, action: 'play-card', disabled: Boolean(reason), reason }); }).join('') || '<p class="empty-hand">手牌已用盡。結束回合，等待下一張好牌。</p>'}</div></div></section><details class="battle-log" ${logOpen ? 'open' : ''}><summary>戰鬥紀錄<span>${escape(game.log.at(-1) || '對戰開始')}</span></summary><ol>${game.log.slice(-10).reverse().map(entry => `<li>${escape(entry)}</li>`).join('')}</ol></details><div class="battle-bottom"><button class="quiet-button" data-action="restart">重新開始</button>${game.winner ? '<button class="quiet-button" data-action="result">查看對戰結果</button>' : '<span>12 張牌 · 4 個席位 · 一個主場</span>'}</div></main>`;
}

function render() {
  const scroll = document.querySelector('.hand-scroll')?.scrollLeft || 0;
  app.innerHTML = screen === 'home' ? homeView() : screen === 'deck' ? deckView() : battleView();
  const handScroll = document.querySelector('.hand-scroll');
  if (handScroll) handScroll.scrollLeft = scroll;
  if (game?.winner && screen === 'battle' && announcedWinner !== game.winner) {
    announcedWinner = game.winner;
    showResult();
  }
}

function announce(text) {
  message = text;
  live.textContent = text;
}

function cancelPending() {
  clearTimeout(aiTimer);
  clearTimeout(animationTimer);
  aiTimer = null;
  thinking = false;
  attacker = null;
}

function changeScreen(next) {
  cancelPending();
  closeModal();
  screen = next;
  message = '';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function startGame() {
  if (deck.length !== 12) { announce('請選滿12張角色再開始。'); changeScreen('deck'); return; }
  cancelPending();
  closeModal();
  game = createGame([...deck]);
  attackedThisTurn = new Set();
  announcedWinner = null;
  message = '你的主場已就位。試著打出第一張牌。';
  screen = 'battle';
  render();
  live.textContent = '對戰開始，輪到你出牌。';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showModal(content) {
  focusBeforeDialog = document.activeElement;
  dialog.innerHTML = `<button class="dialog-close" data-action="close-dialog" aria-label="關閉對話框">${icon('close')}</button>${content}`;
  if (!dialog.open) dialog.showModal();
}

function closeModal() {
  if (dialog.open) dialog.close();
}

function showDetails(id) {
  const card = getCard(Number(id));
  if (!card) return;
  showModal(`<div class="card-detail"><div class="detail-portrait"><span class="card-art${card.id <= 24 ? ' card-art-regional' : ''}" style="${art(card)}" role="img" aria-label="${escape(card.job)}">${portrait(card)}</span><span class="detail-region">${escape(card.region)}</span></div><div class="detail-copy"><p class="eyebrow">${escape(card.zone || '島嶼守護者')}</p><h2 id="dialog-title">${escape(card.job)}</h2><blockquote>「${escape(card.quote)}」</blockquote><div class="detail-stats"><span><b>${card.cost}</b>費用</span><span><b>${card.attack}</b>攻擊</span><span><b>${card.health}</b>生命</span></div><div class="keywords">${keywords(card)}</div><p class="detail-skill">${escape(card.description)}</p>${card.keywords.includes('guard') ? '<p class="detail-note">守護：敵人必須優先攻擊有守護的角色。</p>' : ''}${card.keywords.includes('rush') ? '<p class="detail-note">快攻：進場當回合即可攻擊。</p>' : '<p class="detail-note">進場後等待一回合，每回合可攻擊一次。</p>'}</div></div>`);
}

function showRules() {
  showModal(`<div class="rules-dialog"><p class="eyebrow">玩法說明</p><h2 id="dialog-title">三分鐘，認識你的主場。</h2><p class="rules-intro">讓對方英雄生命歸零，你就贏了。</p><ol class="rules-list"><li><strong>12 張牌，24 點生命</strong><p>雙方各有12張不重複角色、24生命。起手5張牌與3點費用，手牌最多8張，戰場最多4位角色。</p></li><li><strong>出牌，發揮角色技能</strong><p>點擊手牌，支付卡片左上角的費用即可出牌。進場技能立即自動結算；卡片底部顯示攻擊力與生命。</p></li><li><strong>選角色，再選攻擊目標</strong><p>新進場角色需等到下回合才能攻擊；有「快攻」即可立即攻擊。點己方可攻擊角色，再點對手角色或英雄。每位角色每回合只攻擊一次。</p></li><li><strong>守住四席，安排攻擊</strong><p>角色互相攻擊時，同時造成各自攻擊力的傷害。對手有「守護」角色時，必須先攻擊守護。</p></li><li><strong>換回合，新的機會</strong><p>點「結束回合」讓對手行動。每個己方新回合，費用上限增加1（最高8）並補滿，同時抽1張牌。牌庫抽空後，繼續抽牌會受到逐次累加的疲勞傷害。</p></li></ol><button class="button button-primary" data-action="close-dialog">準備好了${icon('check')}</button></div>`);
}

function showResult() {
  if (!game?.winner) return;
  const won = game.winner === 'player';
  const draw = game.winner === 'draw';
  showModal(`<div class="result-dialog"><div class="result-emblem">${icon(won ? 'star' : 'shield')}</div><p class="eyebrow">${won ? '主場勝利' : draw ? '勢均力敵' : '下次見真章'}</p><h2 id="dialog-title">${won ? '這座島，站在你這邊。' : draw ? '精彩對決，不分上下。' : '換個陣容，再來一場。'}</h2><p>第 ${game.round} 回合結束 · 你的生命 ${Math.max(0, game.players.player.hp)} / 24</p><div class="result-actions"><button class="button button-primary" data-action="restart">再戰一場${icon('arrow')}</button><button class="button button-outline" data-action="deck">回到牌組</button></div></div>`);
}

function uidFrom(target, list) {
  return list.find(item => String(item.uid) === target.dataset.uid)?.uid;
}

function hitAnimation(uid, hero = false) {
  const element = hero ? document.querySelector('[data-hero="enemy"]') : [...document.querySelectorAll('[data-card-uid]')].find(node => node.dataset.cardUid === String(uid));
  element?.classList.add('was-hit');
  animationTimer = setTimeout(() => element?.classList.remove('was-hit'), 450);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'close-dialog') { closeModal(); return; }
  if (action === 'inspect') { showDetails(button.dataset.id); return; }
  if (action === 'rules') { showRules(); return; }
  if (action === 'home') { changeScreen('home'); return; }
  if (action === 'deck') { if (screen !== 'battle' || game?.winner) changeScreen('deck'); return; }
  if (action === 'start' || action === 'restart') { startGame(); return; }
  if (action === 'result') { showResult(); return; }
  if (action === 'toggle-card' && screen === 'deck') {
    const id = Number(button.dataset.id);
    if (deck.includes(id)) deck = deck.filter(cardId => cardId !== id);
    else if (deck.length < 12) deck.push(id);
    else { announce('牌組已滿12張，先移除一位角色。'); render(); return; }
    announce(`已選 ${deck.length} / 12 張。`);
    render();
    document.querySelector(`[data-action="toggle-card"][data-id="${id}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'clear-deck' && screen === 'deck') { deck = []; announce('已清空牌組。'); render(); return; }
  if (action === 'default-deck' && screen === 'deck') { deck = [...DEFAULT_DECK12]; announce('已恢復預設12張牌組。'); render(); return; }
  if (action === 'finish-deck' && deck.length === 12) { changeScreen('home'); return; }
  if (action === 'dismiss-tip') { tutorial = false; render(); return; }
  if (screen !== 'battle' || busy()) return;
  if (action === 'cancel-attack') { attacker = null; announce('已取消選取。'); render(); return; }
  if (action === 'select-attacker') {
    const uid = uidFrom(button, game.players.player.board);
    attacker = attacker === uid ? null : uid;
    announce(attacker ? '已選擇角色，請點擊發光的敵方目標。' : '已取消選取。');
    render();
    return;
  }
  if (action === 'play-card') {
    const result = playCard(game, uidFrom(button, game.players.player.hand));
    announce(result.message || (result.ok ? '角色已登場。' : '目前無法出牌。'));
    attacker = null;
    render();
    return;
  }
  if ((action === 'attack-card' || action === 'attack-hero') && attacker) {
    const target = action === 'attack-hero' ? 'hero' : uidFrom(button, game.players.enemy.board);
    const result = attack(game, attacker, target);
    if (result.ok) { attackedThisTurn.add(attacker); attacker = null; }
    announce(result.message || (result.ok ? '攻擊完成。' : '目前無法攻擊。'));
    render();
    if (result.ok) hitAnimation(target, target === 'hero');
    return;
  }
  if (action === 'end-turn') {
    attacker = null;
    thinking = true;
    announce('對手思考中…');
    render();
    const currentGame = game;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (game !== currentGame || screen !== 'battle') return;
      const previousHp = game.players.player.hp;
      const result = endTurn(game);
      attackedThisTurn.clear();
      thinking = false;
      announce(result.message || '輪到你了：費用已補滿，抽取一張牌。');
      render();
      if (game.players.player.hp < previousHp) document.querySelector('[data-hero="player"]')?.classList.add('was-hit');
    }, 650);
  }
});

document.addEventListener('load', event => {
  if (event.target.matches?.('.card-portrait')) event.target.parentElement.classList.add('has-portrait');
}, true);
document.addEventListener('toggle', event => {
  if (event.target.matches?.('.battle-log')) logOpen = event.target.open;
}, true);
dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeModal(); } });
dialog.addEventListener('close', () => { if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dialog.open && attacker) { attacker = null; announce('已取消選取。'); render(); } });
render();
installThemeBridge();
