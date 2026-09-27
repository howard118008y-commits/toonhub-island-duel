import { getCharacter as getCard, EVOLUTIONS } from './roster.js';
import { characterVoice } from './voices.js';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_MOVE = 'cubic-bezier(0.77, 0, 0.175, 1)';
const IMPACT_MS = 350;
const CHARGE_MS = 850;
const MAX_EFFECTS = 32;
const MAX_ANIMATIONS = 72;
const keyOf = entity => `${entity.side}:${entity.kind}:${entity.kind === 'hero' ? '' : entity.uid}`;
const bounds = element => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

export function createBattleEffects({ root }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const layer = doc.createElement('div');
  layer.className = 'battle-effects';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  doc.body.append(layer);
  const items = new Set();
  const animations = new Set();
  const timers = new Set();
  const waiters = new Map();
  let repositionFrame = null;
  let generation = 0;
  let chargeEndsAt = 0;
  const now = () => win.performance?.now?.() ?? Date.now();

  function capture() {
    const frame = { entities: new Map(), slots: new Map(), energy: new Map() };
    for (const side of ['player', 'enemy']) {
      const hero = root.querySelector(`[data-hero="${side}"]`);
      if (hero) {
        frame.entities.set(keyOf({ side, kind: 'hero' }), {
          rect: bounds(hero.querySelector('.hero-health') || hero),
          element: hero.querySelector('.hero-emblem') || hero,
        });
        const energy = root.querySelector(`[data-gold="${side}"]`);
        if (energy) frame.energy.set(side, { rect: bounds(energy), element: energy });
      }
      for (const zone of ['board', 'bench']) {
        const board = root.querySelector(`.${side}-${zone}`);
        if (!board || !bounds(board).width) continue;
        frame.slots.set(`${side}:${zone}`, Array.from(board.children, element => bounds(element)));
        board.querySelectorAll('[data-card-uid]').forEach((element, slot) => {
          const rect = bounds(element);
          if (!rect.width || !rect.height) return;
          frame.entities.set(keyOf({ side, kind: 'card', uid: element.dataset.cardUid }), {
            rect, element, slot,
            cardId: Number(element.querySelector('[data-id]')?.dataset.id),
          });
        });
      }
    }
    return frame;
  }

  function anchor(entity, frame, energy = false) {
    if (!entity) return null;
    if (energy && frame.energy.has(entity.side)) return frame.energy.get(entity.side);
    const exact = frame.entities.get(keyOf(entity));
    if (exact) return exact;
    const slot = frame.slots.get(`${entity.side}:${entity.zone || 'board'}`)?.[entity.slot];
    if (slot) return { rect: slot, element: null };
    return null;
  }

  function later(callback, delay) {
    const scheduledGeneration = generation;
    const timer = win.setTimeout(() => { timers.delete(timer); if (scheduledGeneration === generation) callback(); }, delay);
    timers.add(timer);
    return timer;
  }

  function motion(element, frames, duration, easing = EASE_OUT) {
    if (!element?.animate) return null;
    try {
      if (animations.size >= MAX_ANIMATIONS) {
        const oldest = animations.values().next().value;
        try { oldest.cancel(); } catch { /* The deadline still releases the visual. */ }
        animations.delete(oldest);
      }
      const animation = element.animate(frames, { duration, easing });
      animations.add(animation);
      Promise.resolve(animation.finished).then(() => animations.delete(animation), () => animations.delete(animation));
      return animation;
    } catch { return null; }
  }

  function register(item) {
    while (items.size >= MAX_EFFECTS) remove([...items].find(existing => existing.kind !== 'ghost') || items.values().next().value);
    layer.append(item.node);
    items.add(item);
    return item;
  }

  function wait(duration) {
    if (duration <= 0) return Promise.resolve();
    return new Promise(resolve => {
      const timer = later(() => { waiters.delete(timer); resolve(); }, duration);
      waiters.set(timer, resolve);
    });
  }

  function remove(item) {
    if (!items.has(item)) return;
    for (const timer of item.timers) { win.clearTimeout(timer); timers.delete(timer); }
    let attached = [];
    try { attached = item.node.getAnimations?.({ subtree: true }) || []; } catch { /* Older engines may not support subtree lookup. */ }
    for (const animation of attached) {
      try { animation.cancel(); } catch { /* Removing the node is the visual fallback. */ }
      animations.delete(animation);
    }
    for (const [element, visibility] of item.hidden || []) element.style.visibility = visibility;
    item.hidden?.clear();
    item.node.remove();
    items.delete(item);
  }

  function sync() {
    const frame = capture();
    for (const item of items) {
      if (item.kind === 'evolution') continue;
      const located = frame.entities.get(keyOf(item.entity));
      // A vacated slot may already belong to a summon; effects follow the UID.
      if (item.entity.kind === 'card' && !located) { remove(item); continue; }
      if (item.kind !== 'ghost') {
        if (item.kind === 'outline' && located) {
          Object.assign(item.node.style, {
            left: `${located.rect.left}px`, top: `${located.rect.top}px`,
            width: `${located.rect.width}px`, height: `${located.rect.height}px`,
          });
        } else if (item.kind === 'burst' && located) {
          Object.assign(item.node.style, {
            left: `${located.rect.left + located.rect.width / 2}px`,
            top: `${located.rect.top + located.rect.height * .45}px`,
          });
        } else position(item, frame);
        continue;
      }
      const element = located?.element;
      if (!element) continue;
      for (const [old, visibility] of item.hidden) {
        if (old !== element) { old.style.visibility = visibility; item.hidden.delete(old); }
      }
      if (!item.hidden.has(element)) item.hidden.set(element, element.style.visibility || '');
      element.style.visibility = 'hidden';
      for (const selector of ['.attack-stat', '.health-stat']) {
        const current = element.querySelector(selector);
        const displayed = item.node.querySelector(selector);
        if (current && displayed) {
          displayed.className = current.className;
          const currentValue = current.querySelector('b');
          const displayedValue = displayed.querySelector('b');
          if (currentValue && displayedValue) displayedValue.textContent = currentValue.textContent;
        }
      }
    }
  }

  function position(item, frame) {
    const located = anchor(item.entity, frame, item.energy);
    if (!located) return;
    const rect = located.rect;
    const width = item.node.offsetWidth;
    const height = item.node.offsetHeight;
    const viewportWidth = doc.documentElement.clientWidth || win.innerWidth;
    const viewportHeight = win.innerHeight;
    const clampX = value => Math.max(8, Math.min(value, viewportWidth - width - 8));
    const clampY = value => Math.max(8, Math.min(value, viewportHeight - height - 8));
    let x = clampX(rect.left + (rect.width - width) / 2);
    let y = clampY(item.kind === 'gold' && item.energy ? rect.top - height - 8 : rect.top + (rect.height - height) / 2 - 10);
    const centered = ['damage', 'heal', 'buff', 'guard'].includes(item.kind);
    if (!centered) {
      const occupied = [...items].filter(other => other !== item && other.placed);
      const clear = (left, top) => occupied.every(other =>
        left + width + 6 <= other.placed.left || left >= other.placed.right + 6 ||
        top + height + 6 <= other.placed.top || top >= other.placed.bottom + 6);
      const candidates = item.kind === 'gold' ? [y, y - height - 7] : item.kind === 'speech'
        ? [rect.top - height - 9, rect.top + rect.height + 9, rect.top - height * 2 - 16, rect.top + rect.height + height + 16]
        : [y, y - height - 7, y + height + 7, y - (height + 7) * 2, y + (height + 7) * 2];
      const positions = candidates.map(top => [x, clampY(top)]);
      const free = positions.find(([left, top]) => clear(left, top));
      if (free) [x, y] = free;
      else {
        const blocker = occupied.find(other => positions.some(([left, top]) =>
          left < other.placed.right + 6 && left + width + 6 > other.placed.left &&
          top < other.placed.bottom + 6 && top + height + 6 > other.placed.top));
        if (blocker && !['damage', 'heal', 'buff', 'guard'].includes(blocker.kind)) { remove(blocker); return position(item, frame); }
        else if (blocker) { remove(item); return; }
      }
    } else if (item.kind === 'guard') y = clampY(rect.top + rect.height / 2 - height / 2);
    item.node.style.left = `${x}px`;
    item.node.style.top = `${y}px`;
    item.placed = { left: x, top: y, right: x + width, bottom: y + height };
    if (centered) {
      for (const other of [...items]) {
        if (other.kind !== 'speech' || !other.placed) continue;
        if (x < other.placed.right + 6 && x + width + 6 > other.placed.left && y < other.placed.bottom + 6 && y + height + 6 > other.placed.top) remove(other);
      }
    }
  }

  function popup(text, kind, entity, frame, { energy = false, life = 1100, stats = null } = {}) {
    if (!anchor(entity, frame, energy)) return;
    const central = ['damage', 'heal', 'buff', 'guard'];
    if (kind === 'gold' || central.includes(kind)) {
      [...items].filter(item => (kind === 'gold' ? item.kind === 'gold' : central.includes(item.kind)) && keyOf(item.entity) === keyOf(entity)).forEach(remove);
    }
    const node = doc.createElement('div');
    node.className = `battle-fx-popup battle-fx-${kind}`;
    node.dataset.effect = kind;
    node.dataset.side = entity.side;
    if (entity.kind === 'hero') node.dataset.hero = 'true';
    if (entity.uid !== undefined) node.dataset.effectUid = String(entity.uid);
    node.textContent = text;
    if (kind === 'buff' && stats) {
      if (stats.attack) node.dataset.buffAttack = `${stats.attack > 0 ? '+' : '−'}${Math.abs(stats.attack)} 攻`;
      if (stats.hp) node.dataset.buffHealth = `${stats.hp > 0 ? '+' : '−'}${Math.abs(stats.hp)} 血`;
      const width = anchor(entity, frame)?.rect.width;
      if (width) node.style.width = `${Math.max(48, Math.min(106, width - 4))}px`;
    }
    const item = register({ node, kind, entity, energy, timers: [], placed: null });
    position(item, frame);
    if (!items.has(item)) return;
    const reduce = reducedMotion.matches || kind === 'gold';
    motion(node, reduce ? [{ opacity: 0 }, { opacity: 1 }] : kind === 'damage' ? [
      { opacity: 0, transform: 'translateY(5px) scale(.9)' },
      { opacity: 1, transform: 'translateY(0) scale(1.14)', offset: .45 },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ] : [{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], 200);
    item.timers.push(later(() => motion(node, reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-10px)' }], 180), life - 180));
    item.timers.push(later(() => remove(item), life));
    return item;
  }

  function speak(entity, kind, frame) {
    if (entity?.kind !== 'card' || !entity.cardId) return;
    const previous = [...items].filter(item => item.kind === 'speech' && keyOf(item.entity) === keyOf(entity));
    if (kind === 'hurt' && previous.length) return;
    previous.forEach(remove);
    const card = getCard(entity.cardId);
    const text = characterVoice(entity.cardId, kind);
    if (!text) return;
    const item = popup(`${card?.region || '角色'}：${text}`, 'speech', entity, frame, { life: 1200 });
    if (item) item.node.dataset.voice = kind;
  }

  function pulseStat(entity, field, frame) {
    const card = anchor(entity, frame)?.element;
    const ghost = [...items].find(item => item.kind === 'ghost' && keyOf(item.entity) === keyOf(entity))?.node;
    const selector = field === 'attack' ? '.attack-stat' : '.health-stat';
    for (const element of [card?.querySelector(selector), ghost?.querySelector(selector)].filter(Boolean)) {
      motion(element, reducedMotion.matches ? [{ opacity: .65 }, { opacity: 1 }] : [
        { transform: 'scale(1)' }, { transform: 'scale(1.26)', offset: .35 }, { transform: 'scale(1)' },
      ], 260);
    }
  }

  function evolution(step, frame) {
    const change = step.evolution || { from: 0, to: 1, consumedUids: [] };
    const rank = EVOLUTIONS[change.to] || EVOLUTIONS[1];
    const card = getCard(step.target?.cardId || step.actor?.cardId);
    const target = step.target || step.actor;
    const before = change.before || { attack: card?.attack || 0, hp: card?.health || 0 };
    const after = change.after || { attack: (card?.attack || 0) * rank.multiplier, hp: (card?.health || 0) * rank.multiplier };
    const table = root.querySelector('.table-framework');
    const area = table ? bounds(table) : { left: 0, top: 0, width: win.innerWidth, height: win.innerHeight };
    const width = Math.min(286, area.width - 24);
    const left = Math.max(12, area.left + (area.width - width) / 2);
    const top = Math.max(72, Math.min(area.top + area.height * .4 - 92, win.innerHeight - 268));
    const node = doc.createElement('div');
    node.className = `battle-fx-evolution is-${rank.key}`;
    node.dataset.effect = 'evolution';
    node.dataset.evolution = String(change.to);
    Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${width}px` });
    const item = register({ node, kind: 'evolution', entity: target, timers: [] });
    const label = doc.createElement('span'); label.className = 'evolution-caption'; label.textContent = change.from === 0 ? '三合一・進化' : '同名共鳴・進化'; node.append(label);
    const name = doc.createElement('strong'); name.className = 'evolution-name'; name.textContent = `${card?.region || '角色'}・${rank.name}`; node.append(name);
    const values = doc.createElement('div'); values.className = 'evolution-values'; node.append(values);
    for (const [field, title] of [['attack', '攻擊'], ['hp', '生命']]) {
      const value = doc.createElement('span'); value.className = `evolution-${field}`;
      const small = doc.createElement('small'); small.textContent = title; value.append(small);
      const old = doc.createElement('span'); old.className = 'evolution-before'; old.textContent = String(before[field]); value.append(old);
      const arrow = doc.createElement('span'); arrow.className = 'evolution-arrow'; arrow.textContent = '→'; value.append(arrow);
      const next = doc.createElement('b'); next.className = 'evolution-after'; next.textContent = String(after[field]); value.append(next);
      values.append(value);
    }
    const note = doc.createElement('small'); note.className = 'evolution-note'; note.textContent = change.from === 0 ? '金卡完成，還可選一位免費夥伴' : change.to === 3 ? '傳說完成，能力已達最高進化' : '再融合一張同名普通卡，可進化傳說'; node.append(note);
    const reveal = reducedMotion.matches ? 0 : 340;
    const materials = change.from > 0 ? [target.uid, ...(change.consumedUids || [])] : change.consumedUids || [];
    for (const uid of reducedMotion.matches ? [] : materials.slice(0, 3)) {
      // A newly bought material has not occupied a board slot; its light enters from above.
      const source = frame.entities.get(keyOf({ side: target.side, kind: 'card', uid })) || { rect: { left: left + width / 2, top: top - 42, width: 0, height: 0 } };
      const mote = doc.createElement('i'); mote.className = 'evolution-mote'; node.append(mote);
      const dx = source.rect.left + source.rect.width / 2 - left - width / 2;
      const dy = source.rect.top + source.rect.height / 2 - top - 72;
      motion(mote, [{ opacity: .9, transform: `translate(${dx}px,${dy}px) scale(1)` }, { opacity: 1, transform: 'translate(0,0) scale(.9)', offset: .86 }, { opacity: 0, transform: 'translate(0,0) scale(.9)' }], reveal, EASE_MOVE);
    }
    for (const part of [label, name, values, note]) {
      part.style.opacity = reveal ? '0' : '1';
      if (reveal) item.timers.push(later(() => {
        part.style.opacity = '1';
        motion(part, [{ opacity: 0, transform: 'translateY(7px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], 200);
      }, reveal));
    }
    if (!reducedMotion.matches) {
      const flare = doc.createElement('i'); flare.className = 'evolution-flare'; node.append(flare);
      item.timers.push(later(() => motion(flare, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: .85, transform: 'scale(1.12)', offset: .25 }, { opacity: 0, transform: 'scale(1.3)' }], 360), reveal));
    }
    const duration = reducedMotion.matches ? 800 : 1380;
    item.timers.push(later(() => motion(node, [{ opacity: 1 }, { opacity: 0 }], 160), duration - 160));
    item.timers.push(later(() => remove(item), duration));
    return duration;
  }

  function outline(entity, frame, kind, duration) {
    const located = anchor(entity, frame);
    if (!located) return;
    const node = doc.createElement('div');
    node.className = `battle-fx-outline battle-fx-${kind}`;
    node.dataset.effect = kind;
    Object.assign(node.style, {
      left: `${located.rect.left}px`, top: `${located.rect.top}px`,
      width: `${located.rect.width}px`, height: `${located.rect.height}px`,
    });
    const item = register({ node, kind: 'outline', entity, timers: [] });
    motion(node, ['impact', 'guard'].includes(kind) && !reducedMotion.matches ? [
      { opacity: 1, transform: 'scale(.9)' },
      { opacity: 0, transform: 'scale(1.14)' },
    ] : [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], duration);
    item.timers.push(later(() => remove(item), duration));
  }

  function impact(entity, frame, shield = false) {
    const located = anchor(entity, frame);
    if (!located) return;
    outline(entity, frame, shield ? 'guard' : 'impact', 300);
    if (reducedMotion.matches) return;
    const node = doc.createElement('div');
    node.className = `battle-fx-burst ${shield ? 'is-shield' : ''}`;
    node.dataset.effect = shield ? 'shield-break' : 'impact-burst';
    Object.assign(node.style, { left: `${located.rect.left + located.rect.width / 2}px`, top: `${located.rect.top + located.rect.height * .45}px` });
    const item = register({ node, kind: 'burst', entity, timers: [] });
    const count = shield ? 3 : 6;
    for (let index = 0; index < count; index++) {
      const spark = doc.createElement('i');
      node.append(spark);
      const angle = shield ? (index - 1) * 48 : index * 60 + 15;
      const distance = Math.min(63, located.rect.width * .65) + (index % 2) * 8;
      motion(spark, [
        { opacity: 0, transform: `rotate(${angle}deg) translateY(-8px) scale(.92)` },
        { opacity: 1, transform: `rotate(${angle}deg) translateY(-${distance * .55}px) scale(1)`, offset: .2 },
        { opacity: 0, transform: `rotate(${angle + (shield ? 22 : 0)}deg) translateY(-${distance}px) scale(.92)` },
      ], shield ? 400 : 320);
    }
    item.timers.push(later(() => remove(item), shield ? 410 : 330));
  }

  function charge(actor, target, frame) {
    const from = anchor(actor, frame);
    const to = anchor(target, frame);
    chargeEndsAt = now() + CHARGE_MS;
    if (!from?.element || !to) return;
    outline(target, frame, 'target', IMPACT_MS);
    if (reducedMotion.matches || !from.element.animate) {
      outline(actor, frame, 'attack', IMPACT_MS);
      return;
    }
    const ghost = from.element.cloneNode(true);
    ghost.removeAttribute('data-card-uid');
    ghost.removeAttribute('id');
    ghost.removeAttribute('draggable');
    ghost.querySelectorAll('[id],[data-action],[data-uid],[data-card-uid]').forEach(element => {
      for (const attribute of ['id', 'data-action', 'data-uid', 'data-card-uid']) element.removeAttribute(attribute);
    });
    ghost.classList.add('battle-fx-ghost');
    ghost.dataset.effect = 'attack';
    ghost.inert = true;
    Object.assign(ghost.style, { left: `${from.rect.left}px`, top: `${from.rect.top}px`, width: `${from.rect.width}px`, height: `${from.rect.height}px`, visibility: 'visible' });
    const item = register({ node: ghost, kind: 'ghost', entity: actor, timers: [], hidden: new Map() });
    const dx = to.rect.left + to.rect.width / 2 - from.rect.left - from.rect.width / 2;
    const dy = to.rect.top + to.rect.height / 2 - from.rect.top - from.rect.height / 2;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const recoilX = -dx / distance * 10;
    const recoilY = -dy / distance * 10;
    const tilt = Math.max(-4, Math.min(4, dx / 70));
    const hit = `translate(${dx}px,${dy}px) rotate(0deg) scale(1.055)`;
    const animation = motion(ghost, [
      { transform: 'translate(0,0) rotate(0deg) scale(1)', easing: EASE_OUT },
      { transform: `translate(${recoilX}px,${recoilY}px) rotate(${-tilt}deg) scale(1.035)`, offset: 120 / CHARGE_MS, easing: EASE_MOVE },
      { transform: hit, offset: IMPACT_MS / CHARGE_MS, easing: 'linear' },
      { transform: hit, offset: 430 / CHARGE_MS, easing: EASE_OUT },
      { transform: `translate(${-recoilX * .35}px,${-recoilY * .35}px) rotate(${tilt * .4}deg) scale(1.015)`, offset: 750 / CHARGE_MS, easing: EASE_OUT },
      { transform: 'translate(0,0) rotate(0deg) scale(1)' },
    ], CHARGE_MS, 'linear');
    if (!animation) { remove(item); outline(actor, frame, 'attack', IMPACT_MS); return; }
    sync();
    item.timers.push(later(() => impact(target, capture()), IMPACT_MS));
    item.timers.push(later(() => remove(item), CHARGE_MS));
  }

  async function play(step, beforeFrame = capture()) {
    const started = generation;
    if (step.type === 'attack' && chargeEndsAt > now()) {
      await wait(chargeEndsAt - now());
      if (started !== generation) return;
      beforeFrame = capture();
    }
    const changes = step.changes || [];
    const target = step.target || step.actor;
    let duration = 0;
    if (step.type === 'attack') {
      charge(step.actor, step.target, beforeFrame);
      speak(step.actor, 'attack', beforeFrame);
      duration = IMPACT_MS;
    } else if (step.type === 'guard' || step.type === 'shield') {
      const blocked = changes.some(change => change.field === 'shield' && change.amount < 0);
      const guard = popup(`${step.type === 'shield' ? blocked ? '格擋' : '獲得護盾' : '守護承擋'}`, 'guard', target, beforeFrame, { life: 760 });
      if (guard && step.type === 'shield') guard.node.dataset.shieldState = blocked ? 'blocked' : 'gained';
      if (blocked) impact(target, beforeFrame, true);
      else outline(target, beforeFrame, 'guard', 350);
      speak(target, 'defend', beforeFrame);
      duration = blocked && chargeEndsAt > now() ? 0 : 250;
    } else if (step.type === 'triple') {
      duration = evolution(step, beforeFrame);
    } else if (['summon', 'buy', 'reward'].includes(step.type)) {
      outline(target, beforeFrame, 'summon', 200);
      speak(target, 'summon', beforeFrame);
      duration = 200;
    } else if (step.type === 'death') {
      const element = anchor(target, beforeFrame)?.element;
      if (element) motion(element, reducedMotion.matches
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: .65, transform: 'translateY(3px) scale(.98)', offset: .35 }, { opacity: 0, transform: 'translateY(14px) scale(.92)' }], 300);
      outline(target, beforeFrame, 'death', 280);
      duration = 300;
    }
    let voices = 0;
    const buffs = new Map();
    if (step.type === 'buff') {
      for (const change of changes) {
        if (!change.amount || !['attack', 'maxHp', 'hp'].includes(change.field)) continue;
        const key = keyOf(change.target);
        if (!buffs.has(key)) buffs.set(key, { target: change.target, attack: 0, hp: 0, maxHp: 0 });
        buffs.get(key)[change.field] += change.amount;
      }
      for (const buff of buffs.values()) {
        const sign = value => `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
        const health = buff.maxHp || buff.hp;
        const text = [buff.attack ? `攻擊 ${sign(buff.attack)}` : '', health ? `生命 ${sign(health)}` : ''].filter(Boolean).join('　');
        popup(text, 'buff', buff.target, beforeFrame, { stats: { attack: buff.attack, hp: health } });
        if (buff.attack) pulseStat(buff.target, 'attack', beforeFrame);
        if (health) pulseStat(buff.target, 'hp', beforeFrame);
      }
      if (buffs.size) duration = Math.max(duration, 400);
    }
    for (const change of changes) {
      if (!change.amount || (step.type === 'buff' && ['attack', 'maxHp', 'hp'].includes(change.field))) continue;
      if (change.field === 'hp') {
        const hurt = change.amount < 0;
        popup(`${hurt ? '−' : '+'}${Math.abs(change.amount)}`, hurt ? 'damage' : 'heal', change.target, beforeFrame);
        outline(change.target, beforeFrame, hurt ? 'hit' : 'heal', 180);
        pulseStat(change.target, 'hp', beforeFrame);
        if (hurt) {
          const element = anchor(change.target, beforeFrame)?.element;
          if (element && !reducedMotion.matches) motion(element, [
            { transform: 'translateX(0)' }, { transform: 'translateX(-4px)', offset: .25 },
            { transform: 'translateX(4px)', offset: .5 }, { transform: 'translateX(-2px)', offset: .75 }, { transform: 'translateX(0)' },
          ], 180, EASE_MOVE);
          if (voices++ < 2) speak(change.target, 'hurt', beforeFrame);
        }
        duration = Math.max(duration, 520);
        if (hurt && change.target.kind === 'hero') impact(change.target, beforeFrame);
      } else if (change.field === 'gold') {
        popup(`${change.amount < 0 ? '−' : '+'}${Math.abs(change.amount)} 金`, 'gold', change.target, beforeFrame, { energy: true });
        duration = Math.max(duration, 160);
      }
    }
    return wait(duration);
  }

  function cancel() {
    generation++;
    chargeEndsAt = 0;
    if (repositionFrame !== null) win.cancelAnimationFrame(repositionFrame);
    repositionFrame = null;
    for (const animation of animations) { try { animation.cancel(); } catch { /* Visual nodes are removed below. */ } }
    animations.clear();
    [...items].forEach(remove);
    for (const timer of timers) win.clearTimeout(timer);
    timers.clear();
    for (const resolve of waiters.values()) resolve();
    waiters.clear();
  }

  function reposition() {
    if (!items.size || repositionFrame !== null) return;
    repositionFrame = win.requestAnimationFrame(() => {
      repositionFrame = null;
      const frame = capture();
      for (const item of items) {
        if (['ghost', 'outline', 'burst', 'evolution'].includes(item.kind) ||
          (item.entity.kind === 'card' && !frame.entities.has(keyOf(item.entity)))) remove(item);
        else position(item, frame);
      }
    });
  }
  win.addEventListener('resize', reposition);
  doc.addEventListener('scroll', reposition, true);
  return { capture, play, cancel, sync };
}
