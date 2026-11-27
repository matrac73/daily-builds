/**
 * Pure helpers that turn a raw TheMealDB record into a clean, render-ready meal.
 * No DOM and no network access here, so everything is unit-testable in Node.
 */

const MAX_INGREDIENTS = 20;
const YOUTUBE_ID = /^[\w-]{11}$/;
const STEP_LABEL = /^(?:step\s*)?\d+\s*[.:)-]?$/i;
const STEP_PREFIX = /^(?:step\s*\d+\s*[.:)-]?|\d+\s*[.)])\s*/i;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Returns the URL only if it is a well-formed http(s) URL, otherwise null.
 * API data is untrusted: this keeps `javascript:` and friends out of the DOM.
 */
export function safeHttpUrl(value) {
  const text = clean(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Collects the `strIngredientN` / `strMeasureN` pairs of a raw record,
 * skipping the empty slots the API pads its records with.
 */
export function extractIngredients(raw) {
  const ingredients = [];
  for (let i = 1; i <= MAX_INGREDIENTS; i += 1) {
    const name = clean(raw[`strIngredient${i}`]);
    if (name) {
      ingredients.push({ name, measure: clean(raw[`strMeasure${i}`]) });
    }
  }
  return ingredients;
}

/**
 * Splits free-form instructions into individual steps: one per non-empty line,
 * without the "STEP 1" / "2." numbering some recipes embed in the text.
 */
export function splitInstructions(text) {
  return clean(text)
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !STEP_LABEL.test(line))
    .map((line) => line.replace(STEP_PREFIX, ''))
    .filter(Boolean);
}

/** Extracts the video id from the common YouTube URL shapes, or null. */
export function youtubeId(value) {
  const href = safeHttpUrl(value);
  if (!href) return null;

  const url = new URL(href);
  const host = url.hostname.replace(/^(www|m)\./, '');
  let id = null;

  if (host === 'youtu.be') {
    id = url.pathname.slice(1);
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, rest] = url.pathname.split('/');
    id = kind === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'v'].includes(kind) ? rest : null;
  }

  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Privacy-friendly embed URL for a YouTube link, or null if it is not one. */
export function youtubeEmbedUrl(value) {
  const id = youtubeId(value);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** Splits the comma-separated `strTags` field into a clean list. */
export function parseTags(value) {
  return clean(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * Normalises a raw TheMealDB record.
 * @throws {TypeError} when the record has no usable name.
 */
export function parseMeal(raw) {
  if (!raw || typeof raw !== 'object' || !clean(raw.strMeal)) {
    throw new TypeError('Invalid meal record');
  }

  return {
    id: clean(String(raw.idMeal ?? '')),
    name: clean(raw.strMeal),
    category: clean(raw.strCategory),
    area: clean(raw.strArea),
    tags: parseTags(raw.strTags),
    image: safeHttpUrl(raw.strMealThumb),
    ingredients: extractIngredients(raw),
    steps: splitInstructions(raw.strInstructions),
    videoUrl: youtubeEmbedUrl(raw.strYoutube),
    sourceUrl: safeHttpUrl(raw.strSource),
  };
}
