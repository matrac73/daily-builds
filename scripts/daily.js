#!/usr/bin/env node
// Daily job: refresh prices + news, settle yesterday's forecasts, retrain, forecast the next session
// and write data/forecasts.json for the web dashboard.
//
// Usage: node scripts/daily.js [--offline] [--symbols AAPL,MSFT]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseBarsCsv, barsToCsv, sortAndDedupe } from '../src/csv.js';
import { scoreText, dailySentiment } from '../src/sentiment.js';
import { runPipeline } from '../src/pipeline.js';
import { toLogEntry, upsert, settle, trackStats } from '../src/tracker.js';
import { fetchBars, fetchNews } from './sources.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const KEEP_HEADLINES = 1000;
const CHART_DAYS = 120;

const fileSafe = (symbol) => symbol.replace(/[^A-Za-z0-9.-]/g, '_');

async function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : fallback;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 1) + '\n');
}

/** Merge freshly fetched bars into the CSV cache (or just read the cache when offline). */
async function loadBars(symbol, range, offline, warnings) {
  const path = join(DATA, 'bars', `${fileSafe(symbol)}.csv`);
  const cached = existsSync(path) ? parseBarsCsv(await readFile(path, 'utf8')) : [];
  if (offline) return cached;
  try {
    // Fresh adjusted history replaces the cache (dividends/splits re-adjust past prices).
    const bars = sortAndDedupe(await fetchBars(symbol, range));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, barsToCsv(bars));
    return bars;
  } catch (err) {
    warnings.push(`${symbol}: price download failed (${err.message}), using cache`);
    return cached;
  }
}

/** Append newly seen headlines (scored once, at ingestion) to the per-symbol news archive. */
async function loadNews(symbol, offline, warnings) {
  const path = join(DATA, 'news', `${fileSafe(symbol)}.json`);
  const archive = await readJson(path, []);
  if (offline) return archive;
  try {
    const seen = new Set(archive.map((h) => h.title));
    const fresh = (await fetchNews(symbol))
      .filter((h) => !seen.has(h.title))
      .map((h) => ({ ...h, score: Math.round(scoreText(h.title) * 1000) / 1000 }));
    const merged = [...archive, ...fresh]
      .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
      .slice(-KEEP_HEADLINES);
    await writeJson(path, merged);
    return merged;
  } catch (err) {
    warnings.push(`${symbol}: news download failed (${err.message})`);
    return archive;
  }
}

function summarise(symbol, name, bars, news, result, log) {
  const { evaluation } = result;
  const tail = (arr) => arr.slice(-CHART_DAYS);
  const entries = log.filter((e) => e.symbol === symbol);
  return {
    symbol,
    name,
    asOf: result.asOf,
    lastClose: result.lastClose,
    forecast: result.forecast,
    edge: result.edge,
    model: result.model,
    metrics: evaluation.metrics,
    backtest: evaluation.backtest,
    oos: {
      dates: tail(evaluation.oos.dates),
      actual: tail(evaluation.oos.actual),
      predicted: tail(evaluation.oos.predicted),
    },
    prices: bars.slice(-CHART_DAYS).map((b) => [b.date, b.close]),
    news: news.slice(-12).reverse(),
    track: { stats: trackStats(entries), entries: entries.slice(-30).reverse() },
  };
}

async function main() {
  const { values } = parseArgs({ options: { offline: { type: 'boolean' }, symbols: { type: 'string' } } });
  const config = await readJson(join(DATA, 'config.json'), null);
  if (!config) throw new Error('data/config.json not found');
  const wanted = values.symbols?.split(',').map((s) => s.trim().toUpperCase());
  const stocks = config.stocks.filter((s) => !wanted || wanted.includes(s.symbol.toUpperCase()));

  const warnings = [];
  const markets = new Map();
  let log = await readJson(join(DATA, 'predictions.json'), []);
  const results = [];
  const madeAt = new Date().toISOString();

  for (const { symbol, name, market } of stocks) {
    try {
      if (market && !markets.has(market)) markets.set(market, await loadBars(market, config.range, values.offline, warnings));
      const bars = await loadBars(symbol, config.range, values.offline, warnings);
      const news = await loadNews(symbol, values.offline, warnings);
      const sentiment = dailySentiment(news, bars.map((b) => b.date));
      const result = runPipeline(bars, { market: markets.get(market), sentiment });

      log = settle(log, symbol, bars);
      log = upsert(log, toLogEntry(symbol, result, madeAt));
      results.push(summarise(symbol, name, bars, news, result, log));

      const f = result.forecast;
      console.log(
        `${symbol.padEnd(6)} ${result.asOf} close ${result.lastClose.toFixed(2)} -> ${f.predictedClose.toFixed(2)} ` +
          `(${(f.expectedReturn * 100).toFixed(2)}%, P(up) ${(f.probUp * 100).toFixed(0)}%) ${f.signal}`,
      );
    } catch (err) {
      warnings.push(`${symbol}: skipped (${err.message})`);
    }
  }

  await writeJson(join(DATA, 'predictions.json'), log);
  await writeJson(join(DATA, 'forecasts.json'), { generatedAt: madeAt, warnings, results });
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (results.length === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
