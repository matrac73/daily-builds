// Binance public market data (no API key, CORS enabled).
// data-api.binance.vision / data-stream.binance.vision serve market data only.

const REST_URL = 'https://data-api.binance.vision/api/v3/klines';
const WS_URL = 'wss://data-stream.binance.vision/ws';
const MAX_LIMIT = 1000;

/** REST kline row -> bar. Index 9 is the taker-buy base volume (order-flow proxy). */
export function parseKline(row) {
  return {
    time: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: row[6],
    takerBuy: Number(row[9]),
  };
}

/** WebSocket kline payload -> { bar, closed }. */
export function parseStreamKline(message) {
  const k = message.k;
  return {
    closed: k.x,
    bar: {
      time: k.t,
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
      closeTime: k.T,
      takerBuy: Number(k.V),
    },
  };
}

/** Fetch the last `count` closed klines, paging backwards 1000 at a time. */
export async function fetchKlines(symbol, interval, count, { fetchImpl = fetch, now = Date.now() } = {}) {
  const pages = [];
  let remaining = count + 1; // +1 because the still-open bar is dropped below
  let endTime = null;
  while (remaining > 0) {
    const limit = Math.min(MAX_LIMIT, remaining);
    const params = new URLSearchParams({ symbol: symbol.toUpperCase(), interval, limit: String(limit) });
    if (endTime !== null) params.set('endTime', String(endTime));
    const response = await fetchImpl(`${REST_URL}?${params}`);
    const body = await response.json();
    if (!response.ok || !Array.isArray(body)) {
      throw new Error(`Binance: ${body?.msg ?? response.status}`);
    }
    if (body.length === 0) break;
    pages.unshift(body.map(parseKline));
    remaining -= body.length;
    endTime = body[0][0] - 1;
    if (body.length < limit) break;
  }
  return pages.flat().filter((bar) => bar.closeTime < now).slice(-count);
}

/**
 * Subscribe to the live kline stream with automatic reconnection.
 * Returns a function that closes the subscription.
 */
export function subscribeKlines(symbol, interval, { onBar, onTick, onStatus }) {
  const url = `${WS_URL}/${symbol.toLowerCase()}@kline_${interval}`;
  let socket = null;
  let stopped = false;
  let retry = 0;

  const connect = () => {
    onStatus?.('connecting');
    socket = new WebSocket(url);
    socket.onopen = () => {
      retry = 0;
      onStatus?.('open');
    };
    socket.onmessage = (event) => {
      const { bar, closed } = parseStreamKline(JSON.parse(event.data));
      if (closed) onBar(bar);
      else onTick?.(bar);
    };
    socket.onclose = () => {
      if (stopped) return;
      onStatus?.('reconnecting');
      retry += 1;
      setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry));
    };
    socket.onerror = () => socket.close();
  };

  connect();
  return () => {
    stopped = true;
    socket?.close();
    onStatus?.('closed');
  };
}
