// Application controller: reads the form, loads data, runs the walk-forward
// engine, streams live bars and renders the four tabs.

import './ui/line-chart.js';
import './ui/stat-grid.js';
import './ui/weight-bars.js';
import './ui/tab-bar.js';
import { bps, dateTime, money, num, pct, price, signed, tone } from './ui/format.js';
import { breakEvenCost, costLevelsFor, costSensitivity } from './core/analysis.js';
import { COST_PRESETS, INTERVAL_MINUTES, calendar, inferIntervalMinutes } from './core/markets.js';
import { computeMetrics, equityCurve } from './core/metrics.js';
import { projectPnl } from './core/projection.js';
import { oneWayCost, runBacktest } from './core/strategy.js';
import { SyntheticMarket } from './core/synthetic.js';
import { fetchKlines, subscribeKlines } from './data/binance.js';
import { fetchIntraday } from './data/alphavantage.js';
import { parseCsv } from './data/csv.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#controls');

const SOURCES = {
  binance: { market: 'crypto', symbol: 'BTCUSDT', interval: '1m', live: true },
  alphavantage: { market: 'stock', symbol: 'IBM', interval: '5m', live: false },
  synthetic: { market: 'stock', symbol: 'SYNTH', interval: '1m', live: true },
  csv: { market: null, symbol: '', interval: null, live: false },
};
const LIVE_WINDOW = 240;
const JOURNAL_ROWS = 15;
const SYNTHETIC_TICK_MS = 1500;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const COLORS = { price: '#e5e7eb', pred: '#f59e0b', net: '#34d399', gross: '#60a5fa', bench: '#9ca3af', band: '#34d399', pos: '#a78bfa' };

let state = null;
let stopLive = null;
let runId = 0;

// ---------- form ----------

function readConfig() {
  const f = new FormData(form);
  const source = f.get('source');
  const costs = {
    feeBps: Number(f.get('feeBps')) || 0,
    spreadBps: Number(f.get('spreadBps')) || 0,
    slippageBps: Number(f.get('slippageBps')) || 0,
  };
  return {
    source,
    symbol: String(f.get('symbol')).trim(),
    interval: f.get('interval'),
    history: Number(f.get('history')),
    apiKey: String(f.get('apiKey')).trim(),
    file: f.get('csvFile'),
    market: SOURCES[source].market ?? f.get('market'),
    strategy: { costs, horizon: Number(f.get('horizon')), thresholdMult: Number(f.get('thresholdMult')) || 0, allowShort: f.get('allowShort') === 'on' },
    capital: Number(f.get('capital')) || 10000,
  };
}

function applyPreset(market) {
  for (const [key, value] of Object.entries(COST_PRESETS[market])) form.elements[key].value = value;
  updateCostSummary();
}

function updateCostSummary() {
  const c = oneWayCost(readConfig().strategy.costs);
  $('#cost-summary').textContent = `Coût aller simple : ${bps(c)} · aller-retour : ${bps(2 * c)}`;
}

function onSourceChange() {
  const source = form.elements.source.value;
  for (const el of form.querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').includes(source);
  form.elements.symbol.value = SOURCES[source].symbol;
  if (SOURCES[source].interval) form.elements.interval.value = SOURCES[source].interval;
  applyPreset(SOURCES[source].market ?? form.elements.market.value);
}

function setMessage(text, kind = '') {
  const el = $('#message');
  el.textContent = text;
  el.dataset.kind = kind;
}

function setLiveStatus(status, text) {
  $('#live-status').dataset.state = status;
  $('#live-status-text').textContent = text;
}

// ---------- data loading ----------

async function loadBars(cfg) {
  switch (cfg.source) {
    case 'binance':
      return { bars: await fetchKlines(cfg.symbol, cfg.interval, cfg.history) };
    case 'alphavantage':
      return { bars: (await fetchIntraday(cfg.symbol, cfg.interval, cfg.apiKey)).slice(-cfg.history), timeZone: 'UTC' };
    case 'synthetic': {
      const synthetic = new SyntheticMarket({ intervalMs: INTERVAL_MINUTES[cfg.interval] * 60_000, startTime: Date.now() - cfg.history * INTERVAL_MINUTES[cfg.interval] * 60_000 });
      return { bars: Array.from({ length: cfg.history }, () => synthetic.next()), synthetic };
    }
    case 'csv':
      if (!cfg.file || cfg.file.size === 0) throw new Error('Choisissez un fichier CSV.');
      return { bars: parseCsv(await cfg.file.text()) };
    default:
      throw new Error(`Source inconnue : ${cfg.source}`);
  }
}

async function analyse(event) {
  event?.preventDefault();
  stopLiveFeed();
  const id = ++runId;
  const cfg = readConfig();
  $('#run').disabled = true;
  setMessage('Chargement des données…');
  try {
    const { bars, timeZone, synthetic } = await loadBars(cfg);
    if (id !== runId) return;
    if (bars.length < 200) throw new Error(`Seulement ${bars.length} barres : il en faut au moins 200.`);
    const intervalMinutes = cfg.source === 'csv' ? inferIntervalMinutes(bars) : INTERVAL_MINUTES[cfg.interval];
    const { strategy, records } = runBacktest(bars, cfg.strategy);
    const cal = { ...calendar(cfg.market, intervalMinutes), horizon: cfg.strategy.horizon };
    state = { cfg, bars, records, strategy, synthetic, timeZone, cal, intervalMs: intervalMinutes * 60_000, liveStart: null, tick: null };

    renderLive();
    renderBacktest();
    renderWeek();
    setMessage(`${bars.length} barres de ${intervalMinutes} min analysées (${cfg.symbol || 'CSV'}).`, 'ok');
    $('#live-toggle').disabled = !SOURCES[cfg.source].live;
    // The cost sweep re-runs the backtest ~10 times: defer it so the first paint is immediate.
    setTimeout(() => id === runId && renderCostSweep(), 30);
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    $('#run').disabled = false;
  }
}

// ---------- live feed ----------

function ingest(bar) {
  if (!state || bar.time <= state.bars.at(-1).time) return;
  state.bars.push(bar);
  state.records.push(state.strategy.step(bar));
  state.tick = null;
  renderLive();
  renderBacktest();
}

function startLiveFeed() {
  const { cfg } = state;
  state.liveStart = state.records.length;
  if (cfg.source === 'binance') {
    stopLive = subscribeKlines(cfg.symbol, cfg.interval, {
      onBar: ingest,
      onTick: (bar) => {
        state.tick = bar;
        renderLiveStats();
      },
      onStatus: (s) =>
        setLiveStatus(s === 'open' ? 'live' : s === 'closed' ? 'idle' : 'wait', { open: `Live · ${cfg.symbol.toUpperCase()} ${cfg.interval}`, connecting: 'Connexion…', reconnecting: 'Reconnexion…', closed: 'Hors ligne' }[s]),
    });
  } else {
    const timer = setInterval(() => ingest(state.synthetic.next()), SYNTHETIC_TICK_MS);
    setLiveStatus('live', 'Live · simulation');
    stopLive = () => {
      clearInterval(timer);
      setLiveStatus('idle', 'Hors ligne');
    };
  }
  $('#live-toggle').textContent = '■ Arrêter le live';
}

function stopLiveFeed() {
  stopLive?.();
  stopLive = null;
  $('#live-toggle').textContent = '▶ Démarrer le live';
}

// ---------- rendering ----------

const fmtTime = (ms) => dateTime(ms, state.timeZone);
const positionLabel = (p) => (p > 0 ? 'LONG' : p < 0 ? 'SHORT' : 'CASH');

function renderLiveStats() {
  const { records, strategy, liveStart, tick } = state;
  const last = records.at(-1);
  const lastPrice = tick?.close ?? last.close;
  const sessionRecords = liveStart === null ? [] : records.slice(liveStart);
  const sessionPnl = equityCurve(sessionRecords.map((r) => r.netRet)).at(-1) - 1 || 0;
  const edge = strategy.cost > 0 ? Math.abs(last.pred) / strategy.cost : Infinity;

  $('#live-stats').items = [
    { label: tick ? 'Prix (barre en cours)' : 'Dernière clôture', value: price(lastPrice), hint: fmtTime(tick?.time ?? last.time) },
    { label: `Prévision ${strategy.horizon} barre(s)`, value: signed(bps(last.pred), last.pred), tone: tone(last.pred), hint: `σ barre : ${bps(last.sigma)}` },
    { label: 'Pente de calibration', value: num(strategy.calibrator.slope, 3), hint: 'compétence prouvée hors échantillon (0 = aucune)' },
    { label: 'Signal', value: positionLabel(last.position), tone: tone(last.position), hint: Number.isFinite(edge) ? `avantage / coût : ${num(edge)}×` : 'coût nul' },
    { label: 'Seuil de trading', value: bps(strategy.threshold), hint: `coût aller simple ${bps(strategy.cost)}` },
    { label: 'PnL session live', value: liveStart === null ? '—' : signed(pct(sessionPnl, 3), sessionPnl), tone: tone(sessionPnl), hint: liveStart === null ? 'démarrez le live' : `${sessionRecords.length} barre(s) reçue(s)` },
  ];
}

function renderLive() {
  const { records, strategy } = state;
  renderLiveStats();

  // Past closes, then a forecast cone over the next horizon bars: expected path ± 1σ·√k.
  const shown = records.slice(-LIVE_WINDOW);
  const last = shown.at(-1);
  const steps = Array.from({ length: strategy.horizon }, (_, i) => i + 1);
  const past = (fn) => shown.map((r, i) => (i === shown.length - 1 ? fn(0) : NaN));
  const cone = (sign) => (k) => last.close * (1 + (last.pred * k) / strategy.horizon + sign * last.sigma * Math.sqrt(k));
  $('#chart-price').data = {
    x: [...shown.map((r) => r.time), ...steps.map((k) => last.time + k * state.intervalMs)],
    series: [
      { name: 'Clôture', color: COLORS.price, values: [...shown.map((r) => r.close), ...steps.map(() => NaN)] },
      { name: `Prévision ${strategy.horizon} barre(s)`, color: COLORS.pred, dash: '4 3', width: 2, values: [...past(cone(0)), ...steps.map(cone(0))] },
    ],
    bands: [{ name: '±1σ', color: COLORS.pred, opacity: 0.15, lower: [...past(cone(-1)), ...steps.map(cone(-1))], upper: [...past(cone(1)), ...steps.map(cone(1))] }],
    xFormat: fmtTime,
    yFormat: price,
  };
  $('#chart-position').data = {
    x: shown.map((r) => r.time),
    series: [{ name: 'Position', color: COLORS.pos, values: shown.map((r) => r.position) }],
    xFormat: fmtTime,
    yFormat: (v) => num(v, 1),
    zeroLine: true,
  };

  const weights = records.at(-1).weights ?? strategy.forecaster.weights();
  $('#weights').items = strategy.expertNames.map((label, i) => ({ label, value: weights[i] }));

  $('#journal tbody').innerHTML = records
    .slice(-JOURNAL_ROWS)
    .reverse()
    .map(
      (r) => `<tr>
        <td>${fmtTime(r.time)}</td>
        <td>${price(r.close)}</td>
        <td class="${tone(r.pred)}">${signed(bps(r.pred), r.pred)}</td>
        <td class="${tone(r.position)}">${positionLabel(r.position)}</td>
        <td>${r.cost > 0 ? bps(r.cost) : '—'}</td>
        <td class="${tone(r.netRet)}">${signed(bps(r.netRet), r.netRet)}</td>
      </tr>`,
    )
    .join('');
}

function renderBacktest() {
  const { records, cal } = state;
  const m = computeMetrics(records, cal);
  if (!m) return;
  state.metrics = m;
  const t = Math.abs(m.alphaT);

  $('#bt-stats').items = [
    { label: 'Rendement net', value: signed(pct(m.totalReturn), m.totalReturn), tone: tone(m.totalReturn), hint: `brut ${pct(m.grossReturn)}` },
    { label: 'Buy & hold', value: signed(pct(m.benchReturn), m.benchReturn), tone: tone(m.benchReturn), hint: `Sharpe ${num(m.benchSharpe)}` },
    { label: 'Alpha annualisé', value: signed(pct(m.alphaAnn, 1), m.alphaAnn), tone: tone(m.alphaAnn), hint: `t = ${num(m.alphaT)} · ${bps(m.alphaPerBar, 3)} / barre` },
    { label: 'Bêta', value: num(m.beta, 3), hint: 'exposition au marché' },
    { label: 'Sharpe net annualisé', value: num(m.sharpe), tone: tone(m.sharpe), hint: `vol ${pct(m.annVol, 1)} / an` },
    { label: 'Drawdown max', value: pct(-m.maxDrawdown), tone: m.maxDrawdown > 0 ? 'neg' : '' },
    { label: 'Coûts payés', value: pct(m.totalCost), hint: `${m.trades} trades · turnover ${num(m.turnover, 0)}×` },
    { label: 'IC prévision', value: num(m.ic, 3), tone: tone(m.ic), hint: `direction juste ${pct(m.directionalAccuracy, 1)}` },
    { label: 'Taux de réussite', value: pct(m.hitRate, 1), hint: `exposé ${pct(m.exposure, 0)} du temps` },
    { label: 'Barres évaluées', value: num(m.bars, 0), hint: 'hors période de chauffe' },
  ];

  const rows = records.filter((r) => r.tradable);
  const cumulative = (key) => equityCurve(rows.map((r) => r[key])).map((e) => e - 1);
  $('#chart-equity').data = {
    x: rows.map((r) => r.time),
    series: [
      { name: 'Stratégie nette', color: COLORS.net, width: 2, values: cumulative('netRet') },
      { name: 'Stratégie brute (sans coûts)', color: COLORS.gross, dash: '5 4', values: cumulative('grossRet') },
      { name: 'Buy & hold', color: COLORS.bench, values: cumulative('benchRet') },
    ],
    xFormat: fmtTime,
    yFormat: (v) => pct(v, 1),
    zeroLine: true,
  };

  const verdict =
    t >= 2
      ? m.alphaPerBar > 0
        ? 'L’alpha est <b>positif et statistiquement significatif</b> (|t| ≥ 2) sur cette période.'
        : 'L’alpha est <b>négatif et significatif</b> : les coûts détruisent plus que le signal ne rapporte.'
      : 'L’alpha <b>n’est pas significatif</b> (|t| &lt; 2) : impossible de le distinguer du hasard sur cet échantillon.';
  $('#alpha-box').innerHTML = `
    <h2>Alpha de Jensen</h2>
    <p>Régression des rendements nets sur ceux de l’actif : <span class="formula">R<sub>s</sub> = ${bps(m.alphaPerBar, 3)} ${m.beta < 0 ? '−' : '+'} ${num(Math.abs(m.beta), 3)} · R<sub>m</sub> + ε</span></p>
    <p>${verdict} Alpha cumulé sur la période (${num(m.bars, 0)} barres) : <b>${signed(pct(m.alphaPerBar * m.bars), m.alphaPerBar)}</b> ;
    annualisé arithmétiquement sur ${num(cal.barsPerYear, 0)} barres/an : <b>${signed(pct(m.alphaAnn, 1), m.alphaAnn)}</b> (extrapolation très bruitée sur un échantillon court).
    Le coût moyen par barre est de ${bps(m.totalCost / m.bars, 3)}.</p>`;
}

function renderCostSweep() {
  const { bars, cfg, cal } = state;
  const sweep = costSensitivity(bars, cfg.strategy, costLevelsFor(cfg.strategy.costs), cal);
  $('#chart-costs').data = {
    x: sweep.map((s) => s.bps),
    series: [{ name: 'Rendement net', color: COLORS.net, width: 2, values: sweep.map((s) => s.totalReturn) }],
    xFormat: (v) => `${num(v, 1)} bp`,
    yFormat: (v) => pct(v, 1),
    zeroLine: true,
  };
  const be = breakEvenCost(sweep);
  const current = oneWayCost(cfg.strategy.costs) * 1e4;
  $('#breakeven').innerHTML =
    be === null
      ? 'Le signal ne rapporte rien même sans coûts sur cette période.'
      : be === Infinity
        ? `Rentable sur toute la plage testée (jusqu’à ${num(sweep.at(-1).bps, 1)} bp).`
        : `Coût de <b>break-even ≈ ${num(be, 2)} bp</b> aller simple, à comparer à votre coût actuel de ${num(current, 2)} bp${be > current ? ' : la marge de sécurité est positive.' : ' : trop cher pour ce signal, il faudrait des frais plus bas (maker, VIP…).'}`;
}

function renderWeek() {
  const { records, cal, cfg } = state;
  const rows = records.filter((r) => r.tradable);
  const capital = cfg.capital;
  const projection = projectPnl(
    rows.map((r) => r.netRet),
    { horizon: cal.barsPerWeek, capital },
  );
  const s = projection.stats;
  const naive = (state.metrics?.alphaPerBar ?? 0) * cal.barsPerWeek * capital;

  const lastTime = rows.at(-1).time;
  const weekRows = rows.filter((r) => r.time > lastTime - WEEK_MS);
  const spanDays = (lastTime - weekRows[0].time) / 86_400_000;
  const realized = (equityCurve(weekRows.map((r) => r.netRet)).at(-1) - 1) * capital;
  const realizedBench = (equityCurve(weekRows.map((r) => r.benchRet)).at(-1) - 1) * capital;
  const fullWeek = spanDays >= 6.5;

  $('#week-stats').items = [
    { label: 'PnL médian projeté', value: signed(money(s.median), s.median), tone: tone(s.median), hint: `moyenne ${money(s.mean)}` },
    { label: 'Intervalle 90 %', value: `${money(s.p05)} … ${money(s.p95)}`, hint: 'quantiles 5 % – 95 %' },
    { label: 'Probabilité de perte', value: pct(s.probLoss, 0), tone: s.probLoss > 0.5 ? 'neg' : 'pos' },
    { label: 'Expected shortfall 5 %', value: money(s.expectedShortfall), tone: tone(s.expectedShortfall), hint: 'perte moyenne des 5 % pires semaines' },
    { label: 'Extrapolation de l’alpha', value: signed(money(naive), naive), tone: tone(naive), hint: `α × ${num(cal.barsPerWeek, 0)} barres` },
    { label: fullWeek ? 'PnL réalisé (7 derniers jours)' : `PnL réalisé (${num(spanDays, 1)} j dispo.)`, value: signed(money(realized), realized), tone: tone(realized), hint: `buy & hold ${money(realizedBench)}` },
  ];

  const perDay = cal.barsPerDay;
  $('#chart-week').data = {
    x: [0, ...projection.bands.map((b) => b.step)],
    series: [{ name: 'Médiane', color: COLORS.net, width: 2, values: [0, ...projection.bands.map((b) => b.p50)] }],
    bands: [
      { name: '5 % – 95 %', color: COLORS.band, opacity: 0.12, lower: [0, ...projection.bands.map((b) => b.p05)], upper: [0, ...projection.bands.map((b) => b.p95)] },
      { name: '25 % – 75 %', color: COLORS.band, opacity: 0.25, lower: [0, ...projection.bands.map((b) => b.p25)], upper: [0, ...projection.bands.map((b) => b.p75)] },
    ],
    xFormat: (v) => `J+${num(v / perDay, 1)}`,
    yFormat: (v) => money(v),
    zeroLine: true,
  };
  $('#week-note').textContent =
    `Capital ${money(capital)} · ${num(cal.barsPerWeek, 0)} barres simulées (${cfg.market === 'crypto' ? '7 jours 24 h/24' : '5 séances de 6 h 30'}) ` +
    `à partir de ${num(rows.length, 0)} rendements nets observés. « J » = jour de ${cfg.market === 'crypto' ? 'calendrier' : 'bourse'}.`;

  $('#realized-title').textContent = fullWeek ? 'PnL réalisé sur les 7 derniers jours' : `PnL réalisé sur la période disponible (${num(spanDays, 1)} jour(s))`;
  const pnl = (key) => equityCurve(weekRows.map((r) => r[key])).map((e) => (e - 1) * capital);
  $('#chart-realized').data = {
    x: weekRows.map((r) => r.time),
    series: [
      { name: 'Stratégie nette', color: COLORS.net, width: 2, values: pnl('netRet') },
      { name: 'Buy & hold', color: COLORS.bench, values: pnl('benchRet') },
    ],
    xFormat: fmtTime,
    yFormat: (v) => money(v),
    zeroLine: true,
  };
}

// ---------- wiring ----------

form.addEventListener('submit', analyse);
form.elements.source.addEventListener('change', onSourceChange);
form.elements.market.addEventListener('change', () => applyPreset(form.elements.market.value));
for (const name of ['feeBps', 'spreadBps', 'slippageBps']) form.elements[name].addEventListener('input', updateCostSummary);
$('#live-toggle').addEventListener('click', () => (stopLive ? stopLiveFeed() : state && startLiveFeed()));
$('tab-bar').addEventListener('tab-change', (e) => e.detail === 'week' && state && renderWeek());

onSourceChange();
analyse();
