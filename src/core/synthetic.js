// Offline synthetic market: regime-switching volatility plus a weak, persistent
// order-flow signal that leaks into the next bar's return. Useful to check that
// the model finds alpha when there is some, and to demo the app without network.

import { gaussian, mulberry32 } from './rng.js';

export class SyntheticMarket {
  constructor({ seed = 7, startPrice = 100, intervalMs = 60_000, startTime = Date.UTC(2026, 9, 1), baseVol = 0.001, signal = 0.2 } = {}) {
    this.rng = mulberry32(seed);
    this.price = startPrice;
    this.time = startTime;
    this.intervalMs = intervalMs;
    this.baseVol = baseVol;
    this.signal = signal;
    this.latent = 0;
    this.highVol = false;
  }

  next() {
    const { rng } = this;
    if (rng() < 0.01) this.highVol = !this.highVol;
    const vol = this.baseVol * (this.highVol ? 2 : 1);

    // The return of this bar is partly explained by the latent flow of the previous bar.
    const ret = vol * (this.signal * this.latent + Math.sqrt(1 - this.signal ** 2) * gaussian(rng));
    this.latent = 0.9 * this.latent + Math.sqrt(1 - 0.81) * gaussian(rng);

    const open = this.price;
    const close = open * Math.exp(ret);
    const high = Math.max(open, close) * Math.exp(Math.abs(gaussian(rng)) * vol * 0.5);
    const low = Math.min(open, close) * Math.exp(-Math.abs(gaussian(rng)) * vol * 0.5);
    const volume = 100 * Math.exp(0.5 * gaussian(rng)) * (this.highVol ? 1.8 : 1);
    const flow = Math.max(-0.95, Math.min(0.95, 0.35 * this.latent + 0.1 * gaussian(rng)));

    this.price = close;
    this.time += this.intervalMs;
    return { time: this.time, open, high, low, close, volume, takerBuy: (volume * (1 + flow)) / 2 };
  }
}

export function generateSynthetic(n, options) {
  const market = new SyntheticMarket(options);
  return Array.from({ length: n }, () => market.next());
}
