import { getEncounterCard } from './encounters.js';

export const EVOLUTIONS = [
  { level: 0, name: '普通', key: 'normal', multiplier: 1 },
  { level: 1, name: '金卡', key: 'gold', multiplier: 2 },
  { level: 2, name: '紫卡', key: 'epic', multiplier: 3 },
  { level: 3, name: '傳說', key: 'legendary', multiplier: 4 },
];
// Missing evolution is the original save format: golden cards are level 1.
export const getEvolution = unit => unit?.evolution ?? (unit?.golden ? 1 : 0);
export const getEvolutionMultiplier = unit => EVOLUTIONS[getEvolution(unit)].multiplier;

// All tuning lives here; identities and portraits keep the original 24 characters.
export const CONFIG = {
  version: 2, rounds: 10, heroHealth: 24, boardSize: 5, benchSize: 3,
  buyCost: 3, sellValue: 1, refreshCost: 1, maxGold: 10,
  shopSizes: [3, 4, 4, 5], upgradeCosts: [5, 7, 9], minUpgradeCost: 1,
  damageCap: 8, maxAttacks: 200, maxLog: 50,
  shopWeights: [[1, 0, 0, 0], [0.5, 0.5, 0, 0], [0.2, 0.4, 0.4, 0], [0.1, 0.2, 0.35, 0.35]],
  traitValues: { city: [1, 4], forge: [2, 5], forest: [3, 7], folk: [1, 2], transit: [4, 8], tide: [1, 2] },
  abilityValues: { buffAll: 2, guide: 2, selfHeal: 2, firstStrike: 2, weakestPing: 1, deathBuff: 3, deathBlast: 2, adjacentAttack: 2, healWeakest: 2, healAll: 2, startBlast: 1, splash: 2, attackGrowth: 2, adjacentHealth: 2, deathWave: 1, deathThrow: 3, adjacentShield: 2 },
  // Each row lists unit tiers; templates never inspect the player's composition.
  enemyTiers: [[1], [1, 1], [1, 1, 2], [1, 2, 2], [1, 2, 2, 3], [2, 2, 2, 3], [2, 2, 3, 3, 3], [2, 3, 3, 3, 4], [3, 3, 3, 4, 4], [3, 3, 4, 4, 4]],
  enemyBonuses: [0, 0, 0, 0, 0, 0, 0, 1, 1, 2],
};

export const TRAITS = [
  { id: 'city', name: '都會', description: '2位：最左側都會角色獲得護盾；4位：所有都會角色獲得護盾。護盾擋一次正傷害。' },
  { id: 'forge', name: '工坊', description: `2／4位：工坊角色本場攻擊 +${CONFIG.traitValues.forge[0]}／+${CONFIG.traitValues.forge[1]}。` },
  { id: 'forest', name: '山林', description: `2／4位：山林角色本場生命 +${CONFIG.traitValues.forest[0]}／+${CONFIG.traitValues.forest[1]}。` },
  { id: 'folk', name: '人情', description: `2／4位：人情角色退場後，其他存活友方本場 +${CONFIG.traitValues.folk[0]}／+${CONFIG.traitValues.folk[1]} 攻擊與生命。` },
  { id: 'transit', name: '疾行', description: `2／4位：疾行角色首次攻擊，本次傷害額外 +${CONFIG.traitValues.transit[0]}／+${CONFIG.traitValues.transit[1]}。` },
  { id: 'tide', name: '海風', description: `2／4位：本場第一位友方退場時，對所有敵方造成 ${CONFIG.traitValues.tide[0]}／${CONFIG.traitValues.tide[1]} 傷害。每場一次。` },
];

const ability = CONFIG.abilityValues;

// id, region, job, quote, zone, faction, tier, attack, health, keywords, ability, short text
const definitions = [
  [1,'天母','午茶結界師','別急，先喝杯咖啡。','北部','city',3,4,7,[],'shieldWeakest','開戰：最低血友方獲得護盾'],
  [2,'信義','時尚召喚師','出門就是我的伸展台。','北部','city',4,7,9,[],'buffAll',`開戰：全隊 +${ability.buffAll}／+${ability.buffAll}`],
  [3,'中和','迷宮導航師','這條巷子，我熟。','北部','city',1,2,3,[],'guide',`開戰：最左友方 +${ability.guide} 生命`],
  [4,'永和','早餐聖騎士','先吃飽，再開打。','北部','city',2,2,6,['guard'],'selfHeal',`攻擊後：自身回復 ${ability.selfHeal} 生命`],
  [5,'基隆','雨霧守護者','這點雨，也算下雨？','北部','tide',1,1,5,['guard'],'none','守護：敵人優先攻擊我'],
  [6,'桃園','轉乘領航員','下一站，我來帶路。','北部','transit',1,3,2,[],'firstStrike',`首次攻擊：本次傷害 +${ability.firstStrike}`],
  [7,'新竹市','晶片風法師','風再大，程式照跑。','北部','forge',1,3,2,[],'weakestPing',`開戰：最低血敵方受 ${ability.weakestPing} 傷害`],
  [8,'竹北','育兒機甲師','接送排程，比開會還滿。','北部','forge',3,5,7,[],'deathBuff',`退場：隨機友方 +${ability.deathBuff}／+${ability.deathBuff}`],
  [9,'苗栗','邊境通關官','歡迎入境苗栗國。','中部','forest',1,1,5,['guard'],'none','守護：敵人優先攻擊我'],
  [10,'台中','豪氣重裝騎士','排場可以，氣勢要滿。','中部','folk',4,7,12,['guard'],'deathBlast',`退場：所有敵方受 ${ability.deathBlast} 傷害`],
  [11,'彰化','隱富鍛造師','穿拖鞋，也能當老闆。','中部','forge',2,4,4,[],'adjacentAttack',`開戰：相鄰友方 +${ability.adjacentAttack} 攻擊`],
  [12,'南投','山林茶術師','我住山裡，也看過海。','中部','forest',2,3,5,[],'healWeakest',`攻擊後：最低血友方回復 ${ability.healWeakest}`],
  [13,'雲林','田野操偶師','田裡有糧，掌上有戲。','中部','folk',2,3,3,[],'puppet','退場：有空位召喚 2／2 戲偶'],
  [14,'嘉義市','雞肉飯鑑定師','這碗，我有意見。','南部','folk',1,2,3,[],'weakestPing',`開戰：最低血敵方受 ${ability.weakestPing} 傷害`],
  [15,'嘉義縣','雲海茶牧師','先喝茶，再慢慢講。','南部','forest',4,6,10,[],'healAll',`攻擊後：全隊回復 ${ability.healAll} 生命`],
  [16,'台南','糖霜煉金師','這樣才叫微糖。','南部','folk',3,4,5,[],'startBlast',`開戰：所有敵方受 ${ability.startBlast} 傷害`],
  [17,'高雄','烈日港口衛士','二十度？先穿外套。','南部','transit',4,8,8,[],'splash',`攻擊後：目標相鄰敵方受 ${ability.splash} 傷害`],
  [18,'屏東','陽光巡遊騎士','我家真的不在墾丁。','南部','transit',2,4,3,['doubleAttack'],'none','連擊：輪到我時連攻兩次'],
  [19,'宜蘭','雨原結界師','我是宜蘭，不是後花園。','北部','forest',3,4,8,['guard','shield'],'none','守護・護盾：擋一次正傷害'],
  [20,'花蓮','車票閃現刺客','搶到票，才能回家。','東部','transit',3,5,5,[],'attackGrowth',`攻擊前：本場攻擊 +${ability.attackGrowth}`],
  [21,'台東','慢活吟遊詩人','等一下，先看海。','東部','tide',2,3,5,[],'adjacentHealth',`開戰：相鄰友方 +${ability.adjacentHealth} 生命`],
  [22,'澎湖','乘風船長','我搭船，不騎海豚。','離島','tide',3,5,6,[],'deathWave',`退場：所有敵方受 ${ability.deathWave} 傷害`],
  [23,'金門','酒香鍛造師','有高粱，不代表海量。','離島','forge',4,8,11,['guard'],'deathThrow',`退場：隨機敵方受 ${ability.deathThrow} 傷害`],
  [24,'馬祖','燈塔傳令官','我沒生氣，風比較大。','離島','tide',4,6,10,[],'adjacentShield',`開戰：相鄰友方護盾與 +${ability.adjacentShield} 生命`],
];
const targetNotes = {
  guide: '最左側友方可以是自己。',
  buffAll: '影響所有存活友方，包含自己。',
  shieldWeakest: '依目前生命值選擇最低血的存活友方，包含自己；同血時取最左側。已有護盾不再疊加。',
  weakestPing: '依敵方目前生命值選擇最低血目標，同血時取最左側。',
  selfHeal: '自己需存活到攻擊後，才會回復生命。',
  healWeakest: '自己需存活到攻擊後。依目前生命值選擇最低血的存活友方，包含自己；同血時取最左側。選中者若已滿血，不會改選其他角色。',
  healAll: '自己需存活到攻擊後；治療所有存活友方，包含自己。',
  adjacentAttack: '只影響自己左右緊鄰的友方，各最多1位，不包含自己。',
  adjacentHealth: '只影響自己左右緊鄰的友方，各最多1位，不包含自己。',
  adjacentShield: '只影響自己左右緊鄰的友方，各最多1位，不包含自己。',
  deathBuff: '自己退場後，隨機選1位仍存活的隊友。',
  deathThrow: '自己退場後，隨機選1位仍存活的敵方。',
  splash: '只傷害主要目標左右緊鄰的敵方，各最多1位，不含主要目標；位置以交戰前為準。即使自己遭反擊退場，仍會觸發。',
};
export const ROSTER = definitions.map(([id,region,job,quote,zone,faction,tier,attack,health,keywords,ability,shortText]) => ({
  id,region,job,quote,zone,faction,tier,attack,health,keywords,ability,shortText,artId:id,
  description: `${shortText}。${targetNotes[ability] || ''}所有增益與治療只作用於本場戰鬥；已退場角色不會復活。${keywords.includes('guard') && ability !== 'none' ? '守護：敵人必須優先攻擊我。' : ''}同名普通三合一升金；金卡、紫卡各再吸收一張同名普通卡，升為紫卡、傳說。普通／金／紫／傳說的基礎攻血與技能數值為1／2／3／4倍；護盾與連擊次數不增加。`,
}));
const TOKEN = { id:101,region:'雲林',job:'掌中戲偶',quote:'田裡有糧，掌上有戲。',zone:'中部',faction:null,tier:1,attack:2,health:2,keywords:[],ability:'none',shortText:'戰鬥限定召喚物',description:'只存在於本場戰鬥，不計羈絆、不進入備位、不參與合成。',artId:101 };
export const getCharacter = id => id === 101 ? TOKEN : ROSTER.find(card => card.id === id) || getEncounterCard(id);
