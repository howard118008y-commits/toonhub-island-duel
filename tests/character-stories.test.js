import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, getCharacter } from '../public/game/src/roster.js';
import { ENCOUNTER_CARDS } from '../public/game/src/encounters.js';
import { CHARACTER_VOICES } from '../public/game/src/voices.js';
import { CHARACTER_STORIES, CHARACTER_STORY_NOTE } from '../public/game/src/character-stories.js';

test('all 24 recruitable characters retain complete display metadata and four matching regional voice lines', () => {
  assert.equal(ROSTER.length, 24);
  assert.equal(new Set(ROSTER.map(card => card.id)).size, 24);
  for (const card of ROSTER) {
    for (const field of ['region', 'job', 'quote', 'shortText', 'description']) {
      assert.equal(typeof card[field], 'string', `${card.id}: ${field}`);
      assert(card[field].trim(), `${card.id}: empty ${field}`);
    }
    for (const kind of ['summon', 'attack', 'hurt', 'defend']) {
      assert.equal(typeof CHARACTER_VOICES[card.id]?.[kind], 'string', `${card.id}: ${kind}`);
      assert(CHARACTER_VOICES[card.id][kind].trim(), `${card.id}: empty ${kind}`);
    }
    assert.equal(CHARACTER_VOICES[card.id].summon, card.quote, `${card.id}: regional quote drift`);
  }
});

test('every recruitable character and encounter monster has a distinct short original story without altering the card pool', () => {
  const characters = [...ROSTER, ...ENCOUNTER_CARDS];
  assert.deepEqual(Object.keys(CHARACTER_STORIES).map(Number), characters.map(card => card.id));
  assert.equal(new Set(Object.values(CHARACTER_STORIES)).size, characters.length);
  assert.match(CHARACTER_STORY_NOTE, /原創.*不代表地區居民/);
  for (const card of characters) {
    const story = CHARACTER_STORIES[card.id];
    assert.equal(typeof story, 'string', `${card.id}: story`);
    assert(story.includes(card.region), `${card.id}: story must identify its character`);
    assert.notEqual(story, card.description, `${card.id}: skill rules are not a story`);
    const sentences = story.match(/[。！？]/g)?.length || 0;
    assert(sentences >= 2 && sentences <= 3, `${card.id}: concise two- or three-sentence story`);
    assert.equal(getCharacter(card.id), card);
  }
  assert.equal(ROSTER.length, 24);
  assert(ENCOUNTER_CARDS.every(monster => !ROSTER.includes(monster)));
  assert.equal(CHARACTER_STORIES[101], undefined, 'combat-only puppet uses its existing summon description');
});
