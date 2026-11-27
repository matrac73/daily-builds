import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchRandomMeal, MealApiError, RANDOM_MEAL_URL } from '../src/api.js';
import { fakeFetch, jsonResponse, rawMeal } from './fixtures.js';

const mealResponse = (overrides) => jsonResponse({ meals: [rawMeal(overrides)] });

test('fetchRandomMeal calls the random endpoint and returns a parsed meal', async () => {
  const { fetchImpl, calls } = fakeFetch(mealResponse());
  const signal = new AbortController().signal;

  const meal = await fetchRandomMeal({ fetchImpl, signal });

  assert.equal(meal.name, 'Teriyaki Chicken Casserole');
  assert.equal(meal.ingredients.length, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RANDOM_MEAL_URL);
  assert.equal(calls[0].init.signal, signal);
});

test('fetchRandomMeal re-rolls when the API returns the meal already on screen', async () => {
  const { fetchImpl, calls } = fakeFetch(
    mealResponse(),
    mealResponse({ idMeal: '99', strMeal: 'Ramen' }),
  );

  const meal = await fetchRandomMeal({ fetchImpl, excludeId: '52772' });

  assert.equal(meal.name, 'Ramen');
  assert.equal(calls.length, 2);
});

test('fetchRandomMeal gives up re-rolling after three attempts', async () => {
  const { fetchImpl, calls } = fakeFetch(mealResponse());

  const meal = await fetchRandomMeal({ fetchImpl, excludeId: '52772' });

  assert.equal(meal.id, '52772');
  assert.equal(calls.length, 3);
});

test('fetchRandomMeal reports HTTP errors', async () => {
  const { fetchImpl } = fakeFetch(jsonResponse({}, 503));
  await assert.rejects(fetchRandomMeal({ fetchImpl }), (error) => {
    assert.ok(error instanceof MealApiError);
    assert.match(error.message, /HTTP 503/);
    return true;
  });
});

test('fetchRandomMeal reports network failures and keeps the cause', async () => {
  const cause = new TypeError('Failed to fetch');
  const { fetchImpl } = fakeFetch(cause);
  await assert.rejects(fetchRandomMeal({ fetchImpl }), (error) => {
    assert.ok(error instanceof MealApiError);
    assert.equal(error.cause, cause);
    return true;
  });
});

test('fetchRandomMeal reports malformed payloads', async () => {
  for (const body of [{ meals: null }, { meals: [] }, {}, null]) {
    const { fetchImpl } = fakeFetch(jsonResponse(body));
    await assert.rejects(fetchRandomMeal({ fetchImpl }), MealApiError);
  }
});

test('fetchRandomMeal lets aborts through untouched', async () => {
  const abort = new DOMException('Aborted', 'AbortError');
  const { fetchImpl } = fakeFetch(abort);
  await assert.rejects(fetchRandomMeal({ fetchImpl }), (error) => error === abort);
});
