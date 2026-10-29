// Dashboard: renders data/forecasts.json (produced by the daily job) and drives the in-browser lab.

import { position } from './src/rules.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v, d = 2) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`);
const signed = (v, d = 2) => `${v > 0 ? '+' : ''}${pct(v, d)}`;
const tone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLORS = { price: '#5aa9ff', forecast: '#f2c14e', past: '#8a99a8', strategy: '#3ecf8e', hold: '#8a99a8' };

/** Minimal responsive SVG line chart with optional error-bar markers. */
function chart({ labels, series, markers = [], format, height = 230 }) {
  const width = 640;
  const pad = { l: 56, r: 14, t: 10, b: 24 };
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
    const bar = m.y0 === undefined ? '' : `<line x1="${x(m.x)}" x2="${x(m.x)}" y1="${y(m.y0)}" y2="${y(m.y1)}" stroke="${m.color}" stroke-width="2"/>
      <line x1="${x(m.x) - 5}" x2="${x(m.x) + 5}" y1="${y(m.y0)}" y2="${y(m.y0)}" stroke="${m.color}" stroke-width="2"/>
      <line x1="${x(m.x) - 5}" x2="${x(m.x) + 5}" y1="${y(m.y1)}" y2="${y(m.y1)}" stroke="${m.color}" stroke-width="2"/>`;
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
  markers.push({ x: n, y: f.predictedClose, y0: f.lower, y1: f.upper, color: COLORS.forecast, title: `Next session: ${money(f.predictedClose)}` });
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
  return `<article class="card span-4">
    <h3>Next session · ${esc(r.name)}</h3>
    <span class="badge ${f.signal}">${f.signal}</span>
    <p class="big">${money(f.predictedClose)}</p>
    <p class="${tone(f.expectedReturn)}">${signed(f.expectedReturn)} vs last close ${money(r.lastClose)}</p>
    <dl class="kv">
      <dt>Based on close of</dt><dd>${esc(r.asOf)}</dd>
      <dt>95% interval</dt><dd>${money(f.lower)} – ${money(f.upper)}</dd>
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
      <span><i style="background:${COLORS.forecast}"></i>Forecast ± 95% interval</span>
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
    <table><thead><tr><th>Forecaster</th><th>RMSE</th><th>MAE</th><th>Hit rate</th><th>R² vs RW</th></tr></thead>
      <tbody>${row(`Ridge (λ = ${r.model.lambda})`, model)}${row('Historical drift', drift)}${row('Random walk (0%)', zero)}</tbody></table>
    <h3 style="margin-top:18px">Rule-based strategy vs buy &amp; hold</h3>
    ${equityChart(r)}
    <div class="legend"><span><i style="background:${COLORS.strategy}"></i>Strategy ${signed(r.backtest.strategyReturn, 1)} (${r.backtest.trades} trades)</span>
      <span><i style="background:${COLORS.hold}"></i>Buy &amp; hold ${signed(r.backtest.buyHoldReturn, 1)}</span></div>
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

function trackCard(r) {
  const { stats, entries } = r.track;
  const summary = stats.settled
    ? `${stats.settled} settled · MAPE ${pct(stats.mape)} · direction ${stats.hitRate === null ? '—' : pct(stats.hitRate, 0)} · interval coverage ${pct(stats.intervalCoverage, 0)}`
    : `No settled forecast yet — ${stats.pending} pending. Each daily run settles the previous one.`;
  const rows = entries.map((e) => `<tr><td>${esc(e.basedOn)}</td><td>${money(e.lastClose)}</td><td>${money(e.predictedClose)}</td>
    <td class="${e.signal}">${e.signal}</td><td>${e.actualClose === null ? '<span class="muted">pending</span>' : money(e.actualClose)}</td>
    <td>${e.actualClose === null ? '' : signed(e.predictedClose / e.actualClose - 1)}</td></tr>`);
  return `<article class="card span-6">
    <h3>Live track record</h3>
    <p class="muted" style="margin-top:0">${summary}</p>
    <div class="scroll"><table><thead><tr><th>Close of</th><th>Close</th><th>Forecast</th><th>Signal</th><th>Actual</th><th>Error</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
  </article>`;
}

function renderReport(el, r) {
  const cards = [forecastCard(r), priceCard(r), evaluationCard(r), weightsCard(r)];
  if (r.track) cards.push(newsCard(r), trackCard(r));
  else if (r.news.length) cards.push(newsCard(r));
  el.innerHTML = `<div class="grid">${cards.join('')}</div>`;
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
