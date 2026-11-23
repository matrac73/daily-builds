/** Stylesheet shared by every panel component (adopted into each shadow root). */
export const panelStyles = new CSSStyleSheet();

panelStyles.replaceSync(`
  :host {
    display: block;
    min-width: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .panel > header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .meta {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    scrollbar-color: var(--border) transparent;
  }
  .scroll:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
`);
