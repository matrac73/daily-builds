// Fit scoring: how close is a deal to the platform-acquisition profile the user is looking for?

export const DEFAULT_CRITERIA = Object.freeze({
  revenueMin: 10,
  revenueMax: 100,
  marginMin: 10,
  growthMin: 5,
  leverageMax: 3.5,
  sectors: [],
  countries: [],
  weights: { size: 3, margin: 3, growth: 2, leverage: 2 },
});

/** Score given to a criterion when the deal does not disclose the underlying KPI. */
export const UNKNOWN_SCORE = 0.5;

/** Growth shortfall (in percentage points) at which the growth sub-score reaches 0. */
const GROWTH_TOLERANCE = 10;

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** EBITDA margin in percent, or null when it cannot be computed. */
export function ebitdaMargin(deal) {
  if (deal.ebitda == null || !deal.revenue) return null;
  return (deal.ebitda / deal.revenue) * 100;
}

/** Net debt / EBITDA multiple. Net cash gives a negative multiple; null if EBITDA <= 0 or unknown. */
export function leverage(deal) {
  if (deal.netDebt == null || deal.ebitda == null || deal.ebitda <= 0) return null;
  return deal.netDebt / deal.ebitda;
}

function sizeScore(deal, c) {
  const r = deal.revenue;
  if (r == null) return null;
  if (r <= 0) return 0;
  if (c.revenueMin != null && r < c.revenueMin) return clamp01(r / c.revenueMin);
  if (c.revenueMax != null && r > c.revenueMax) return clamp01(c.revenueMax / r);
  return 1;
}

function marginScore(deal, c) {
  const m = ebitdaMargin(deal);
  if (m == null) return null;
  if (m >= c.marginMin) return 1;
  if (m <= 0 || c.marginMin <= 0) return 0;
  return clamp01(m / c.marginMin);
}

function growthScore(deal, c) {
  if (deal.growth == null) return null;
  return clamp01(1 - (c.growthMin - deal.growth) / GROWTH_TOLERANCE);
}

function leverageScore(deal, c) {
  if (deal.netDebt != null && deal.netDebt <= 0) return 1;
  if (deal.ebitda != null && deal.ebitda <= 0 && deal.netDebt > 0) return 0;
  const lev = leverage(deal);
  if (lev == null) return null;
  if (lev <= c.leverageMax) return 1;
  return c.leverageMax <= 0 ? 0 : clamp01(c.leverageMax / lev);
}

const CRITERIA = [
  { key: 'size', label: 'Size', active: (c) => c.revenueMin != null || c.revenueMax != null, score: sizeScore },
  { key: 'margin', label: 'EBITDA margin', active: (c) => c.marginMin != null, score: marginScore },
  { key: 'growth', label: 'Growth', active: (c) => c.growthMin != null, score: growthScore },
  { key: 'leverage', label: 'Leverage', active: (c) => c.leverageMax != null, score: leverageScore },
];

/** Hard filters: sector and geography must match when a selection is made (case-insensitive). */
export function passesFilters(deal, criteria) {
  const inList = (list, value) =>
    !list?.length || list.some((v) => v.toLowerCase() === String(value ?? '').toLowerCase());
  return inList(criteria.sectors, deal.sector) && inList(criteria.countries, deal.country);
}

/**
 * Weighted fit score from 0 to 100, with the breakdown per criterion.
 * Inactive criteria (no threshold) and zero weights are ignored.
 */
export function scoreDeal(deal, criteria) {
  const parts = [];
  for (const crit of CRITERIA) {
    const weight = criteria.weights?.[crit.key] ?? 0;
    if (weight <= 0 || !crit.active(criteria)) continue;
    const raw = crit.score(deal, criteria);
    parts.push({ key: crit.key, label: crit.label, weight, value: raw ?? UNKNOWN_SCORE, known: raw != null });
  }
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const weighted = parts.reduce((sum, p) => sum + p.value * p.weight, 0);
  const score = totalWeight === 0 ? 100 : Math.round((weighted / totalWeight) * 100);
  return { score, parts };
}

/** Filter then rank deals from best to worst fit. Ties are broken by EBITDA, then name. */
export function rankDeals(deals, criteria) {
  return deals
    .filter((deal) => passesFilters(deal, criteria))
    .map((deal) => ({ deal, ...scoreDeal(deal, criteria) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.deal.ebitda ?? -Infinity) - (a.deal.ebitda ?? -Infinity) ||
        a.deal.name.localeCompare(b.deal.name),
    );
}

/** Distinct, sorted, non-empty values of a text field — used to build the filter chips. */
export function distinctValues(deals, field) {
  return [...new Set(deals.map((d) => d[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
