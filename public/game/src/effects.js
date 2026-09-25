import { getCard } from './cards.js';
import { characterVoice } from './voices.js?v=20260925-battle-3';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_MOVE = 'cubic-bezier(0.77, 0, 0.175, 1)';
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
  let keyboard = false;
  let repositionFrame = null;
  doc.addEventListener('keydown', () => { keyboard = true; });
  doc.addEventListener('pointerdown', () => { keyboard = false; });

  function capture() {
    const frame = { entities: new Map(), slots: new Map(), energy: new Map() };
    for (const side of ['player', 'enemy']) {
      const hero = root.querySelector(`[data-hero="${side}"]`);
      if (hero) {
        frame.entities.set(keyOf({ side, kind: 'hero' }), {
          rect: bounds(hero.querySelector('.hero-health') || hero),
          element: hero.querySelector('.hero-emblem') || hero,
        });
        const energy = root.querySelector(`[data-energy="${side}"]`) || hero.querySelector('.mana-label');
        if (energy) frame.energy.set(side, { rect: bounds(energy), element: energy });
      }
      const board = root.querySelector(`.${side}-board`);
      if (!board) continue;
      frame.slots.set(side, Array.from(board.children, element => bounds(element)));
      board.querySelectorAll('[data-card-uid]').forEach((element, slot) => {
        frame.entities.set(keyOf({ side, kind: 'card', uid: element.dataset.cardUid }), {
          rect: bounds(element), element, slot,
          cardId: Number(element.querySelector('[data-id]')?.dataset.id),
        });
      });
    }
    return frame;
  }

  function anchor(entity, frame, energy = false) {
    if (!entity) return null;
    if (energy && frame.energy.has(entity.side)) return frame.energy.get(entity.side);
    const exact = frame.entities.get(keyOf(entity));
    if (exact) return exact;
    const slot = frame.slots.get(entity.side)?.[entity.slot];
    if (slot) return { rect: slot, element: null };
    return frame.entities.get(keyOf({ side: entity.side, kind: 'hero' })) || null;
  }

  function later(callback, delay) {
    const timer = win.setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
    return timer;
  }

  function motion(element, frames, duration, easing = EASE_OUT) {
    if (!element.animate) return;
    const animation = element.animate(frames, { duration, easing });
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  }

  function remove(item) {
    for (const timer of item.timers) { win.clearTimeout(timer); timers.delete(timer); }
    item.node.remove();
    items.delete(item);
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
    if (kind === 'energy') {
      [...items].filter(item => item.kind === kind && keyOf(item.entity) === keyOf(entity)).forEach(remove);
    }
    const node = doc.createElement('div');
    node.className = `battle-fx-popup battle-fx-${kind}`;
    node.dataset.effect = kind;
    node.dataset.side = entity.side;
    if (entity.uid !== undefined) node.dataset.effectUid = String(entity.uid);
    node.textContent = text;
    const item = { node, kind, entity, energy, timers: [], placed: null };
    layer.append(node);
    items.add(item);
    position(item, frame);
    const reduce = reducedMotion.matches || keyboard;
    motion(node, reduce ? [{ opacity: 0 }, { opacity: 1 }] : [
      { opacity: 0, transform: 'translateY(10px) scale(.96)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], 180);
    item.timers.push(later(() => motion(node, [{ opacity: 1 }, { opacity: 0 }], 160), life - 160));
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
    const item = popup(`${card?.region || '角色'}：${text}`, 'speech', entity, frame);
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
    layer.append(node);
    const item = { node, kind: 'outline', entity, timers: [] };
    items.add(item);
    motion(node, [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], duration);
    item.timers.push(later(() => remove(item), duration));
  }

  function charge(actor, target, frame) {
    const from = anchor(actor, frame);
    const to = anchor(target, frame);
    if (!from?.element || !to) return;
    if (reducedMotion.matches || keyboard) { outline(actor, frame, 'attack', 240); return; }
    const ghost = from.element.cloneNode(true);
    ghost.removeAttribute('data-card-uid');
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id],[data-action],[data-uid],[data-card-uid]').forEach(element => {
      for (const attribute of ['id', 'data-action', 'data-uid', 'data-card-uid']) element.removeAttribute(attribute);
    });
    ghost.classList.add('battle-fx-ghost');
    ghost.dataset.effect = 'attack';
    ghost.inert = true;
    Object.assign(ghost.style, { left: `${from.rect.left}px`, top: `${from.rect.top}px`, width: `${from.rect.width}px`, height: `${from.rect.height}px` });
    layer.append(ghost);
    const item = { node: ghost, kind: 'ghost', entity: actor, timers: [] };
    items.add(item);
    const dx = to.rect.left + to.rect.width / 2 - from.rect.left - from.rect.width / 2;
    const dy = to.rect.top + to.rect.height / 2 - from.rect.top - from.rect.height / 2;
    const fraction = Math.min(1, 90 / Math.max(1, Math.hypot(dx, dy)));
    motion(ghost, [
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx * fraction}px,${dy * fraction}px) scale(1.04)`, offset: .5 },
      { transform: 'translate(0,0) scale(1)' },
    ], 240, EASE_MOVE);
    item.timers.push(later(() => remove(item), 240));
  }

  function play(step, beforeFrame = capture()) {
    const changes = step.changes || [];
    const target = step.target || step.actor;
    let duration = 0;
    if (step.type === 'attack') {
      charge(step.actor, step.target, beforeFrame);
      speak(step.actor, 'attack', beforeFrame);
      duration = 240;
    } else if (step.type === 'guard') {
      popup('🛡\n守護承擋', 'guard', target, beforeFrame, { life: 760 });
      outline(target, beforeFrame, 'guard', 200);
      speak(target, 'defend', beforeFrame);
      duration = 200;
    } else if (step.type === 'summon') {
      outline(target, beforeFrame, 'summon', 200);
      speak(target, 'summon', beforeFrame);
      duration = 200;
    } else if (step.type === 'death') {
      const element = anchor(target, beforeFrame)?.element;
      if (element) motion(element, reducedMotion.matches || keyboard
        ? [{ opacity: 1 }, { opacity: .2 }]
        : [{ opacity: 1, transform: 'scale(1)' }, { opacity: .2, transform: 'scale(.96)' }], 180);
      outline(target, beforeFrame, 'death', 180);
      duration = 180;
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
          if (element && !(reducedMotion.matches || keyboard)) motion(element, [
            { transform: 'translateX(0)' }, { transform: 'translateX(-4px)', offset: .25 },
            { transform: 'translateX(4px)', offset: .5 }, { transform: 'translateX(-2px)', offset: .75 }, { transform: 'translateX(0)' },
          ], 180, EASE_MOVE);
          if (voices++ < 2) speak(change.target, 'hurt', beforeFrame);
        }
        duration = Math.max(duration, 180);
      } else if (change.field === 'mana') {
        popup(`${change.amount < 0 ? '−' : '+'}${Math.abs(change.amount)} 能量`, 'energy', change.target, beforeFrame, { energy: true });
        duration = Math.max(duration, 160);
      } else if (step.type === 'buff') {
        popup(`${change.amount > 0 ? '+' : '−'}${Math.abs(change.amount)} ${change.field === 'attack' ? '攻擊' : '生命上限'}`, 'buff', change.target, beforeFrame);
        duration = Math.max(duration, 180);
      }
    }
    if (!duration) return Promise.resolve();
    return new Promise(resolve => {
      const timer = later(() => { waiters.delete(timer); resolve(); }, duration);
      waiters.set(timer, resolve);
    });
  }

  function cancel() {
    if (repositionFrame !== null) win.cancelAnimationFrame(repositionFrame);
    repositionFrame = null;
    for (const animation of animations) animation.cancel();
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
        if (item.kind === 'ghost' || item.kind === 'outline') remove(item);
        else position(item, frame);
      }
    });
  }
  win.addEventListener('resize', reposition);
  doc.addEventListener('scroll', reposition, true);
  return { capture, play, cancel };
}
