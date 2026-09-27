import { getCharacter as getCard } from './roster.js';
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
    const timer = win.setTimeout(() => { timers.delete(timer); callback(); }, delay);
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
    let y = clampY(rect.top + (rect.height - height) / 2 - 10);
    if (item.kind !== 'guard') {
      const occupied = [...items].filter(other => other !== item && other.kind !== 'guard' && other.placed);
      const clear = (left, top) => occupied.every(other =>
        left + width + 6 <= other.placed.left || left >= other.placed.right + 6 ||
        top + height + 6 <= other.placed.top || top >= other.placed.bottom + 6);
      const candidates = item.kind === 'speech'
        ? [rect.top - height - 9, rect.top + rect.height + 9, rect.top - height * 2 - 16, rect.top + rect.height + height + 16]
        : [y, y - height - 7, y + height + 7, y - (height + 7) * 2, y + (height + 7) * 2];
      const positions = candidates.map(top => [x, clampY(top)]);
      const free = positions.find(([left, top]) => clear(left, top));
      if (free) [x, y] = free;
      else {
        const blocker = occupied.find(other => positions.some(([left, top]) =>
          left < other.placed.right + 6 && left + width + 6 > other.placed.left &&
          top < other.placed.bottom + 6 && top + height + 6 > other.placed.top));
        if (blocker) { remove(blocker); return position(item, frame); }
      }
    } else if (item.kind === 'guard') y = clampY(rect.top + rect.height / 2 - height / 2 + 18);
    item.node.style.left = `${x}px`;
    item.node.style.top = `${y}px`;
    item.placed = { left: x, top: y, right: x + width, bottom: y + height };
  }

  function popup(text, kind, entity, frame, { energy = false, life = 1100 } = {}) {
    if (!anchor(entity, frame, energy)) return;
    if (kind === 'gold') {
      [...items].filter(item => item.kind === kind && keyOf(item.entity) === keyOf(entity)).forEach(remove);
    }
    const node = doc.createElement('div');
    node.className = `battle-fx-popup battle-fx-${kind}`;
    node.dataset.effect = kind;
    node.dataset.side = entity.side;
    if (entity.kind === 'hero') node.dataset.hero = 'true';
    if (entity.uid !== undefined) node.dataset.effectUid = String(entity.uid);
    node.textContent = text;
    const item = register({ node, kind, entity, energy, timers: [], placed: null });
    position(item, frame);
    const reduce = reducedMotion.matches;
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
      const guard = popup(`${step.type === 'shield' ? blocked ? '護盾破裂' : '獲得護盾' : '守護承擋'}`, 'guard', target, beforeFrame, { life: 760 });
      if (guard && step.type === 'shield') guard.node.dataset.shieldState = blocked ? 'blocked' : 'gained';
      if (blocked) impact(target, beforeFrame, true);
      else outline(target, beforeFrame, 'guard', 350);
      speak(target, 'defend', beforeFrame);
      duration = blocked && chargeEndsAt > now() ? 0 : 250;
    } else if (['summon', 'buy', 'reward', 'triple'].includes(step.type)) {
      outline(target, beforeFrame, 'summon', 200);
      speak(target, 'summon', beforeFrame);
      if (step.type === 'triple') popup('三合一・金卡！', 'buff', target, beforeFrame);
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
    for (const change of changes) {
      if (!change.amount) continue;
      if (change.field === 'hp') {
        const hurt = change.amount < 0;
        popup(`${hurt ? '−' : '+'}${Math.abs(change.amount)}`, hurt ? 'damage' : 'heal', change.target, beforeFrame);
        outline(change.target, beforeFrame, hurt ? 'hit' : 'heal', 180);
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
        popup(`${change.amount < 0 ? '−' : '+'}${Math.abs(change.amount)} 金幣`, 'gold', change.target, beforeFrame, { energy: true });
        duration = Math.max(duration, 160);
      } else if (step.type === 'buff') {
        popup(`${change.amount > 0 ? '+' : '−'}${Math.abs(change.amount)} ${change.field === 'attack' ? '攻擊' : '生命上限'}`, 'buff', change.target, beforeFrame);
        duration = Math.max(duration, 180);
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
        if (['ghost', 'outline', 'burst'].includes(item.kind) ||
          (item.entity.kind === 'card' && !frame.entities.has(keyOf(item.entity)))) remove(item);
        else position(item, frame);
      }
    });
  }
  win.addEventListener('resize', reposition);
  doc.addEventListener('scroll', reposition, true);
  return { capture, play, cancel, sync };
}
