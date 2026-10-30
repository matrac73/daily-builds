// <weight-bars>: horizontal bars showing the Hedge weight of each expert.
// `bars.items = [{ label, value }]` with values in [0, 1].

import { escapeHtml, pct } from './format.js';

class WeightBars extends HTMLElement {
  set items(list) {
    this.innerHTML = list
      .map(
        ({ label, value }) => `
        <div class="weight-row">
          <span>${escapeHtml(label)}</span>
          <span class="weight-track"><span class="weight-fill" style="width:${(value * 100).toFixed(1)}%"></span></span>
          <b>${pct(value, 1)}</b>
        </div>`,
      )
      .join('');
  }
}

customElements.define('weight-bars', WeightBars);
