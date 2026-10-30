// <stat-grid>: a grid of KPI cards. `grid.items = [{ label, value, hint, tone }]`.

import { escapeHtml } from './format.js';

class StatGrid extends HTMLElement {
  set items(list) {
    this.innerHTML = list
      .map(
        ({ label, value, hint, tone = '' }) => `
        <div class="stat ${tone}">
          <span class="stat-label">${escapeHtml(label)}</span>
          <strong class="stat-value">${escapeHtml(value)}</strong>
          ${hint ? `<span class="stat-hint">${escapeHtml(hint)}</span>` : ''}
        </div>`,
      )
      .join('');
  }
}

customElements.define('stat-grid', StatGrid);
