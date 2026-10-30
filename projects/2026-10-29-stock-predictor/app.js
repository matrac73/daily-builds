// Dashboard: renders data/forecasts.json (produced by the daily job) and drives the in-browser lab.

import { position } from './src/rules.js';
import { historySummary, withOutcomes } from './src/tracker.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v, d = 2) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`);
const signed = (v, d = 2) => `${v > 0 ? '+' : ''}${pct(v, d)}`;
const tone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const money = (v) => {
  const d = Math.abs(v) < 10 ? 4 : 2; // FX rates such as EUR=X need more precision
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

const COLORS = { price: '#5aa9ff', forecast: '#f2c14e', past: '#8a99a8', strategy: '#3ecf8e', hold: '#8a99a8' };
const level = (l) => `${Math.round(l * 100)}%`;
const mobile = window.matchMedia('(max-width: 600px)');

/** Minimal responsive SVG line chart with optional error-bar markers. Narrower viewBox on phones keeps labels legible. */
function chart({ labels, series, markers = [], format, height = 230 }) {
  const width = mobile.matches ? 380 : 640;
  if (mobile.matches) height = Math.round(height * 0.85);
  const pad = { l: mobile.matches ? 46 : 56, r: 10, t: 10, b: 24 };
  const ys = [...series.flatMap((s) => s.values), ...markers.flatMap((m) => [m.y, m.y0 ?? m.y, m.y1 ?? m.y])]
    .filter((v) => v !== null && Number.isFinite(v));
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi === lo) [lo, hi] = [lo - 1, hi + 1];
  const span = hi - lo;
  lo -= span * 0.05;
  hi += span * 0.05;
  const x = (i) => pad.l + (i / Math.max(1, labels.length - 1)) * (width - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);

  const grid = [0, 1, 2, 3].map((k) => {
    const v = lo + ((k + 0.5) / 4) * (hi - lo);
    return `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#263240"/>
      <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`;
  });
  const ticks = [0, Math.floor((labels.length - 1) / 2), labels.length - 1].map(
    (i, k) => `<text x="${x(i)}" y="${height - 6}" text-anchor="${['start', 'middle', 'end'][k]}">${esc(labels[i])}</text>`,
  );
  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
  });
  const marks = markers.map((m) => {
    const w = m.w ?? 5;
    const bar = m.y0 === undefined ? '' : `<line x1="${x(m.x)}" x2="${x(m.x)}" y1="${y(m.y0)}" y2="${y(m.y1)}" stroke="${m.color}" stroke-width="${m.width ?? 2}" opacity="${m.opacity ?? 1}"/>
      <line x1="${x(m.x) - w}" x2="${x(m.x) + w}" y1="${y(m.y0)}" y2="${y(m.y0)}" stroke="${m.color}" stroke-width="2"/>
      <line x1="${x(m.x) - w}" x2="${x(m.x) + w}" y1="${y(m.y1)}" y2="${y(m.y1)}" stroke="${m.color}" stroke-width="2"/>`;
    if (m.y === undefined) return bar;
    return `${bar}<circle cx="${x(m.x)}" cy="${y(m.y)}" r="${m.r ?? 4}" fill="${m.color}"><title>${esc(m.title ?? '')}</title></circle>`;
  });
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${grid.join('')}${ticks.join('')}${paths.join('')}${marks.join('')}</svg>`;
}

function priceChart(r) {
  const dates = r.prices.map((p) => p[0]);
  const closes = r.prices.map((p) => p[1]);
  const n = closes.length;
  const f = r.forecast;
  const markers = (r.track?.entries ?? [])
    .filter((e) => e.targetDate && dates.includes(e.targetDate))
    .map((e) => ({ x: dates.indexOf(e.targetDate), y: e.predictedClose, color: COLORS.past, r: 3, title: `Forecast for ${e.targetDate}: ${money(e.predictedClose)}` }));
  // Nested 95% / 50% / 25% intervals: the narrower the band, the thicker the bar.
  const bands = f.intervals ?? [{ level: 0.95, lower: f.lower, upper: f.upper }];
  bands.forEach((b, k) => markers.push({ x: n, y0: b.lower, y1: b.upper, color: COLORS.forecast, w: 4 + 2 * k, width: 2 + 3 * k, opacity: 0.45 + 0.25 * k }));
  markers.push({ x: n, y: f.predictedClose, color: COLORS.forecast, title: `Next session: ${money(f.predictedClose)}` });
  return chart({
    labels: [...dates, 'next'],
    series: [
      { values: [...closes, null], color: COLORS.price },
      { values: [...new Array(n - 1).fill(null), closes[n - 1], f.predictedClose], color: COLORS.forecast, dash: true },
    ],
    markers,
    format: (v) => money(v),
  });
}

/** Cumulative out-of-sample equity of the rule-based strategy vs buy & hold. */
function equityChart(r) {
  let strat = 0;
  let hold = 0;
  let prev = 0;
  const s = [];
  const h = [];
  r.oos.actual.forEach((ret, i) => {
    const p = position(r.oos.predicted[i], r.options);
    strat += p * ret + Math.log(1 - r.options.cost * Math.abs(p - prev));
    hold += ret;
    prev = p;
    s.push(Math.expm1(strat));
    h.push(Math.expm1(hold));
  });
  return chart({
    labels: r.oos.dates,
    series: [{ values: h, color: COLORS.hold }, { values: s, color: COLORS.strategy }],
    format: (v) => pct(v, 0),
    height: 200,
  });
}

function forecastCard(r) {
  const f = r.forecast;
  const bands = f.intervals ?? [{ level: 0.95, lower: f.lower, upper: f.upper }];
  return `<article class="card span-4">
    <h3>Next session · ${esc(r.name)}</h3>
    <span class="badge ${f.signal}">${f.signal}</span>
    <p class="big">${money(f.predictedClose)}</p>
    <p class="${tone(f.expectedReturn)}">${signed(f.expectedReturn)} vs last close ${money(r.lastClose)}</p>
    <dl class="kv">
      <dt>Based on close of</dt><dd>${esc(r.asOf)}</dd>
      ${bands.map((b) => `<dt>${level(b.level)} interval</dt><dd>${money(b.lower)} – ${money(b.upper)}</dd>`).join('')}
      <dt>P(up)</dt><dd>${pct(f.probUp, 0)}</dd>
      <dt>Raw model view</dt><dd class="${tone(f.modelReturn)}">${signed(f.modelReturn, 3)}</dd>
    </dl>
    <ul class="reasons">${f.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </article>`;
}

function priceCard(r) {
  return `<article class="card span-8">
    <h3>Last ${r.prices.length} sessions &amp; forecast</h3>
    ${priceChart(r)}
    <div class="legend"><span><i style="background:${COLORS.price}"></i>Close</span>
      <span><i style="background:${COLORS.forecast}"></i>Forecast ± 95 / 50 / 25% intervals</span>
      <span><i style="background:${COLORS.past}"></i>Past live forecasts</span></div>
  </article>`;
}

function evaluationCard(r) {
  const { model, drift, zero } = r.metrics;
  const row = (label, m) => `<tr><td>${label}</td><td>${pct(m.rmse, 3)}</td><td>${pct(m.mae, 3)}</td>
    <td>${m.hitRate === null ? '—' : pct(m.hitRate, 1)}</td><td class="${tone(m.r2oos)}">${pct(m.r2oos, 2)}</td></tr>`;
  const verdict = r.edge.ok
    ? `<div class="verdict ok">✔ The model beats the random walk out-of-sample — its forecast is used.</div>`
    : `<div class="verdict no">✖ No proven edge (${esc(r.edge.reasons.join('; '))}) — the forecast falls back to the random walk.</div>`;
  return `<article class="card span-7">
    <h3>Walk-forward evaluation · ${model.n} out-of-sample days</h3>
    ${verdict}
    <div class="table-wrap"><table><thead><tr><th>Forecaster</th><th>RMSE</th><th>MAE</th><th>Hit rate</th><th>R² vs RW</th></tr></thead>
      <tbody>${row(`Ridge (λ = ${r.model.lambda})`, model)}${row('Historical drift', drift)}${row('Random walk (0%)', zero)}</tbody></table></div>
    <h3 style="margin-top:18px">Rule-based strategy vs buy &amp; hold</h3>
    ${equityChart(r)}
    <div class="legend"><span><i style="background:${COLORS.strategy}"></i>Strategy ${signed(r.backtest.strategyReturn, 1)} (${r.backtest.trades} trades)</span>
      <span><i style="background:${COLORS.hold}"></i>Buy &amp; hold ${signed(r.backtest.buyHoldReturn, 1)}</span></div>
  </article>`;
}

/** Alpha of each forecaster traded with the same BUY / SELL / HOLD rules, over the out-of-sample period. */
function alphaCard(r) {
  if (!r.strategies) return '';
  const rows = [
    [`Ridge model (λ = ${r.model.lambda})`, r.strategies.model],
    ['Historical drift', r.strategies.drift],
    ['Random walk (always flat)', r.strategies.zero],
    ['Buy &amp; hold (reference)', r.strategies.buyHold],
  ].map(([label, s]) => `<tr><td>${label}</td><td class="${tone(s.strategyReturn)}">${signed(s.strategyReturn, 1)}</td>
    <td class="${tone(s.excessReturn)}">${signed(s.excessReturn, 1)}</td><td class="${tone(s.alpha)}"><strong>${signed(s.alpha, 1)}</strong></td>
    <td>${s.beta.toFixed(2)}</td><td>${s.trades}</td></tr>`);
  return `<article class="card span-12">
    <h3>Algorithm alphas · out-of-sample, after costs</h3>
    <p class="muted" style="margin-top:0;font-size:.85rem">α = annualised Jensen's alpha vs holding the asset (return not explained by β × the asset's own move);
      “vs B&amp;H” = total return minus buy &amp; hold. A positive α with β near 0 is genuine timing skill.</p>
    <div class="table-wrap"><table><thead><tr><th>Algorithm</th><th>Return</th><th>vs B&amp;H</th><th>α / year</th><th>β</th><th>Trades</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
  </article>`;
}

function weightsCard(r) {
  const max = Math.max(...r.model.weights.map((w) => Math.abs(w.weight)), 1e-12);
  const rows = r.model.weights.map((w) => {
    const width = (Math.abs(w.weight) / max) * 50;
    const style = w.weight >= 0 ? `left:50%;width:${width}%;background:var(--up)` : `left:${50 - width}%;width:${width}%;background:var(--down)`;
    return `<div class="weight"><span>${esc(w.name)}</span><div class="track"><div class="bar" style="${style}"></div></div>
      <span>${(w.weight * 1e4).toFixed(1)}</span></div>`;
  });
  return `<article class="card span-5">
    <h3>Feature weights (bps per σ)</h3>
    <p class="muted" style="margin-top:0;font-size:.85rem">Standardised ridge coefficients, trained on ${r.model.trainingRows} sessions.</p>
    <div class="weights">${rows.join('')}</div>
  </article>`;
}

function newsCard(r) {
  const items = r.news.map((h) => {
    const safe = /^https?:\/\//.test(h.link) ? h.link : null;
    const title = safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener">${esc(h.title)}</a>` : esc(h.title);
    return `<li><span class="score ${tone(h.score)}">${h.score > 0 ? '+' : ''}${h.score.toFixed(2)}</span>
      <span>${title}<time>${esc(new Date(h.publishedAt).toLocaleString())}</time></span></li>`;
  });
  return `<article class="card span-6">
    <h3>Latest news sentiment</h3>
    ${items.length ? `<ul class="news">${items.join('')}</ul>` : '<p class="muted">No headlines collected yet.</p>'}
  </article>`;
}

const verdictCell = (o) => (o ? `<td class="${o.correct ? 'pos' : 'neg'}" title="${o.correct ? 'good call' : 'bad call'}">${o.correct ? '✔' : '✖'}</td>` : '<td class="muted">…</td>');

function trackCard(r) {
  const { stats, entries } = r.track;
  const summary = stats.settled
    ? `${stats.settled} settled · calls right ${pct(stats.recommendations?.accuracy, 0)} · MAPE ${pct(stats.mape)} · direction ${stats.hitRate === null ? '—' : pct(stats.hitRate, 0)} · 95% coverage ${pct(stats.intervalCoverage, 0)}`
    : `No settled forecast yet — ${stats.pending} pending. Each daily run settles the previous one.`;
  const rows = entries.map((e) => `<tr><td>${esc(e.basedOn)}${e.replayed ? ' <span class="tag">replay</span>' : ''}</td><td class="opt">${money(e.lastClose)}</td>
    <td>${money(e.predictedClose)}</td><td class="${e.signal}">${e.signal}</td>
    <td>${e.actualClose === null ? '<span class="muted">pending</span>' : money(e.actualClose)}</td>
    <td class="opt">${e.actualClose === null ? '' : signed(e.predictedClose / e.actualClose - 1)}</td>${verdictCell(e.outcome)}</tr>`);
  return `<article class="card span-6">
    <h3>Live track record</h3>
    <p class="muted" style="margin-top:0">${summary}</p>
    <div class="scroll"><table><thead><tr><th>Close of</th><th class="opt">Close</th><th>Forecast</th><th>Signal</th><th>Actual</th><th class="opt">Error</th><th>Call</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
  </article>`;
}

function renderReport(el, r) {
  const cards = [forecastCard(r), priceCard(r), evaluationCard(r), weightsCard(r), alphaCard(r)];
  if (r.track) cards.push(newsCard(r), trackCard(r));
  else if (r.news.length) cards.push(newsCard(r));
  el.innerHTML = `<div class="grid">${cards.join('')}</div>`;
  el.lastReport = r; // re-rendered when the phone / desktop layout switches
}

/** History module: every logged forecast, graded once settled, with per-stock recommendation scores. */
function renderHistory(log, names) {
  const symbol = $('#hist-symbol').value;
  const live = $('#hist-live').checked;
  const entries = log.filter((e) => (symbol === 'all' || e.symbol === symbol) && (!live || !e.replayed));
  const { overall, bySymbol } = historySummary(entries);
  const rec = overall.recommendations;
  const tile = (label, value, cls = '') => `<div class="tile"><span>${label}</span><strong class="${cls}">${value}</strong></div>`;
  const cov = (s, l) => (s.coverage?.[l] === undefined ? '—' : pct(s.coverage[l], 0));
  const tiles = overall.settled
    ? [
      tile('Settled / pending', `${overall.settled} / ${overall.pending}`),
      tile('Calls right', pct(rec.accuracy, 0), rec.accuracy >= 0.5 ? 'pos' : 'neg'),
      tile('BUY / SELL right', rec.trades ? `${rec.bySignal.BUY.correct + rec.bySignal.SELL.correct} / ${rec.trades}` : '—'),
      tile('Avg BUY/SELL return', rec.meanTradeReturn === null ? '—' : signed(rec.meanTradeReturn), tone(rec.meanTradeReturn)),
      tile('In 95 / 50 / 25% band', `${cov(overall, 0.95)} · ${cov(overall, 0.5)} · ${cov(overall, 0.25)}`),
      tile('Forecast MAPE', pct(overall.mape)),
    ].join('')
    : `<p class="muted">No settled forecast yet — ${overall.pending} pending. Run <code>npm run daily -- --backfill 20</code> to replay recent sessions.</p>`;
  const sig = (s, k) => (s.recommendations.bySignal[k].n ? `${s.recommendations.bySignal[k].correct}/${s.recommendations.bySignal[k].n}` : '—');
  const summaryRows = bySymbol.filter((b) => b.stats.settled).map(({ symbol: s, stats }) => `<tr><td>${esc(s)} <span class="muted opt">${esc(names[s] ?? '')}</span></td>
    <td>${stats.settled}</td><td class="${stats.recommendations.accuracy >= 0.5 ? 'pos' : 'neg'}">${pct(stats.recommendations.accuracy, 0)}</td>
    <td>${sig(stats, 'BUY')}</td><td>${sig(stats, 'SELL')}</td><td>${sig(stats, 'HOLD')}</td>
    <td class="${tone(stats.recommendations.cumulativeReturn)}">${signed(stats.recommendations.cumulativeReturn)}</td>
    <td class="opt">${cov(stats, 0.95)} · ${cov(stats, 0.5)} · ${cov(stats, 0.25)}</td></tr>`);
  const rows = withOutcomes(entries).slice(0, 200).map((e) => {
    const o = e.outcome;
    return `<tr><td>${esc(e.basedOn)}${e.replayed ? ' <span class="tag">replay</span>' : ''}</td><td>${esc(e.symbol)}</td><td class="${e.signal}">${e.signal}</td>
      <td class="opt">${money(e.lastClose)}</td><td class="opt">${money(e.predictedClose)}</td>
      <td>${e.actualClose === null ? '<span class="muted">pending</span>' : money(e.actualClose)}</td>
      <td class="${o ? tone(o.move) : ''}">${o ? signed(o.move) : ''}</td>${verdictCell(o)}
      <td class="opt ${o ? tone(o.pnl) : ''}">${o && e.signal !== 'HOLD' ? signed(o.pnl) : ''}</td></tr>`;
  });
  $('#hist-body').innerHTML = `<div class="tiles">${tiles}</div>
    ${summaryRows.length ? `<div class="table-wrap"><table><thead><tr><th>Stock</th><th>Settled</th><th>Calls right</th><th>BUY</th><th>SELL</th><th>HOLD</th>
      <th>Following calls</th><th class="opt">In 95/50/25% band</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table></div>` : ''}
    <div class="scroll table-wrap" style="margin-top:14px"><table><thead><tr><th>Close of</th><th>Stock</th><th>Call</th><th class="opt">Close</th><th class="opt">Forecast</th>
      <th>Actual</th><th>Move</th><th>Right?</th><th class="opt">P&amp;L</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

async function setupHistory() {
  const [log, config] = await Promise.all([
    fetch('./data/predictions.json').then((r) => (r.ok ? r.json() : [])),
    fetch('./data/config.json').then((r) => r.json()),
  ]);
  const names = Object.fromEntries(config.stocks.map((s) => [s.symbol, s.name]));
  const symbols = [...new Set(log.map((e) => e.symbol))].sort();
  $('#hist-symbol').innerHTML = '<option value="all">All stocks</option>'
    + symbols.map((s) => `<option value="${esc(s)}">${esc(s)}${names[s] ? ` — ${esc(names[s])}` : ''}</option>`).join('');
  const render = () => renderHistory(log, names);
  $('#hist-symbol').addEventListener('change', render);
  $('#hist-live').addEventListener('change', render);
  render();
}

async function loadDashboard() {
  const res = await fetch('./data/forecasts.json');
  if (!res.ok) throw new Error(`data/forecasts.json: HTTP ${res.status}`);
  const data = await res.json();
  $('#stamp').textContent = `Updated ${new Date(data.generatedAt).toLocaleString()}`;
  $('#warnings').innerHTML = data.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('');
  const tabs = $('#tabs');
  const select = (i) => {
    [...tabs.children].forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    renderReport($('#report'), data.results[i]);
  };
  tabs.innerHTML = data.results
    .map((r) => `<button type="button" role="tab">${esc(r.symbol)}<span class="sig ${r.forecast.signal}">${r.forecast.signal}</span></button>`)
    .join('');
  [...tabs.children].forEach((b, i) => b.addEventListener('click', () => select(i)));
  if (data.results.length) select(0);
  else $('#report').innerHTML = '<p class="muted">No forecast available yet — run <code>npm run daily</code>.</p>';
}

async function setupLab() {
  const config = await fetch('./data/config.json').then((r) => r.json());
  const source = $('#lab-source');
  source.innerHTML = config.stocks.map((s, i) => `<option value="${i}">${esc(s.symbol)} — ${esc(s.name)}</option>`).join('')
    + '<option value="upload">Upload a CSV…</option>';
  source.addEventListener('change', () => { $('#lab-file-label').hidden = source.value !== 'upload'; });

  const worker = new Worker('./worker.js', { type: 'module' });
  const out = $('#lab-report');
  const button = $('#lab-run');
  worker.onmessage = ({ data }) => {
    button.disabled = false;
    button.textContent = 'Run pipeline';
    if (data.error) out.innerHTML = `<div class="warn">${esc(data.error)}</div>`;
    else renderReport(out, data.report);
  };

  const fileName = (symbol) => symbol.replace(/\^/g, 'IDX-').replace(/[^A-Za-z0-9.-]/g, '-'); // mirrors scripts/daily.js
  const text = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.text();
  };

  $('#lab-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const options = {
      threshold: Number($('#lab-threshold').value) / 100,
      cost: Number($('#lab-cost').value) / 1e4,
      minTrain: Number($('#lab-train').value),
      testSize: Number($('#lab-step').value),
    };
    try {
      let message;
      if (source.value === 'upload') {
        const file = $('#lab-file').files[0];
        if (!file) throw new Error('Choose a CSV file first.');
        message = { symbol: file.name.replace(/\.csv$/i, ''), csv: await file.text(), options };
      } else {
        const stock = config.stocks[Number(source.value)];
        const [csv, marketCsv, news] = await Promise.all([
          text(`./data/bars/${fileName(stock.symbol)}.csv`),
          stock.market ? text(`./data/bars/${fileName(stock.market)}.csv`) : null,
          fetch(`./data/news/${fileName(stock.symbol)}.json`).then((r) => (r.ok ? r.json() : [])),
        ]);
        message = { symbol: stock.symbol, name: stock.name, csv, marketCsv, news, options };
      }
      button.disabled = true;
      button.textContent = 'Running…';
      out.innerHTML = '<p class="muted">Training with nested walk-forward validation…</p>';
      worker.postMessage(message);
    } catch (err) {
      out.innerHTML = `<div class="warn">${esc(err.message)}</div>`;
    }
  });
}

loadDashboard().catch((err) => {
  $('#report').innerHTML = `<div class="warn">Could not load forecasts: ${esc(err.message)}</div>`;
});
setupLab().catch((err) => {
  $('#lab-report').innerHTML = `<div class="warn">Lab unavailable: ${esc(err.message)}</div>`;
});
setupHistory().catch((err) => {
  $('#hist-body').innerHTML = `<div class="warn">History unavailable: ${esc(err.message)}</div>`;
});
mobile.addEventListener('change', () => {
  for (const el of [$('#report'), $('#lab-report')]) if (el.lastReport) renderReport(el, el.lastReport);
});
