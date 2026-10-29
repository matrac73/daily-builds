// Network data sources (Node only): Yahoo Finance daily chart API and per-ticker news RSS.

import { sortAndDedupe } from '../src/csv.js';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (stock-predictor; +https://github.com)' };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/**
 * Parse a Yahoo chart API payload into split/dividend-adjusted OHLCV bars.
 * A bar for a session still in progress at `now` is dropped: its "close" is not final.
 */
export function parseYahooChart(json, now = Date.now()) {
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp) throw new Error(json?.chart?.error?.description ?? 'Empty chart payload');
  const offset = result.meta?.gmtoffset ?? 0;
  const session = result.meta?.currentTradingPeriod?.regular;
  const q = result.indicators.quote[0];
  const adj = result.indicators.adjclose?.[0]?.adjclose;
  const bars = [];
  result.timestamp.forEach((ts, i) => {
    if (session && ts >= session.start && now / 1000 < session.end) return;
    const close = q.close[i];
    if (![q.open[i], q.high[i], q.low[i], close].every((v) => Number.isFinite(v) && v > 0)) return;
    const factor = adj && Number.isFinite(adj[i]) ? adj[i] / close : 1;
    const round = (v) => Math.round(v * factor * 10000) / 10000;
    bars.push({
      date: new Date((ts + offset) * 1000).toISOString().slice(0, 10),
      open: round(q.open[i]),
      high: round(q.high[i]),
      low: round(q.low[i]),
      close: round(close),
      volume: q.volume[i] ?? 0,
    });
  });
  return sortAndDedupe(bars);
}

export async function fetchBars(symbol, range = '5y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div,split`;
  return parseYahooChart(JSON.parse(await get(url)));
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m]).trim();
}

/** Extract { title, link, publishedAt } items from an RSS 2.0 document. */
export function parseRss(xml) {
  const items = [];
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (name) => body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];
    const title = tag('title');
    const pub = tag('pubDate');
    if (!title || !pub || Number.isNaN(Date.parse(pub))) continue;
    items.push({ title: decode(title), link: decode(tag('link') ?? ''), publishedAt: new Date(pub).toISOString() });
  }
  return items;
}

export async function fetchNews(symbol) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  return parseRss(await get(url));
}
