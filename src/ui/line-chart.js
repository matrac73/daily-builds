// <line-chart>: dependency-free responsive SVG chart with lines, shaded bands
// and a hover crosshair. Set `chart.data = { x, series, bands, xFormat, yFormat }`.

import { escapeHtml } from './format.js';

const PAD = { top: 12, right: 16, bottom: 26, left: 64 };

function niceTicks(min, max, count = 5) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
  return ticks;
}

/** Keep at most `max` evenly spaced indices, always including the last one. */
function sampleIndices(length, max) {
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const stride = (length - 1) / (max - 1);
  return Array.from({ length: max }, (_, k) => Math.round(k * stride));
}

class LineChart extends HTMLElement {
  #data = null;
  #observer = null;
  #geometry = null;

  set data(value) {
    this.#data = value;
    this.render();
  }

  connectedCallback() {
    this.#observer = new ResizeObserver(() => this.render());
    this.#observer.observe(this);
    this.addEventListener('pointermove', (e) => this.#hover(e));
    this.addEventListener('pointerleave', () => this.#hideHover());
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
  }

  render() {
    const d = this.#data;
    const width = this.clientWidth;
    const height = this.clientHeight;
    if (!d || d.x.length < 2 || width === 0) {
      this.innerHTML = `<p class="chart-empty">${escapeHtml(this.getAttribute('empty') ?? 'Pas encore de données')}</p>`;
      this.#geometry = null;
      return;
    }

    const idx = sampleIndices(d.x.length, Math.max(50, Math.floor(width)));
    const xs = idx.map((i) => d.x[i]);
    const series = (d.series ?? []).map((s) => ({ ...s, values: idx.map((i) => s.values[i]) }));
    const bands = (d.bands ?? []).map((b) => ({ ...b, lower: idx.map((i) => b.lower[i]), upper: idx.map((i) => b.upper[i]) }));

    let yMin = Infinity;
    let yMax = -Infinity;
    for (const v of [...series.flatMap((s) => s.values), ...bands.flatMap((b) => [...b.lower, ...b.upper])]) {
      if (Number.isFinite(v)) {
        yMin = Math.min(yMin, v);
        yMax = Math.max(yMax, v);
      }
    }
    if (yMin === yMax) {
      yMin -= Math.abs(yMin) * 0.01 || 1;
      yMax += Math.abs(yMax) * 0.01 || 1;
    }
    const padY = (yMax - yMin) * 0.06;
    yMin -= padY;
    yMax += padY;

    const xMin = xs[0];
    const xMax = xs.at(-1);
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const sx = (v) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * innerW;
    const sy = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
    const xFormat = d.xFormat ?? String;
    const yFormat = d.yFormat ?? ((v) => v.toFixed(2));

    const path = (values) =>
      values
        .map((v, i) => (Number.isFinite(v) ? `${i === 0 || !Number.isFinite(values[i - 1]) ? 'M' : 'L'}${sx(xs[i]).toFixed(1)},${sy(v).toFixed(1)}` : ''))
        .join('');

    const yTicks = niceTicks(yMin, yMax);
    const xTicks = sampleIndices(xs.length, Math.max(2, Math.min(6, Math.floor(innerW / 110))));
    const zeroLine = d.zeroLine && yMin < 0 && yMax > 0 ? `<line class="zero" x1="${PAD.left}" x2="${width - PAD.right}" y1="${sy(0)}" y2="${sy(0)}"/>` : '';

    const bandPaths = bands
      .map((b) => {
        // Bands may cover only part of the x range (e.g. a forecast cone): skip undefined points.
        const defined = xs.map((_, i) => i).filter((i) => Number.isFinite(b.lower[i]) && Number.isFinite(b.upper[i]));
        if (defined.length < 2) return '';
        const point = (i, v) => `${sx(xs[i]).toFixed(1)},${sy(v).toFixed(1)}`;
        const top = defined.map((i, k) => `${k ? 'L' : 'M'}${point(i, b.upper[i])}`).join('');
        const bottom = [...defined].reverse().map((i) => `L${point(i, b.lower[i])}`).join('');
        return `<path d="${top}${bottom}Z" fill="${b.color}" opacity="${b.opacity ?? 0.18}"/>`;
      })
      .join('');

    const lines = series
      .map((s) => `<path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 1.6}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`)
      .join('');

    const legend = [...series.map((s) => [s.name, s.color]), ...bands.filter((b) => b.name).map((b) => [b.name, b.color])]
      .map(([name, color]) => `<span><i style="background:${color}"></i>${escapeHtml(name)}</span>`)
      .join('');

    this.innerHTML = `
      <svg width="${width}" height="${height}" role="img" aria-label="${escapeHtml(this.getAttribute('aria-label') ?? 'graphique')}">
        <g class="grid">
          ${yTicks.map((t) => `<line x1="${PAD.left}" x2="${width - PAD.right}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${PAD.left - 8}" y="${sy(t) + 4}" text-anchor="end">${escapeHtml(yFormat(t))}</text>`).join('')}
          ${xTicks.map((i) => `<text x="${sx(xs[i])}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'}">${escapeHtml(xFormat(xs[i]))}</text>`).join('')}
        </g>
        ${zeroLine}${bandPaths}${lines}
        <line class="cursor" y1="${PAD.top}" y2="${PAD.top + innerH}" visibility="hidden"/>
      </svg>
      <div class="chart-legend">${legend}</div>
      <div class="chart-tip" hidden></div>`;

    this.#geometry = { xs, series, bands, sx, xFormat, yFormat, innerW };
  }

  #hover(event) {
    const g = this.#geometry;
    if (!g) return;
    const rect = this.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < g.xs.length; i++) if (Math.abs(g.sx(g.xs[i]) - px) < Math.abs(g.sx(g.xs[best]) - px)) best = i;
    const x = g.sx(g.xs[best]);
    const cursor = this.querySelector('.cursor');
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('visibility', 'visible');

    const rows = [
      ...g.series.map((s) => [s.name, s.color, s.values[best]]),
      ...g.bands.filter((b) => b.name).map((b) => [b.name, b.color, null, b.lower[best], b.upper[best]]),
    ]
      .map(([name, color, v, lo, hi]) => {
        if (v === null ? !Number.isFinite(lo) : !Number.isFinite(v)) return '';
        const value = v === null ? `${g.yFormat(lo)} … ${g.yFormat(hi)}` : g.yFormat(v);
        return `<div><i style="background:${color}"></i>${escapeHtml(name)} <b>${escapeHtml(value)}</b></div>`;
      })
      .join('');
    const tip = this.querySelector('.chart-tip');
    tip.innerHTML = `<div class="tip-x">${escapeHtml(g.xFormat(g.xs[best]))}</div>${rows}`;
    tip.hidden = false;
    const left = x + 12 + tip.offsetWidth > rect.width ? x - 12 - tip.offsetWidth : x + 12;
    tip.style.left = `${left}px`;
  }

  #hideHover() {
    this.querySelector('.cursor')?.setAttribute('visibility', 'hidden');
    const tip = this.querySelector('.chart-tip');
    if (tip) tip.hidden = true;
  }
}

customElements.define('line-chart', LineChart);
