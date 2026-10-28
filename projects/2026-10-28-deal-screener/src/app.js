import { toCsv } from './csv.js';
import { LIKE, MATCH_THRESHOLD, PASS, decide, emptyDeck, forget, remaining, restoreDeck, shortlist, undo } from './deck.js';
import { DEFAULT_CRITERIA, distinctValues, ebitdaMargin, leverage, rankDeals, scoreDeal } from './scoring.js';
import { WrongPassphraseError, open } from './vault.js';

const VAULT_URL = './data/deals.enc.json';
const SWIPE_DISTANCE = 110;
const NUMBER_FIELDS = ['revenueMin', 'revenueMax', 'marginMin', 'growthMin', 'leverageMax'];
const WEIGHT_KEYS = Object.keys(DEFAULT_CRITERIA.weights);

const $ = (selector) => document.querySelector(selector);

const state = {
  vault: null,
  deals: [],
  criteria: structuredClone(DEFAULT_CRITERIA),
  deck: emptyDeck(),
  ranked: [],
  animating: false,
};

// ---------- helpers ----------

/** Tiny DOM builder: text is always set through textContent, so deal data can never inject HTML. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

const nf = (digits) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const fmt = {
  money: (v) => (v == null ? 'n.d.' : `${nf(1).format(v)} M€`),
  pct: (v) => (v == null ? 'n.d.' : `${nf(1).format(v)} %`),
  multiple: (v) => (v == null ? 'n.d.' : `${nf(1).format(v)}x`),
};

const storageKey = (kind) => `deal-screener:${kind}:${state.vault.salt}`;

function load(kind, fallback) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(kind))) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(kind, value) {
  localStorage.setItem(storageKey(kind), JSON.stringify(value));
}

const scoreClass = (score) => (score >= MATCH_THRESHOLD ? 'high' : score >= 50 ? 'mid' : 'low');

// ---------- lock screen ----------

async function fetchVault() {
  const response = await fetch(VAULT_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Impossible de charger la base de deals (${response.status})`);
  return response.json();
}

async function unlock(event) {
  event.preventDefault();
  const error = $('#lock-error');
  const button = event.submitter ?? $('#lock-form button');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Déchiffrement…';
  try {
    const { deals } = await open(state.vault, $('#passphrase').value);
    state.deals = deals;
    state.criteria = { ...structuredClone(DEFAULT_CRITERIA), ...load('criteria', {}) };
    state.deck = restoreDeck(load('deck', null));
    $('#passphrase').value = '';
    $('#lock').hidden = true;
    $('#app').hidden = false;
    fillCriteriaForm();
    refresh();
  } catch (e) {
    error.textContent = e instanceof WrongPassphraseError ? 'Phrase secrète incorrecte.' : e.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Déverrouiller';
  }
}

function lock() {
  state.deals = [];
  state.ranked = [];
  $('#card-slot').replaceChildren();
  $('#shortlist').replaceChildren();
  $('#app').hidden = true;
  $('#lock').hidden = false;
  $('#passphrase').focus();
}

// ---------- criteria ----------

function chipGroup(container, field, values) {
  container.replaceChildren(
    ...values.map((value) =>
      el(
        'button',
        {
          type: 'button',
          class: `chip${state.criteria[field].includes(value) ? ' on' : ''}`,
          'aria-pressed': String(state.criteria[field].includes(value)),
          onclick: () => {
            const list = state.criteria[field];
            state.criteria[field] = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
            chipGroup(container, field, values);
            onCriteriaChange();
          },
        },
        value,
      ),
    ),
  );
}

function fillCriteriaForm() {
  const form = $('#criteria');
  for (const field of NUMBER_FIELDS) form.elements[field].value = state.criteria[field] ?? '';
  for (const key of WEIGHT_KEYS) form.elements[`w-${key}`].value = state.criteria.weights[key];
  chipGroup($('#sectors'), 'sectors', distinctValues(state.deals, 'sector'));
  chipGroup($('#countries'), 'countries', distinctValues(state.deals, 'country'));
}

function readCriteriaForm() {
  const form = $('#criteria');
  for (const field of NUMBER_FIELDS) {
    const raw = form.elements[field].value;
    state.criteria[field] = raw === '' ? null : Number(raw);
  }
  for (const key of WEIGHT_KEYS) state.criteria.weights[key] = Number(form.elements[`w-${key}`].value);
}

function onCriteriaChange() {
  save('criteria', state.criteria);
  refresh();
}

// ---------- deck ----------

function kpi(label, value) {
  return el('div', { class: 'kpi' }, el('span', { class: 'kpi-label' }, label), el('strong', {}, value));
}

function renderCard(entry) {
  const { deal, score, parts } = entry;
  return el(
    'article',
    { class: 'card', tabindex: '0' },
    el('div', { class: 'stamp stamp-like' }, 'SHORTLIST'),
    el('div', { class: 'stamp stamp-pass' }, 'PASS'),
    el(
      'header',
      { class: 'card-head' },
      el('div', {}, el('h3', {}, deal.name), el('p', { class: 'muted' }, [deal.sector, deal.country].filter(Boolean).join(' · '))),
      el('div', { class: `score ${scoreClass(score)}`, title: 'Score de fit' }, String(score)),
    ),
    deal.description ? el('p', { class: 'pitch' }, deal.description) : null,
    el(
      'div',
      { class: 'kpis' },
      kpi('CA', fmt.money(deal.revenue)),
      kpi('EBITDA', fmt.money(deal.ebitda)),
      kpi('Marge', fmt.pct(ebitdaMargin(deal))),
      kpi('Croissance', fmt.pct(deal.growth)),
      kpi('Dette nette', fmt.money(deal.netDebt)),
      kpi('Levier', fmt.multiple(leverage(deal))),
    ),
    el(
      'ul',
      { class: 'bars' },
      parts.map((p) =>
        el(
          'li',
          {},
          el('span', {}, p.label, p.known ? '' : ' (n.d.)'),
          el('span', { class: 'bar' }, el('span', { class: `fill ${p.known ? '' : 'unknown'}`, style: `width:${Math.round(p.value * 100)}%` })),
        ),
      ),
    ),
  );
}

function renderEmptyDeck() {
  const done = state.ranked.length > 0;
  return el(
    'div',
    { class: 'card empty' },
    el('h3', {}, done ? 'Tous les deals ont été passés en revue' : 'Aucun deal ne correspond aux filtres'),
    el('p', { class: 'muted' }, done ? 'Ajustez le profil ou revoyez tous les deals.' : 'Élargissez les secteurs ou géographies sélectionnés.'),
  );
}

function enableDrag(card, onSwipe) {
  let startX = null;
  let dx = 0;
  card.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    card.setPointerCapture(e.pointerId);
    card.classList.add('dragging');
  });
  card.addEventListener('pointermove', (e) => {
    if (startX == null) return;
    dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    card.style.setProperty('--like', String(Math.max(0, Math.min(1, dx / SWIPE_DISTANCE))));
    card.style.setProperty('--pass', String(Math.max(0, Math.min(1, -dx / SWIPE_DISTANCE))));
  });
  const release = () => {
    if (startX == null) return;
    startX = null;
    card.classList.remove('dragging');
    if (Math.abs(dx) >= SWIPE_DISTANCE) onSwipe(dx > 0 ? LIKE : PASS);
    else {
      card.style.transform = '';
      card.style.setProperty('--like', '0');
      card.style.setProperty('--pass', '0');
    }
    dx = 0;
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
}

function swipe(verdict) {
  const [current] = remaining(state.ranked, state.deck);
  if (!current || state.animating) return;
  state.animating = true;
  $('#card-slot .card').classList.add(verdict === LIKE ? 'fly-right' : 'fly-left');
  state.deck = decide(state.deck, current.deal.id, verdict);
  save('deck', state.deck);
  if (verdict === LIKE && current.score >= MATCH_THRESHOLD) celebrate(current);
  setTimeout(() => {
    state.animating = false;
    refresh();
  }, 220);
}

function celebrate(entry) {
  const overlay = $('#match');
  $('#match-text').textContent = `${entry.deal.name} coche ${entry.score} % de votre profil.`;
  overlay.hidden = false;
  setTimeout(() => (overlay.hidden = true), 1400);
}

// ---------- shortlist ----------

function scoredShortlist() {
  // Liked deals stay visible even if they no longer pass the current sector/country filters.
  const scored = state.deals.map((deal) => ({ deal, ...scoreDeal(deal, state.criteria) }));
  return shortlist(scored, state.deck).sort((a, b) => b.score - a.score);
}

function renderShortlist(entries) {
  $('#shortlist-count').textContent = String(entries.length);
  $('#export').disabled = entries.length === 0;
  $('#shortlist').replaceChildren(
    ...entries.map(({ deal, score }) =>
      el(
        'li',
        {},
        el('span', { class: `dot ${scoreClass(score)}` }, String(score)),
        el('span', { class: 'grow' }, el('strong', {}, deal.name), el('small', { class: 'muted' }, `${fmt.money(deal.revenue)} · ${fmt.pct(ebitdaMargin(deal))} marge`)),
        el(
          'button',
          {
            type: 'button',
            class: 'icon',
            'aria-label': `Retirer ${deal.name}`,
            onclick: () => {
              state.deck = forget(state.deck, deal.id);
              save('deck', state.deck);
              refresh();
            },
          },
          '×',
        ),
      ),
    ),
  );
}

function exportShortlist() {
  const csv = toCsv(scoredShortlist(), [
    { label: 'Cible', value: (e) => e.deal.name },
    { label: 'Score', value: (e) => e.score },
    { label: 'Secteur', value: (e) => e.deal.sector },
    { label: 'Pays', value: (e) => e.deal.country },
    { label: 'CA (M€)', value: (e) => e.deal.revenue },
    { label: 'EBITDA (M€)', value: (e) => e.deal.ebitda },
    { label: 'Marge EBITDA (%)', value: (e) => ebitdaMargin(e.deal)?.toFixed(1) },
    { label: 'Croissance (%)', value: (e) => e.deal.growth },
    { label: 'Dette nette (M€)', value: (e) => e.deal.netDebt },
    { label: 'Levier (x)', value: (e) => leverage(e.deal)?.toFixed(2) },
    { label: 'Commentaire', value: (e) => e.deal.description },
  ]);
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  el('a', { href: url, download: 'shortlist.csv' }).click();
  URL.revokeObjectURL(url);
}

// ---------- render loop ----------

function refresh() {
  state.ranked = rankDeals(state.deals, state.criteria);
  const left = remaining(state.ranked, state.deck);
  const [current] = left;

  const slot = $('#card-slot');
  if (current) {
    const card = renderCard(current);
    enableDrag(card, swipe);
    slot.replaceChildren(card);
  } else {
    slot.replaceChildren(renderEmptyDeck());
  }
  $('#like').disabled = $('#pass').disabled = !current;
  $('#undo').disabled = state.deck.history.length === 0;
  $('#stats').textContent = `${state.deals.length} deals · ${state.ranked.length} dans le périmètre · ${left.length} à voir`;
  renderShortlist(scoredShortlist());
}

function isTyping(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function bindEvents() {
  $('#lock-form').addEventListener('submit', unlock);
  $('#lock-button').addEventListener('click', lock);
  $('#criteria').addEventListener('input', () => {
    readCriteriaForm();
    onCriteriaChange();
  });
  $('#criteria').addEventListener('submit', (e) => e.preventDefault());
  $('#reset-criteria').addEventListener('click', () => {
    state.criteria = structuredClone(DEFAULT_CRITERIA);
    fillCriteriaForm();
    onCriteriaChange();
  });
  $('#reset-deck').addEventListener('click', () => {
    state.deck = emptyDeck();
    save('deck', state.deck);
    refresh();
  });
  $('#like').addEventListener('click', () => swipe(LIKE));
  $('#pass').addEventListener('click', () => swipe(PASS));
  $('#undo').addEventListener('click', () => {
    state.deck = undo(state.deck);
    save('deck', state.deck);
    refresh();
  });
  $('#export').addEventListener('click', exportShortlist);
  document.addEventListener('keydown', (e) => {
    if ($('#app').hidden || isTyping(e.target)) return;
    if (e.key === 'ArrowRight') swipe(LIKE);
    else if (e.key === 'ArrowLeft') swipe(PASS);
    else if (e.key === 'Backspace') $('#undo').click();
    else return;
    e.preventDefault();
  });
}

async function init() {
  bindEvents();
  try {
    state.vault = await fetchVault();
    if (state.vault.hint) {
      $('#lock-hint').textContent = state.vault.hint;
      $('#lock-hint').hidden = false;
    }
  } catch (e) {
    $('#lock-error').textContent = `${e.message}. Servez le dossier via HTTP (voir README).`;
    $('#lock-error').hidden = false;
    $('#lock-form button').disabled = true;
  }
}

init();
