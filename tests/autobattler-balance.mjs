import { writeFileSync } from 'node:fs';
import { CONFIG, TRAITS, getCharacter } from '../public/game/src/roster.js';
import { createRun, buy, sell, refreshShop, toggleFreeze, upgradeTavern, moveUnit, chooseTripleReward, startCombat, nextRound, getSynergies, validateRun } from '../public/game/src/autobattler.js';

const seeds = Number(process.argv.find(value=>value.startsWith('--seeds='))?.split('=')[1] || 1000);
const output = process.argv.find(value=>value.startsWith('--out='))?.slice(6);
const held = state => [...state.player.board,...state.player.bench];
const abilityValue = {shieldWeakest:3,buffAll:8,guide:1.4,selfHeal:1,weakestPing:1,deathBuff:4,deathBlast:6,adjacentAttack:2.8,healWeakest:1.5,puppet:3,healAll:4,startBlast:4,splash:4,attackGrowth:3,adjacentHealth:2.8,deathWave:3,deathThrow:2.5,adjacentShield:7,firstStrike:1.5};
function raw(unit){return unit.attack+unit.maxHp*0.7;}
function value(unit){const card=getCharacter(unit.cardId);return raw(unit)+(abilityValue[card.ability]||0)*(unit.golden?1.6:1)+(card.keywords.includes('guard')?0.4:0)+(card.keywords.includes('shield')?3:0)+(card.keywords.includes('doubleAttack')?unit.attack*0.6:0);}
function boardValue(units, focus) {
 let total=units.reduce((sum,u)=>sum+value(u),0);
 for(const trait of getSynergies(units)){
  const amount=trait.level?CONFIG.traitValues[trait.id][trait.level===4?1:0]:0;
  if(trait.id===focus)total+=trait.count*1.8+(trait.level===4?3:0);
  if(!amount)continue;
  if(trait.id==='forge')total+=amount*units.filter(u=>getCharacter(u.cardId).faction===trait.id).length;
  if(trait.id==='forest')total+=amount*0.7*units.filter(u=>getCharacter(u.cardId).faction===trait.id).length;
  if(trait.id==='city')total+=Math.min(amount,trait.count)*3;
  if(trait.id==='folk')total+=amount*trait.count*2;
  if(trait.id==='transit')total+=amount*trait.count*0.7;
  if(trait.id==='tide')total+=amount*3;
 }
 return total;
}
function bestBoard(units, focus, blind=false){
 if(blind)return [...units].sort((a,b)=>raw(b)-raw(a)).slice(0,5);
 let best=[],score=-Infinity;
 function visit(start,selected){if(selected.length===Math.min(5,units.length)){const s=boardValue(selected,focus);if(s>score){score=s;best=[...selected];}return;}for(let i=start;i<units.length;i++)visit(i+1,[...selected,units[i]]);}
 visit(0,[]);return best;
}
function arrange(state, focus, blind){
 const desired=bestBoard(held(state),focus,blind);
 // Guards lead; adjacent support sits in the middle whenever possible.
 desired.sort((a,b)=>(getCharacter(b.cardId).keywords.includes('guard')?1:0)-(getCharacter(a.cardId).keywords.includes('guard')?1:0)||b.attack-a.attack);
 if(!blind&&desired.length>=3){const i=desired.findIndex(u=>['adjacentAttack','adjacentHealth','adjacentShield'].includes(getCharacter(u.cardId).ability));if(i>=0){const [support]=desired.splice(i,1);desired.splice(1,0,support);}}
 desired.forEach((u,index)=>{if(state.player.board[index]?.uid!==u.uid)moveUnit(state,u.uid,'board',index);});
}
function offerValue(state,id,focus,blind){
 const card=getCharacter(id);const u={cardId:id,attack:card.attack,maxHp:card.health,golden:false};
 if(blind)return 0;
 const copies=held(state).filter(x=>x.cardId===id&&!x.golden).length;
 const ownIds=new Set(state.player.board.filter(x=>getCharacter(x.cardId).faction===card.faction).map(x=>x.cardId));
 return value(u)+(card.faction===focus?4:0)+(copies>=2?14:copies===1?1.5:0)+(!ownIds.has(id)&&[1,3].includes(ownIds.size)?4:0);
}
function recruit(state, focus, blind){
 let actions=0;
 while(state.pendingReward&&actions++<20){arrange(state,focus,blind);const choices=state.pendingReward.choices;chooseTripleReward(state,[...choices].sort((a,b)=>offerValue(state,b,focus,blind)-offerValue(state,a,focus,blind))[0]);}
 arrange(state,focus,blind);
 const targetTier=state.round>=7?4:state.round>=4?3:state.round>=2?2:1;
 if(state.player.tier<targetTier&&state.player.gold>=state.player.upgradeCost)upgradeTavern(state);
 for(;actions<50;actions++){
  if(state.pendingReward){arrange(state,focus,blind);chooseTripleReward(state,[...state.pendingReward.choices].sort((a,b)=>offerValue(state,b,focus,blind)-offerValue(state,a,focus,blind))[0]);arrange(state,focus,blind);continue;}
  const all=held(state);
  if(state.player.gold>=3&&state.shop.offers.length){
   const offers=[...state.shop.offers].sort((a,b)=>offerValue(state,b.cardId,focus,blind)-offerValue(state,a.cardId,focus,blind));
   const candidate=offers[0];const card=getCharacter(candidate.cardId);
   const copies=all.filter(x=>x.cardId===card.id&&!x.golden).length;
   const selected=bestBoard(all,focus,blind);
   const weakest=[...selected].sort((a,b)=>value(a)-value(b))[0];
   const useful=blind||selected.length<5||copies>=1||offerValue(state,card.id,focus,false)>(weakest?value(weakest):0)+0.5;
   if(useful){
    if(all.length===8&&copies<2){const removable=[...state.player.bench].sort((a,b)=>value(a)-value(b))[0];if(!removable)break;sell(state,removable.uid);}
    const result=buy(state,candidate.uid);if(!result.ok)throw new Error(result.message);arrange(state,focus,blind);continue;
   }
  }
  // Keep pairs; sell unusable spare copies to buy or reroll, never sell current board power.
  const spare=state.player.bench.find(u=>blind||held(state).filter(x=>x.cardId===u.cardId&&!x.golden).length<2);
  if(spare&&state.player.gold<3){sell(state,spare.uid);continue;}
  if(state.player.gold>=1){
   const good=state.shop.offers.some(o=>offerValue(state,o.cardId,focus,blind)>state.player.tier*4+6);
   if(state.player.gold<3&&good&&!blind){if(!state.shop.frozen)toggleFreeze(state);break;}
   refreshShop(state);continue;
  }
  break;
 }
 while(state.pendingReward&&actions++<70)chooseTripleReward(state,state.pendingReward.choices[0]);
 arrange(state,focus,blind);
}
const strategies=[...TRAITS.map(t=>({id:t.id,name:t.name})),{id:null,name:'綜合合理選牌'},{id:'blind',name:'盲買基準'}];
const results=[];
const started=Date.now();
for(const strategy of strategies){
 const result={strategy:strategy.name,seeds,wins:0,deathsByRound:{},finalBossLosses:0,finalBossDraws:0,stalemates:0,nonTerminations:0,invalidStates:0,combatCount:0,totalFinalRound:0,meanDeathRound:null};
 for(let seed=1;seed<=seeds;seed++){
  const state=createRun({seed});let rounds=0;
  while(state.phase!=='gameover'&&rounds++<CONFIG.rounds){
   recruit(state,strategy.id,strategy.id==='blind');
   const outcome=startCombat(state,{recordTimeline:false});if(!outcome.ok)throw new Error(outcome.message);
   result.combatCount++;if(state.result.reason==='stalemate')result.stalemates++;
   if(!validateRun(state).ok)result.invalidStates++;
   if(state.phase==='result')nextRound(state);
  }
  if(state.phase!=='gameover')result.nonTerminations++;
  result.totalFinalRound+=state.round;
  if(state.winner==='player')result.wins++;
  else if(state.player.hp===0)result.deathsByRound[state.round]=(result.deathsByRound[state.round]||0)+1;
  else if(state.result.outcome==='draw')result.finalBossDraws++;
  else result.finalBossLosses++;
 }
 const deaths=Object.entries(result.deathsByRound).reduce((n,[,v])=>n+v,0);
 result.winRate=Number((result.wins/seeds).toFixed(4));result.meanFinalRound=Number((result.totalFinalRound/seeds).toFixed(3));
 result.meanDeathRound=deaths?Number((Object.entries(result.deathsByRound).reduce((n,[r,v])=>n+Number(r)*v,0)/deaths).toFixed(3)):null;
 delete result.totalFinalRound;
 results.push(result);console.error(`${strategy.name}: ${result.wins}/${seeds}, unfinished ${result.nonTerminations}, stalemate ${result.stalemates}`);
}
const report={seedRange:[1,seeds],elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(2)),config:CONFIG,method:'Same seeded shops/opponents; all policies upgrade at rounds 2/4/7 when affordable. Six faction policies and a neutral heuristic select combinations/duplicates/skills and order guards/support. Blind buys first offer, uses raw attack/health to field five, same upgrade schedule. These are programmed policies, not human win rates.',results};
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
