import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CRITERIA,
  UNKNOWN_SCORE,
  distinctValues,
  ebitdaMargin,
  leverage,
  passesFilters,
  rankDeals,
  scoreDeal,
} from '../src/scoring.js';

const deal = (overrides) => ({
  id: 'x',
  name: 'X',
  sector: 'Software',
  country: 'France',
  revenue: 50,
  ebitda: 10,
  growth: 10,
  netDebt: 20,
  ...overrides,
});

test('derived KPIs: margin and leverage', () => {
  assert.equal(ebitdaMargin(deal()), 20);
  assert.equal(ebitdaMargin(deal({ revenue: 0 })), null);
  assert.equal(leverage(deal()), 2);
  assert.equal(leverage(deal({ ebitda: -1 })), null);
  assert.equal(leverage(deal({ netDebt: null })), null);
});

test('a deal matching every criterion scores 100', () => {
  const { score, parts } = scoreDeal(deal(), DEFAULT_CRITERIA);
  assert.equal(score, 100);
  assert.deepEqual(parts.map((p) => p.key), ['size', 'margin', 'growth', 'leverage']);
  assert.ok(parts.every((p) => p.known && p.value === 1));
});

test('sub-scores decay with distance to the target', () => {
  const only = (key) => ({ ...DEFAULT_CRITERIA, weights: { size: 0, margin: 0, growth: 0, leverage: 0, [key]: 1 } });
  assert.equal(scoreDeal(deal({ revenue: 5, ebitda: 1 }), only('size')).score, 50); // half of the 10 M€ floor
  assert.equal(scoreDeal(deal({ revenue: 200, ebitda: 40 }), only('size')).score, 50); // twice the 100 M€ cap
  assert.equal(scoreDeal(deal({ ebitda: 2.5 }), only('margin')).score, 50); // 5 % vs 10 % target
  assert.equal(scoreDeal(deal({ ebitda: -1 }), only('margin')).score, 0);
  assert.equal(scoreDeal(deal({ growth: 0 }), only('growth')).score, 50); // 5 pts short over 10 pts tolerance
  assert.equal(scoreDeal(deal({ growth: -20 }), only('growth')).score, 0);
  assert.equal(scoreDeal(deal({ netDebt: 70 }), only('leverage')).score, 50); // 7x vs 3.5x
  assert.equal(scoreDeal(deal({ netDebt: -5 }), only('leverage')).score, 100); // net cash
  assert.equal(scoreDeal(deal({ ebitda: -2, netDebt: 5 }), only('leverage')).score, 0);
});

test('missing KPIs get a neutral score and are flagged as unknown', () => {
  const { parts } = scoreDeal(deal({ growth: null }), DEFAULT_CRITERIA);
  const growth = parts.find((p) => p.key === 'growth');
  assert.equal(growth.value, UNKNOWN_SCORE);
  assert.equal(growth.known, false);
});

test('weights drive the final score and inactive criteria are ignored', () => {
  const weak = deal({ growth: 0 }); // growth sub-score 0.5, everything else 1
  const heavyGrowth = { ...DEFAULT_CRITERIA, weights: { size: 1, margin: 1, growth: 2, leverage: 0 } };
  assert.equal(scoreDeal(weak, heavyGrowth).score, 75); // (1 + 1 + 0.5*2) / 4
  const noGrowth = { ...DEFAULT_CRITERIA, growthMin: null };
  assert.equal(scoreDeal(weak, noGrowth).score, 100);
  const nothing = { ...DEFAULT_CRITERIA, weights: { size: 0, margin: 0, growth: 0, leverage: 0 } };
  assert.deepEqual(scoreDeal(weak, nothing), { score: 100, parts: [] });
});

test('sector and country act as case-insensitive hard filters', () => {
  assert.ok(passesFilters(deal(), DEFAULT_CRITERIA));
  assert.ok(passesFilters(deal(), { ...DEFAULT_CRITERIA, sectors: ['software'], countries: ['France', 'Spain'] }));
  assert.ok(!passesFilters(deal(), { ...DEFAULT_CRITERIA, sectors: ['Healthcare'] }));
  assert.ok(!passesFilters(deal({ country: '' }), { ...DEFAULT_CRITERIA, countries: ['France'] }));
});

test('rankDeals filters, sorts by score then EBITDA then name', () => {
  const deals = [
    deal({ id: 'a', name: 'Bravo', ebitda: 10 }),
    deal({ id: 'b', name: 'Alpha', ebitda: 10 }),
    deal({ id: 'c', name: 'Big', revenue: 90, ebitda: 18, netDebt: 0 }),
    deal({ id: 'd', name: 'Weak', growth: -30 }),
    deal({ id: 'e', name: 'Elsewhere', sector: 'Retail' }),
  ];
  const ranked = rankDeals(deals, { ...DEFAULT_CRITERIA, sectors: ['Software'] });
  assert.deepEqual(ranked.map((r) => r.deal.id), ['c', 'b', 'a', 'd']);
  assert.ok(ranked.at(-1).score < 100);
});

test('distinctValues returns sorted unique non-empty values', () => {
  const deals = [deal({ sector: 'b' }), deal({ sector: 'a' }), deal({ sector: 'b' }), deal({ sector: '' })];
  assert.deepEqual(distinctValues(deals, 'sector'), ['a', 'b']);
});
