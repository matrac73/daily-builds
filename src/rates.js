/**
 * Exchange-rate loading: live ECB reference rates via the Frankfurter API,
 * with a bundled snapshot as a fallback so the app keeps working offline.
 */

export const RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR';

/** Snapshot of ECB reference rates, used when the live API is unreachable. */
export const FALLBACK_RATES = Object.freeze({
  base: 'EUR',
  date: '2026-11-10',
  rates: Object.freeze({
    AUD: 1.6244, BRL: 6.2257, CAD: 1.5852, CHF: 0.9203, CNY: 7.4801,
    CZK: 24.337, DKK: 7.4754, EUR: 1, GBP: 0.83545, HKD: 8.7973,
    HUF: 362.98, IDR: 20255.34, ILS: 3.5507, INR: 105.3315, ISK: 137.2,
    JPY: 177.38, KRW: 1501.56, MXN: 20.8063, MYR: 4.5484, NOK: 10.6155,
    NZD: 1.9925, PHP: 70.54, PLN: 4.387, RON: 5.3442, SEK: 10.991,
    SGD: 1.4335, THB: 37.522, TRY: 56.3207, USD: 1.1214, ZAR: 18.3861,
  }),
});

/**
 * Validates an API payload and returns a rate table that includes the base
 * currency itself (the API omits it).
 *
 * @param {unknown} payload
 * @returns {{ base: string, date: string, rates: Record<string, number> }}
 */
export function normalizeRates(payload) {
  const { base, date, rates } = payload ?? {};
  if (typeof base !== 'string' || typeof date !== 'string' || typeof rates !== 'object' || rates === null) {
    throw new TypeError('Malformed exchange-rate payload');
  }
  const table = { [base]: 1 };
  for (const [code, rate] of Object.entries(rates)) {
    if (typeof rate === 'number' && rate > 0) table[code] = rate;
  }
  if (Object.keys(table).length < 2) {
    throw new TypeError('Exchange-rate payload contains no usable rates');
  }
  return { base, date, rates: table };
}

/**
 * Loads the latest rates, falling back to the bundled snapshot on any failure.
 *
 * @param {typeof fetch} [fetchFn] injectable for tests
 * @returns {Promise<{ base: string, date: string, rates: Record<string, number>, live: boolean }>}
 */
export async function loadRates(fetchFn = globalThis.fetch) {
  try {
    const response = await fetchFn(RATES_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ...normalizeRates(await response.json()), live: true };
  } catch {
    return { ...FALLBACK_RATES, live: false };
  }
}
