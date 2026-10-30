// Alpha Vantage intraday equities. The public "demo" key only works for IBM;
// a free personal key (alphavantage.co/support/#api-key) unlocks any ticker.

const API_URL = 'https://www.alphavantage.co/query';

/** Parse a TIME_SERIES_INTRADAY response into ascending bars. */
export function parseIntraday(json) {
  const message = json['Error Message'] ?? json.Information ?? json.Note;
  if (message) throw new Error(`Alpha Vantage: ${message}`);
  const key = Object.keys(json).find((k) => k.startsWith('Time Series'));
  if (!key) throw new Error('Alpha Vantage: réponse inattendue');
  return Object.entries(json[key])
    .map(([stamp, v]) => ({
      time: Date.parse(`${stamp.replace(' ', 'T')}Z`),
      open: Number(v['1. open']),
      high: Number(v['2. high']),
      low: Number(v['3. low']),
      close: Number(v['4. close']),
      volume: Number(v['5. volume']),
    }))
    .sort((a, b) => a.time - b.time);
}

export async function fetchIntraday(symbol, interval, apiKey, { fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({
    function: 'TIME_SERIES_INTRADAY',
    symbol: symbol.toUpperCase(),
    interval: interval.replace('m', 'min'),
    outputsize: 'full',
    apikey: apiKey || 'demo',
  });
  const response = await fetchImpl(`${API_URL}?${params}`);
  if (!response.ok) throw new Error(`Alpha Vantage: HTTP ${response.status}`);
  return parseIntraday(await response.json());
}
