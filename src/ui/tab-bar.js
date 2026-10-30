// <tab-bar>: accessible tabs. Each child button has data-tab="id" and controls
// the element with id="panel-<id>". The active tab is mirrored in the URL hash
// (deep links such as #method) and a "tab-change" event is emitted.

class TabBar extends HTMLElement {
  connectedCallback() {
    this.setAttribute('role', 'tablist');
    this.tabs = [...this.querySelectorAll('button[data-tab]')];
    this.tabs.forEach((tab) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `panel-${tab.dataset.tab}`);
      tab.addEventListener('click', () => this.select(tab.dataset.tab));
    });
    this.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const current = this.tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const next = this.tabs[(current + (e.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length];
      this.select(next.dataset.tab);
      next.focus();
    });
    const fromHash = this.tabs.find((t) => `#${t.dataset.tab}` === location.hash);
    this.select((fromHash ?? this.tabs[0]).dataset.tab);
  }

  select(id) {
    for (const tab of this.tabs) {
      const active = tab.dataset.tab === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(`panel-${tab.dataset.tab}`).hidden = !active;
    }
    history.replaceState(null, '', `#${id}`);
    this.dispatchEvent(new CustomEvent('tab-change', { detail: id }));
  }
}

customElements.define('tab-bar', TabBar);
