import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCurrency, formatDate, formatTime, pluralize, sumSales } from '../src/format.js';

describe('formatCurrency', () => {
  it('formats amounts as US dollars with two decimals', () => {
    assert.equal(formatCurrency(1234.5), '$1,234.50');
    assert.equal(formatCurrency(0), '$0.00');
  });
});

describe('formatDate', () => {
  it('formats ISO calendar dates without timezone drift', () => {
    assert.equal(formatDate('2026-11-02'), 'Nov 2, 2026');
    assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026');
    assert.equal(formatDate('2026-12-31'), 'Dec 31, 2026');
  });
});

describe('formatTime', () => {
  it('zero-pads every component, including milliseconds', () => {
    assert.equal(formatTime(new Date(2026, 0, 5, 9, 3, 7, 45)), '09:03:07.045');
    assert.equal(formatTime(new Date(2026, 0, 5, 23, 59, 59, 999)), '23:59:59.999');
  });
});

describe('pluralize', () => {
  it('only adds an "s" when the count is not one', () => {
    assert.equal(pluralize(0, 'row'), '0 rows');
    assert.equal(pluralize(1, 'row'), '1 row');
    assert.equal(pluralize(2, 'customer'), '2 customers');
  });
});

describe('sumSales', () => {
  it('adds up totalSales and tolerates rows without the field', () => {
    assert.equal(sumSales([{ totalSales: 10.5 }, { totalSales: 4.5 }, {}]), 15);
    assert.equal(sumSales([]), 0);
  });
});
