import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBarsCsv, barsToCsv } from '../src/csv.js';
import { scoreText, sessionDate, dailySentiment } from '../src/sentiment.js';
import { toLogEntry, upsert, settle, trackStats, evaluateEntry, withOutcomes, historySummary } from '../src/tracker.js';
import { parseYahooChart, parseRss } from '../scripts/sources.js';

test('CSV round trip, sorting, dedupe and Yahoo-style headers', () => {
  const csv = 'Date,Open,High,Low,Close,Adj Close,Volume\n2024-01-03,2,3,1,2.5,2.4,100\n2024-01-02,1,2,1,1.5,1.4,50\n2024-01-03,2,3,1,2.6,2.5,100\n';
  const bars = parseBarsCsv(csv);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].date, '2024-01-02');
  assert.equal(bars[1].close, 2.6);
  assert.deepEqual(parseBarsCsv(barsToCsv(bars)), bars);
  assert.throws(() => parseBarsCsv('Date,Open\n2024-01-01,1'), /Missing column/);
});

test('sentiment scores headlines with negation and intensifiers', () => {
  assert.ok(scoreText('Apple beats estimates, shares surge') > 0.5);
  assert.ok(scoreText('Nvidia plunges after earnings miss and downgrade') < -0.5);
  assert.equal(scoreText('Company to hold annual meeting on Tuesday'), 0);
  assert.ok(scoreText('Revenue did not beat expectations') < 0);
  assert.ok(scoreText('Shares rise sharply') > scoreText('Shares rise'));
});

test('news after the 16:00 New York close counts for the next session', () => {
  assert.equal(sessionDate('2024-03-05T15:00:00Z'), '2024-03-05'); // 10:00 EST
  assert.equal(sessionDate('2024-03-05T21:30:00Z'), '2024-03-06'); // 16:30 EST
  assert.equal(sessionDate('2024-07-05T19:59:00Z'), '2024-07-05'); // 15:59 EDT
});

test('daily sentiment aligns weekend news to the next trading day', () => {
  const dates = ['2024-03-08', '2024-03-11']; // Friday, Monday
  const agg = dailySentiment([
    { publishedAt: '2024-03-08T15:00:00Z', score: 0.5 },
    { publishedAt: '2024-03-09T12:00:00Z', score: -1 }, // Saturday -> Monday
    { publishedAt: '2024-03-10T12:00:00Z', score: 0 }, // Sunday -> Monday
    { publishedAt: '2024-03-12T15:00:00Z', score: 1 }, // after last bar -> ignored
  ], dates);
  assert.deepEqual(agg.get('2024-03-08'), { score: 0.5, count: 1 });
  assert.deepEqual(agg.get('2024-03-11'), { score: -0.5, count: 2 });
  assert.equal(agg.size, 2);
});

test('tracker logs, settles and scores forecasts', () => {
  const result = { asOf: '2024-03-08', lastClose: 100, forecast: { predictedClose: 101, lower: 98, upper: 104, signal: 'BUY' } };
  let log = upsert([], toLogEntry('AAA', result, '2024-03-08T22:00:00Z'));
  log = upsert(log, toLogEntry('AAA', { ...result, forecast: { ...result.forecast, predictedClose: 102 } }, 'later'));
  assert.equal(log.length, 1);
  assert.equal(log[0].predictedClose, 102);

  assert.deepEqual(trackStats(log), { settled: 0, pending: 1 });
  log = settle(log, 'AAA', [{ date: '2024-03-08', close: 100 }, { date: '2024-03-11', close: 103 }]);
  assert.equal(log[0].targetDate, '2024-03-11');
  assert.equal(log[0].actualClose, 103);
  const stats = trackStats(log);
  assert.equal(stats.settled, 1);
  assert.equal(stats.hitRate, 1);
  assert.equal(stats.intervalCoverage, 1);
  assert.ok(Math.abs(stats.mape - 1 / 103) < 1e-12);
});

test('history grades BUY / SELL / HOLD calls and interval coverage', () => {
  const opts = { options: { threshold: 0.002, cost: 0.0005 } };
  const make = (symbol, asOf, signal, predictedClose) => toLogEntry(symbol, {
    ...opts,
    asOf,
    lastClose: 100,
    forecast: {
      predictedClose, lower: 95, upper: 105, signal, probUp: 0.5,
      intervals: [{ level: 0.95, lower: 95, upper: 105 }, { level: 0.5, lower: 99, upper: 101 }, { level: 0.25, lower: 99.5, upper: 100.5 }],
    },
  }, 'now');
  let log = [make('AAA', '2024-03-07', 'BUY', 101), make('AAA', '2024-03-08', 'SELL', 99), make('BBB', '2024-03-08', 'HOLD', 100)];
  assert.equal(log[0].hurdle, 0.003);
  log = settle(log, 'AAA', [{ date: '2024-03-07', close: 100 }, { date: '2024-03-08', close: 102 }, { date: '2024-03-11', close: 101 }]);
  log = settle(log, 'BBB', [{ date: '2024-03-08', close: 100 }, { date: '2024-03-11', close: 100.2 }]);

  const [buy, sell, hold] = log.map(evaluateEntry);
  assert.equal(buy.correct, true); // 100 -> 102
  assert.ok(Math.abs(buy.pnl - 0.02) < 1e-12);
  assert.equal(sell.correct, false); // lastClose 100 -> 101: the SELL lost 1%
  assert.ok(Math.abs(sell.pnl + 0.01) < 1e-12);
  assert.equal(hold.correct, true); // +0.2% stays inside the 0.3% hurdle
  assert.equal(hold.pnl, 0);
  assert.deepEqual(buy.intervals, { 0.95: true, 0.5: false, 0.25: false });
  assert.equal(evaluateEntry({ ...log[0], actualClose: null }), null);
  assert.equal(evaluateEntry({ ...log[2], hurdle: undefined, actualClose: 101 }).correct, false); // default hurdle

  const { overall, bySymbol } = historySummary(log);
  assert.equal(overall.settled, 3);
  assert.ok(Math.abs(overall.recommendations.accuracy - 2 / 3) < 1e-12);
  assert.deepEqual(overall.recommendations.bySignal, { BUY: { n: 1, correct: 1 }, SELL: { n: 1, correct: 0 }, HOLD: { n: 1, correct: 1 } });
  assert.equal(overall.recommendations.trades, 2);
  assert.ok(Math.abs(overall.recommendations.meanTradeReturn - 0.005) < 1e-12);
  assert.ok(Math.abs(overall.recommendations.cumulativeReturn - (1.02 * 0.99 - 1)) < 1e-12);
  assert.equal(overall.coverage[0.95], 1);
  assert.ok(Math.abs(overall.coverage[0.5] - 2 / 3) < 1e-12); // 101 and 100.2 inside [99, 101]
  assert.deepEqual(bySymbol.map((b) => [b.symbol, b.stats.settled]), [['AAA', 2], ['BBB', 1]]);

  const graded = withOutcomes(log);
  assert.equal(graded[0].basedOn, '2024-03-08'); // most recent first
  assert.ok(graded.every((e) => e.outcome));
});

test('Yahoo chart parsing adjusts prices and drops the in-progress session', () => {
  const payload = {
    chart: {
      result: [{
        meta: { gmtoffset: -18000, currentTradingPeriod: { regular: { start: 1700145000, end: 1700168400 } } },
        timestamp: [1699972200, 1700058600, 1700145000],
        indicators: {
          quote: [{ open: [10, 11, 12], high: [11, 12, 13], low: [9, 10, 11], close: [10, 11, 12.5], volume: [5, 6, null] }],
          adjclose: [{ adjclose: [5, 5.5, 6.25] }],
        },
      }],
    },
  };
  const during = parseYahooChart(payload, 1700150000 * 1000);
  assert.equal(during.length, 2);
  assert.deepEqual(during[0], { date: '2023-11-14', open: 5, high: 5.5, low: 4.5, close: 5, volume: 5 });
  const after = parseYahooChart(payload, 1700170000 * 1000);
  assert.equal(after.length, 3);
  assert.equal(after[2].volume, 0);
  assert.throws(() => parseYahooChart({ chart: { result: null, error: { description: 'No data' } } }), /No data/);
});

test('RSS parsing decodes entities and skips undated items', () => {
  const xml = `<rss><channel>
    <item><title>Apple &amp; Google <![CDATA[rally]]></title><link>https://x/1</link><pubDate>Tue, 05 Mar 2024 15:00:00 +0000</pubDate></item>
    <item><title>No date</title></item>
  </channel></rss>`;
  assert.deepEqual(parseRss(xml), [{ title: 'Apple & Google rally', link: 'https://x/1', publishedAt: '2024-03-05T15:00:00.000Z' }]);
});
