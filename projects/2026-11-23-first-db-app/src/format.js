const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** 1234.5 → "$1,234.50" */
export const formatCurrency = (amount) => currencyFormat.format(amount);

/** ISO calendar date "2026-11-02" → "Nov 2, 2026" (no timezone drift). */
export const formatDate = (isoDate) => dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

/** Local wall-clock time with milliseconds, e.g. "14:03:27.045". */
export function formatTime(date) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** (1, "customer") → "1 customer"; (3, "customer") → "3 customers" */
export const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Sum of the `totalSales` field across rows, ignoring rows without one. */
export const sumSales = (rows) => rows.reduce((total, row) => total + (row.totalSales ?? 0), 0);
