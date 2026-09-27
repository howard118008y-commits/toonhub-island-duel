import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, ROSTER, TRAITS, getCharacter } from '../public/game/src/roster.js';
import { createRun, buy, sell, refreshShop, toggleFreeze, upgradeTavern, moveUnit, chooseTripleReward, startCombat, nextRound, getSynergies, validateRun } from '../public/game/src/autobattler.js';
import { STORAGE_KEY, saveRun, loadRun, clearRun } from '../public/game/src/storage.js';
const copy = value => structuredClone(value);
function unit(state, cardId, extra = {}) {
  const card = getCharacter(cardId);
  return {uid:`u-${state.nextUid++}`,cardId,golden:false,attack:card.attack,hp:card.health,maxHp:card.health,shield:card.keywords.includes('shield')?1:0,...extra};
}
function offer(state, cardId) { const value={uid:`u-${state.nextUid++}`,cardId};state.shop.offers=[value];return value.uid; }
function fakeStorage() { const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}; }
function failedUnchanged(state, fn) { const before=copy(state);const result=fn();assert.equal(result.ok,false);assert.deepEqual(result.timeline,[]);assert.deepEqual(state,before); }

test('24 identities form 4 tiers x 6 factions; deterministic initial run',()=>{
 assert.equal(ROSTER.length,24);assert.equal(new Set(ROSTER.map(x=>x.id)).size,24);
 for(const trait of TRAITS){const members=ROSTER.filter(x=>x.faction===trait.id);assert.equal(members.length,4);assert.deepEqual(members.map(x=>x.tier).sort(),[1,2,3,4]);}
 for(let tier=1;tier<=4;tier++)assert.equal(ROSTER.filter(x=>x.tier===tier).length,6);
 const a=createRun({seed:1});assert.deepEqual(a,createRun({seed:1}));assert.equal(a.player.hp,24);assert.equal(a.player.gold,3);assert.equal(a.shop.offers.length,3);assert.equal(validateRun(a).ok,true);
});

test('buy/sell/refresh costs, no profit loop, and invalid actions are atomic',()=>{
 const s=createRun({seed:2});const first=s.shop.offers[0];assert(buy(s,first.uid).ok);assert.equal(s.player.gold,0);assert.equal(s.player.board.length,1);
 failedUnchanged(s,()=>buy(s,s.shop.offers[0].uid));failedUnchanged(s,()=>refreshShop(s));failedUnchanged(s,()=>buy(s,'missing'));failedUnchanged(s,()=>moveUnit(s,s.player.board[0].uid,'board',0));
 assert(sell(s,s.player.board[0].uid).ok);assert.equal(s.player.gold,1);assert(refreshShop(s).ok);assert.equal(s.player.gold,0);assert.equal(s.player.board.length,0);assert.equal(validateRun(s).ok,true);
});

test('freeze preserves remaining offers once, gold resets, upgrade discount and shop capacity',()=>{
 const s=createRun({seed:3});s.player.board=[unit(s,3,{attack:100,maxHp:100,hp:100})];const kept=copy(s.shop.offers);assert(toggleFreeze(s).ok);s.player.gold=8;
 startCombat(s,{recordTimeline:false});assert(nextRound(s).ok);assert.equal(s.player.gold,4);assert.equal(s.player.upgradeCost,4);assert.deepEqual(s.shop.offers,kept);assert.equal(s.shop.frozen,false);
 assert(upgradeTavern(s).ok);assert.equal(s.player.gold,0);assert.equal(s.player.tier,2);assert.equal(s.player.upgradeCost,7);assert.equal(s.shop.offers.length,3);
 s.player.gold=1;assert(refreshShop(s).ok);assert.equal(s.shop.offers.length,4);assert(s.shop.offers.every(x=>getCharacter(x.cardId).tier<=2));
});

test('shop rerolls cannot change the opponent or combat randomness',()=>{
 const a=createRun({seed:44});a.player.board=[unit(a,9),unit(a,6)];a.player.gold=6;const b=copy(a);const opponent=copy(a.opponent);
 for(let i=0;i<3;i++)refreshShop(a);
 assert.deepEqual(a.opponent,opponent);assert.notEqual(a.rngState,b.rngState);
 startCombat(a,{recordTimeline:false});startCombat(b,{recordTimeline:false});assert.deepEqual(a.combat,b.combat);assert.deepEqual(a.result,b.result);
});

test('full capacity purchase can merge board + bench, but gold cards are excluded',()=>{
 const s=createRun({seed:5});s.player.gold=3;s.player.board=[unit(s,3),unit(s,4),unit(s,5),unit(s,6),unit(s,7)];s.player.bench=[unit(s,3),unit(s,8),unit(s,9)];
 const purchase=buy(s,offer(s,3));assert(purchase.ok);assert.equal(s.player.gold,0);assert.equal([...s.player.board,...s.player.bench].length,7);
 assert.equal(purchase.timeline.length,1);assert.equal(purchase.timeline[0].type,'triple');assert.equal(purchase.timeline[0].changes[0].amount,-3);assert(purchase.timeline[0].target.slot>=0);assert(purchase.timeline[0].snapshot.player.bench.length<=3);
 const golden=[...s.player.board,...s.player.bench].find(x=>x.cardId===3);assert(golden.golden);assert.equal(golden.attack,getCharacter(3).attack*2);assert.equal(golden.hp,getCharacter(3).health*2);assert.equal(s.pendingReward.choices.length,3);
 failedUnchanged(s,()=>refreshShop(s));failedUnchanged(s,()=>chooseTripleReward(s,999));assert(chooseTripleReward(s,s.pendingReward.choices[0]).ok);assert.equal([...s.player.board,...s.player.bench].length,8);assert.equal(validateRun(s).ok,true);
 s.player.gold=3;const missing=offer(s,3);failedUnchanged(s,()=>buy(s,missing));
});

test('full boards swap across zones, reorder within a zone, and reject invalid capacity',()=>{
 const s=createRun({seed:6});s.player.board=[3,4,5,6,7].map(id=>unit(s,id));s.player.bench=[8,9,10].map(id=>unit(s,id));const a=s.player.board[0],b=s.player.bench[2];
 assert(moveUnit(s,a.uid,'bench',2).ok);assert.equal(s.player.bench[2].uid,a.uid);assert.equal(s.player.board[0].uid,b.uid);
 assert(moveUnit(s,b.uid,'board',5).ok);assert.equal(s.player.board[4].uid,b.uid);
 failedUnchanged(s,()=>moveUnit(s,b.uid,'board',5));failedUnchanged(s,()=>moveUnit(s,a.uid,'bench',4));assert.equal(s.player.board.length,5);assert.equal(s.player.bench.length,3);
});

test('synergies count unique character IDs, not copies or golden status',()=>{
 const s=createRun({seed:7});let board=[unit(s,3),unit(s,3,{golden:true}),unit(s,4)];let city=getSynergies(board).find(x=>x.id==='city');assert.equal(city.count,2);assert.equal(city.level,2);
 board.push(unit(s,1),unit(s,2));city=getSynergies(board).find(x=>x.id==='city');assert.equal(city.level,4);assert.equal(getSynergies([unit(s,101)])[0].count,0);
});

test('four unique city characters shield every city copy, without stacking the two-character effect',()=>{
 const s=createRun({seed:16});s.player.board=[3,4,1,2,3].map(id=>unit(s,id));const initial=startCombat(s).timeline.find(step=>step.type==='shield'&&step.changes.length===5);
 assert(initial);assert(initial.snapshot.combat.player.every(u=>u.shield===1));assert(initial.changes.every(change=>change.before===0&&change.after===1));
});

test('simultaneous retaliation, guard priority, overkill deltas, death and isolated snapshots',()=>{
 const s=createRun({seed:8});s.player.board=[unit(s,6,{attack:20,hp:2,maxHp:2})];s.opponent.board=[unit(s,9,{attack:3,hp:1,maxHp:1})];const persistent=copy(s.player.board);
 const r=startCombat(s);const attacks=r.timeline.filter(x=>x.type==='attack');assert(attacks.length>=1);
 const damage=r.timeline.find(x=>x.type==='damage'&&x.changes.length===2);assert(damage);assert(damage.changes.every(c=>c.before>=0&&c.after>=0&&c.amount===c.after-c.before));assert(damage.changes.some(c=>c.amount===-1));assert(damage.changes.some(c=>c.amount===-2));
 assert.equal(s.result.outcome,'draw');assert.deepEqual(s.player.board,persistent);assert.equal(r.timeline.filter(x=>x.type==='death').length,2);
 const snapshots=r.timeline.map(x=>copy(x.snapshot));s.player.board[0].attack=999;r.timeline.forEach((x,i)=>assert.deepEqual(x.snapshot,snapshots[i]));r.timeline[0].snapshot.player.hp=1;assert.notEqual(r.timeline.at(-1).snapshot.player.hp,1);
});

test('shield absorbs one positive hit, healing never resurrects or exceeds max, tokens expire',()=>{
 const s=createRun({seed:9});s.player.board=[unit(s,19),unit(s,15),unit(s,13)];s.opponent.board=[unit(s,10),unit(s,17),unit(s,22)];const held=copy(s.player.board);const r=startCombat(s);
 assert(r.timeline.some(x=>x.type==='shield'&&x.blocked));assert.deepEqual(s.player.board,held);assert(!s.player.board.some(x=>x.cardId===101));
 for(const step of r.timeline){for(const side of ['player','enemy'])for(const u of step.snapshot.combat?.[side]||[])assert(u.hp>=0&&u.hp<=u.maxHp);for(const c of step.changes)if(c.field==='hp')assert(c.after>=0);}
});

test('result is saved before animation; reload and duplicate buttons cannot re-award income',()=>{
 const s=createRun({seed:10});s.player.board=[unit(s,3,{attack:100,hp:100,maxHp:100})];startCombat(s);assert.equal(s.phase,'result');const store=fakeStorage();assert(saveRun(s,store).ok);const restored=loadRun(store);assert.equal(restored.status,'restored');assert.deepEqual(restored.state,s);
 failedUnchanged(s,()=>startCombat(s));assert(nextRound(restored.state).ok);assert.equal(restored.state.round,2);assert.equal(restored.state.player.gold,4);failedUnchanged(restored.state,()=>nextRound(restored.state));
});

test('shield snapshots do not announce HP loss early; simultaneous lethal hits cannot self-heal',()=>{
 const s=createRun({seed:31});s.player.board=[unit(s,19)];s.opponent.board=[unit(s,9)];const r=startCombat(s);
 let previous=r.timeline[0].snapshot;
 for(const step of r.timeline){if(step.type==='shield'&&step.blocked){for(const side of ['player','enemy'])for(const u of step.snapshot.combat[side])assert.equal(u.hp,previous.combat[side].find(old=>old.uid===u.uid).hp);}previous=step.snapshot;}
 const dead=createRun({seed:32});dead.player.board=[unit(dead,4,{attack:10,hp:1,maxHp:1})];dead.opponent.board=[unit(dead,9,{attack:10,hp:1,maxHp:1})];const lethal=startCombat(dead);assert.equal(dead.result.outcome,'draw');assert(!lethal.timeline.some(step=>step.type==='heal'));
 const heal=createRun({seed:33});heal.player.board=[unit(heal,4,{attack:3,hp:10,maxHp:10})];heal.opponent.board=[unit(heal,9,{attack:1,hp:9,maxHp:9})];const healing=startCombat(heal).timeline.filter(step=>step.type==='heal');assert(healing.length>0);assert(healing.flatMap(step=>step.changes).every(change=>change.amount>0&&change.amount<=2&&change.after<=10));
});

test('zero-attack stalemate is bounded and hero result damage uses actual HP lost',()=>{
 const s=createRun({seed:34});s.player.board=[unit(s,9,{attack:0})];s.opponent.board=[unit(s,5,{attack:0})];assert(startCombat(s,{recordTimeline:false}).ok);assert.equal(s.combat.attacks,CONFIG.maxAttacks);assert.equal(s.result.reason,'stalemate');assert.equal(s.result.outcome,'draw');assert.equal(s.player.hp,24);
 const dead=createRun({seed:35});dead.player.hp=1;const r=startCombat(dead);assert.equal(dead.result.damage,1);assert.equal(r.timeline.find(step=>step.type==='damage'&&step.target?.kind==='hero').changes[0].amount,-1);
});

test('hero death stops the run; round 10 requires a win, never an endless extra round',()=>{
 const dead=createRun({seed:11});dead.player.hp=1;startCombat(dead);assert.equal(dead.phase,'gameover');assert.equal(dead.winner,'enemy');failedUnchanged(dead,()=>nextRound(dead));
 for(const win of [true,false]){const s=createRun({seed:12});s.round=10;s.opponent.round=10;s.player.income=10;if(win)s.player.board=[unit(s,3,{attack:1000,hp:1000,maxHp:1000})];else s.opponent.board=[];startCombat(s);assert.equal(s.phase,'gameover');assert.equal(s.winner,win?'player':'enemy');assert.equal(s.result.outcome,win?'win':'draw');failedUnchanged(s,()=>nextRound(s));}
});

test('storage rejects corrupted/versioned/invalid data and unavailable/quota storage remains nonblocking',()=>{
 const store=fakeStorage(),s=createRun({seed:13});assert.equal(loadRun(store).status,'empty');assert(saveRun(s,store).ok);assert.equal(loadRun(store).status,'restored');assert(clearRun(store).ok);assert.equal(loadRun(store).status,'empty');
 for(const raw of ['{',JSON.stringify({version:0,state:s}),JSON.stringify({version:1,savedAt:0,state:{...s,round:99}})]){store.setItem(STORAGE_KEY,raw);assert.equal(loadRun(store).status,'invalid');}
 for(const mutate of [x=>x.player.gold=-1,x=>x.player.hp=25,x=>x.player.maxHp=25,x=>x.player.gold=NaN,x=>x.player.tier=Infinity,x=>x.shop.offers[0].cardId=999,x=>x.nextUid=1,x=>x.player.board=Array(6).fill(unit(x,3)),x=>x.player.board=[unit(x,3,{uid:x.shop.offers[0].uid})],x=>x.phase='combat']){const bad=copy(s);mutate(bad);assert.equal(validateRun(bad).ok,false);assert.equal(saveRun(bad,store).ok,false);}
 const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');},removeItem(){throw new Error('blocked');}};assert.equal(loadRun(blocked).status,'unavailable');assert.equal(saveRun(s,blocked).ok,false);assert.equal(clearRun(blocked).ok,false);assert.equal(buy(s,s.shop.offers[0].uid).ok,true);
});
