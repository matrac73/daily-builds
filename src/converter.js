/**
 * Pure conversion logic: no DOM, no network. Everything here is unit tested.
 */

export const MAX_DIGITS = 9;

export const AmountError = Object.freeze({
  EMPTY: 'empty',
  NOT_A_NUMBER: 'not-a-number',
  TOO_MANY_DIGITS: 'too-many-digits',
});

const AMOUNT_PATTERN = /^\d*[.,]?\d*$/;

/**
 * Parses what the user typed into an amount.
 * Accepts plain digits with an optional decimal separator ("." or ",").
 *
 * @param {string} raw
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function parseAmount(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: false, error: AmountError.EMPTY };

  const digitCount = text.replace(/\D/g, '').length;
  if (!AMOUNT_PATTERN.test(text) || digitCount === 0) {
    return { ok: false, error: AmountError.NOT_A_NUMBER };
  }
  if (digitCount > MAX_DIGITS) {
    return { ok: false, error: AmountError.TOO_MANY_DIGITS };
  }
  return { ok: true, value: Number(text.replace(',', '.')) };
}

/**
 * Converts an amount between two currencies using rates expressed against a
 * common base (the base itself has a rate of 1).
 *
 * @param {number} amount
 * @param {string} from currency code
 * @param {string} to currency code
 * @param {Record<string, number>} rates
 * @returns {number} unrounded converted amount
 */
export function convert(amount, from, to, rates) {
  for (const code of [from, to]) {
    if (!(rates[code] > 0)) throw new RangeError(`Unknown currency: ${code}`);
  }
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}

/**
 * Rounds to two decimal places. Trimming the scaled value to 15 significant
 * digits first absorbs binary float drift, so 1.005 gives 1.01 rather than 1.
 */
export function roundToCents(value) {
  return Math.round(Number((value * 100).toPrecision(15))) / 100;
}

/**
 * Formats an amount with exactly two decimals and locale-aware grouping.
 *
 * @param {number} value
 * @param {string} [locale]
 */
export function formatAmount(value, locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundToCents(value));
}

/**
 * Formats a unit exchange rate with six significant digits, so both
 * 0.00554 (JPY → EUR) and 18,063.4 (EUR → IDR) stay readable.
 *
 * @param {number} rate
 * @param {string} [locale]
 */
export function formatRate(rate, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(rate);
}

/**
 * Builds the alphabetically sorted list of currencies shown in the drop-downs.
 *
 * @param {Record<string, number>} rates
 * @param {string} [locale]
 * @returns {{ code: string, name: string }[]}
 */
export function listCurrencies(rates, locale = 'en') {
  const names = new Intl.DisplayNames([locale], { type: 'currency', fallback: 'code' });
  return Object.keys(rates)
    .sort()
    .map((code) => ({ code, name: names.of(code) }));
}
