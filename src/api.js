import { parseMeal } from './meal.js';

export const RANDOM_MEAL_URL = 'https://www.themealdb.com/api/json/v1/1/random.php';

const MAX_ATTEMPTS = 3;

/** Error carrying a message that is safe to show to the user. */
export class MealApiError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'MealApiError';
  }
}

async function requestMeal(fetchImpl, signal) {
  let response;
  try {
    response = await fetchImpl(RANDOM_MEAL_URL, { signal });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new MealApiError('Could not reach the recipe service. Check your connection and try again.', { cause });
  }

  if (!response.ok) {
    throw new MealApiError(`The recipe service answered with an error (HTTP ${response.status}).`);
  }

  try {
    const payload = await response.json();
    return parseMeal(payload?.meals?.[0]);
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new MealApiError('The recipe service returned an unexpected answer.', { cause });
  }
}

/**
 * Fetches one random meal.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] injectable for tests
 * @param {AbortSignal} [options.signal] cancels the request
 * @param {string} [options.excludeId] id of the meal on screen: the API is
 *   truly random, so we re-roll a couple of times rather than show it twice.
 */
export async function fetchRandomMeal({ fetchImpl = fetch, signal, excludeId } = {}) {
  let meal;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    meal = await requestMeal(fetchImpl, signal);
    if (!excludeId || meal.id !== excludeId) break;
  }
  return meal;
}
