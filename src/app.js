import { fetchRandomMeal, MealApiError } from './api.js';

const button = document.querySelector('#generate');
const status = document.querySelector('#status');
const mealRoot = document.querySelector('#meal');

let currentMealId = null;
let controller = null;

/** Tiny DOM builder: API text only ever goes through `textContent`. */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  const { text, ...attributes } = props;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

function renderMeta(meal) {
  const labels = [meal.category, meal.area, ...meal.tags].filter(Boolean);
  return el('ul', { class: 'chips', 'aria-label': 'Category, cuisine and tags' },
    labels.map((label) => el('li', { text: label })));
}

function renderIngredients(meal) {
  const items = meal.ingredients.map(({ name, measure }) =>
    el('li', {}, [
      el('span', { class: 'ingredient', text: name }),
      el('span', { class: 'measure', text: measure }),
    ]));
  return el('section', { class: 'panel' }, [
    el('h3', { text: `Ingredients (${meal.ingredients.length})` }),
    el('ul', { class: 'ingredients' }, items),
  ]);
}

function renderSteps(meal) {
  return el('section', { class: 'panel' }, [
    el('h3', { text: 'Instructions' }),
    el('ol', { class: 'steps' }, meal.steps.map((step) => el('li', { text: step }))),
  ]);
}

function renderVideo(meal) {
  return el('section', { class: 'panel video' }, [
    el('h3', { text: 'Video recipe' }),
    el('div', { class: 'video-frame' }, [
      el('iframe', {
        src: meal.videoUrl,
        title: `Video recipe: ${meal.name}`,
        loading: 'lazy',
        allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        allowfullscreen: '',
        referrerpolicy: 'strict-origin-when-cross-origin',
      }),
    ]),
  ]);
}

function renderMeal(meal) {
  const header = el('header', { class: 'meal-header' }, [
    el('div', { class: 'meal-title' }, [
      el('h2', { text: meal.name, tabindex: '-1' }),
      renderMeta(meal),
      ...(meal.sourceUrl
        ? [el('a', { class: 'source', href: meal.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Original recipe ↗' })]
        : []),
    ]),
    ...(meal.image
      ? [el('img', { class: 'meal-image', src: meal.image, alt: meal.name, width: '700', height: '700' })]
      : []),
  ]);

  mealRoot.replaceChildren(
    header,
    el('div', { class: 'columns' }, [renderIngredients(meal), renderSteps(meal)]),
    ...(meal.videoUrl ? [renderVideo(meal)] : []),
  );
  mealRoot.hidden = false;
  mealRoot.querySelector('h2').focus({ preventScroll: true });
  mealRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setLoading(loading) {
  button.disabled = loading;
  button.classList.toggle('is-loading', loading);
  mealRoot.setAttribute('aria-busy', String(loading));
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

async function generate() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  setLoading(true);
  setStatus('Finding something tasty…');

  try {
    const meal = await fetchRandomMeal({ signal, excludeId: currentMealId });
    currentMealId = meal.id;
    renderMeal(meal);
    setStatus('');
    button.querySelector('.label').textContent = 'Get another meal';
  } catch (error) {
    if (signal.aborted) return;
    setStatus(error instanceof MealApiError ? error.message : 'Something went wrong. Please try again.', true);
  } finally {
    if (!signal.aborted) setLoading(false);
  }
}

button.addEventListener('click', generate);
