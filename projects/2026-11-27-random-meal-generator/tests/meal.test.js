import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractIngredients,
  parseMeal,
  parseTags,
  safeHttpUrl,
  splitInstructions,
  youtubeEmbedUrl,
  youtubeId,
} from '../src/meal.js';
import { rawMeal } from './fixtures.js';

test('extractIngredients pairs names with measures and skips empty slots', () => {
  assert.deepEqual(extractIngredients(rawMeal()), [
    { name: 'Chicken', measure: '1 whole' },
    { name: 'Tomato', measure: '2 chopped' },
    { name: 'Salt', measure: '' },
  ]);
});

test('extractIngredients returns an empty list when there are none', () => {
  assert.deepEqual(extractIngredients({}), []);
});

test('splitInstructions splits on line breaks and drops blank lines', () => {
  assert.deepEqual(splitInstructions('Boil water.\r\n\r\nAdd pasta.\n  \nServe.'), [
    'Boil water.',
    'Add pasta.',
    'Serve.',
  ]);
});

test('splitInstructions removes embedded step numbering', () => {
  const text = 'STEP 1\r\nChop the onions.\r\nStep 2: Fry them.\r\n3. Season.\r\n4) Serve.';
  assert.deepEqual(splitInstructions(text), ['Chop the onions.', 'Fry them.', 'Season.', 'Serve.']);
});

test('splitInstructions keeps quantities that start a sentence', () => {
  assert.deepEqual(splitInstructions('2 eggs go in first.\n350 degrees for an hour.'), [
    '2 eggs go in first.',
    '350 degrees for an hour.',
  ]);
});

test('splitInstructions handles missing text', () => {
  assert.deepEqual(splitInstructions(null), []);
  assert.deepEqual(splitInstructions(''), []);
});

test('youtubeId understands the common URL shapes', () => {
  const id = '1IszT_guI08';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}`,
    `https://m.youtube.com/watch?v=${id}&t=10s`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
  ]) {
    assert.equal(youtubeId(url), id, url);
  }
});

test('youtubeId rejects anything that is not a YouTube video', () => {
  for (const url of [
    '',
    null,
    'not a url',
    'https://vimeo.com/123456789',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/channel/abcdefghijk',
    'https://evil.example/watch?v=1IszT_guI08',
    'javascript:alert(1)',
  ]) {
    assert.equal(youtubeId(url), null, String(url));
  }
});

test('youtubeEmbedUrl builds a privacy-friendly embed URL', () => {
  assert.equal(
    youtubeEmbedUrl('https://www.youtube.com/watch?v=1IszT_guI08'),
    'https://www.youtube-nocookie.com/embed/1IszT_guI08',
  );
  assert.equal(youtubeEmbedUrl(''), null);
});

test('safeHttpUrl only lets http(s) URLs through', () => {
  assert.equal(safeHttpUrl(' https://example.com/a.jpg '), 'https://example.com/a.jpg');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,hi'), null);
  assert.equal(safeHttpUrl('nope'), null);
  assert.equal(safeHttpUrl(undefined), null);
});

test('parseTags splits and trims the tag list', () => {
  assert.deepEqual(parseTags('Meat, Casserole,,Spicy '), ['Meat', 'Casserole', 'Spicy']);
  assert.deepEqual(parseTags(null), []);
});

test('parseMeal normalises a full record', () => {
  assert.deepEqual(parseMeal(rawMeal()), {
    id: '52772',
    name: 'Teriyaki Chicken Casserole',
    category: 'Chicken',
    area: 'Japanese',
    tags: ['Meat', 'Casserole'],
    image: 'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
    ingredients: [
      { name: 'Chicken', measure: '1 whole' },
      { name: 'Tomato', measure: '2 chopped' },
      { name: 'Salt', measure: '' },
    ],
    steps: ['Preheat oven to 350° F.', 'Bake for 35 minutes.'],
    videoUrl: 'https://www.youtube-nocookie.com/embed/4aZr5hZXP_s',
    sourceUrl: null,
  });
});

test('parseMeal tolerates missing optional fields', () => {
  const meal = parseMeal({ idMeal: '1', strMeal: ' Toast ' });
  assert.equal(meal.name, 'Toast');
  assert.equal(meal.image, null);
  assert.equal(meal.videoUrl, null);
  assert.deepEqual(meal.ingredients, []);
  assert.deepEqual(meal.steps, []);
  assert.deepEqual(meal.tags, []);
});

test('parseMeal rejects records without a name', () => {
  assert.throws(() => parseMeal(undefined), TypeError);
  assert.throws(() => parseMeal({ idMeal: '1', strMeal: '  ' }), TypeError);
});
