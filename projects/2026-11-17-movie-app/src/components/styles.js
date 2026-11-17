/** Builds a constructable stylesheet that shadow roots can adopt and share. */
export function css(strings, ...values) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(String.raw(strings, ...values));
  return sheet;
}

/** Base rules adopted by every component: reset, buttons, grid, states. */
export const shared = css`
  :host {
    box-sizing: border-box;
  }
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
  [hidden] {
    display: none !important;
  }
  h1,
  h2,
  h3 {
    font-family: var(--font-display);
    font-weight: 600;
    line-height: 1.15;
    margin: 0;
  }
  p {
    margin: 0;
  }
  a {
    color: var(--accent);
  }
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  button,
  input,
  textarea {
    font: inherit;
    color: inherit;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text);
    font-weight: 600;
    font-size: 0.92rem;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, transform 0.15s;
  }
  .btn:hover {
    border-color: var(--muted);
  }
  .btn:active {
    transform: scale(0.97);
  }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .btn.primary:hover {
    background: #ffc95c;
  }
  .btn.quiet {
    background: none;
  }

  .field {
    width: 100%;
    padding: 0.65rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
  }
  .field::placeholder {
    color: var(--muted);
  }

  .muted {
    color: var(--muted);
  }
  .error {
    color: var(--danger);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
    gap: 1.75rem 1.25rem;
  }
  @media (max-width: 520px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
      gap: 1.25rem 0.9rem;
    }
  }

  .state {
    display: grid;
    justify-items: center;
    gap: 0.9rem;
    padding: 3.5rem 1rem;
    text-align: center;
    color: var(--muted);
  }
  .state h2 {
    color: var(--text);
    font-size: 1.5rem;
  }
`;
