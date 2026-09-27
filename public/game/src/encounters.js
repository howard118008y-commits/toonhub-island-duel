// Encounter enemies are never part of the 24-character recruitment pool.
export const ENCOUNTER_ROUNDS = [3, 6, 9];
export const ENCOUNTER_CARDS = [
  { id: 201, region: '紙箱史萊姆', job: '路邊小怪', quote: '這個紙箱，是我的城堡！', attack: 2, health: 4, tier: 1, keywords: [], shortText: '普通攻擊',
    voices: { summon: '箱子裡，還有我！', attack: '紙箱衝撞！', hurt: '箱角凹下去了！', defend: '封箱膠帶，撐住！' } },
  { id: 202, region: '夜市搗蛋獸', job: '守護小怪', quote: '想過這條街，先接我一招！', attack: 3, health: 7, tier: 2, keywords: ['guard'], shortText: '守護：敵人優先攻擊我',
    voices: { summon: '夜市還沒打烊！', attack: '熱鬧一點，接招！', hurt: '哎呀，點心掉了！', defend: '這個攤位我來守！' } },
  { id: 203, region: '石獅小怪', job: '護盾小怪', quote: '小小石獅，也有大大威風。', attack: 4, health: 10, tier: 3, keywords: ['shield'], shortText: '護盾：抵擋第一次傷害',
    voices: { summon: '石獅醒來巡邏囉！', attack: '看我的石獅踏步！', hurt: '石頭也會喊痛！', defend: '石甲護身！' } },
].map(card => ({ ...card, kind: 'monster', zone: '小怪委託', faction: null, ability: 'none', art: `monster-${card.id}.webp`,
  description: `${card.shortText}。只出現在小怪委託，無法招募、出售或合成，不計地區羈絆。` }));

const ENCOUNTERS = {
  3: { name: '紙箱怪來襲', tier: 1, cards: [201, 201] },
  6: { name: '夜市巡邏', tier: 2, cards: [201, 202, 202], attackBonus: 2, healthBonus: 4 },
  9: { name: '石獅守關', tier: 3, cards: [202, 203, 203], attackBonus: 4, healthBonus: 8 },
};
export const getEncounterCard = id => ENCOUNTER_CARDS.find(card => card.id === Number(id));
export const getEncounterDefinition = round => ENCOUNTERS[round] || null;
