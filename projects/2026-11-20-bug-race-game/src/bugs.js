/**
 * The bug roster. Every bug is a small hand-drawn side-view SVG facing right,
 * sharing the same legs and head so they animate identically.
 */

const INK = '#2b2118';

const LEGS = [15, 27, 39]
  .map(
    (x) =>
      `<line class="leg" x1="${x}" y1="32" x2="${x + 3}" y2="45" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  )
  .join('');

const HEAD = `
  <path d="M53 19 Q55 10 61 9" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="50" cy="26" r="8" fill="${INK}"/>
  <circle cx="53" cy="24" r="2.6" fill="#fff"/>
  <circle cx="53.8" cy="24" r="1.2" fill="#111"/>`;

const shell = (fill) => `<ellipse cx="28" cy="24" rx="20" ry="13" fill="${fill}"/>`;

const wing = (fill, stroke) =>
  `<ellipse cx="25" cy="11" rx="12" ry="6" transform="rotate(-14 25 11)" fill="${fill}" stroke="${stroke}" stroke-width="1" opacity="0.85"/>`;

const draw = (body) =>
  `<svg class="bug-svg" viewBox="0 0 64 48" aria-hidden="true" focusable="false">${LEGS}${body}${HEAD}</svg>`;

export const BUGS = Object.freeze([
  {
    id: 'ladybug',
    label: 'Ladybug',
    svg: draw(`
      ${shell('#d8342c')}
      <g fill="${INK}">
        <circle cx="20" cy="20" r="3.5"/><circle cx="31" cy="17" r="3"/>
        <circle cx="27" cy="28" r="3.5"/><circle cx="38" cy="26" r="3"/>
        <circle cx="14" cy="27" r="2.5"/>
      </g>`),
  },
  {
    id: 'beetle',
    label: 'Beetle',
    svg: draw(`
      ${shell('#1f9d6b')}
      <path d="M12 20 Q28 8 44 20" fill="none" stroke="#7be0b5" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M10 26 H46" fill="none" stroke="#14724d" stroke-width="2" stroke-linecap="round"/>`),
  },
  {
    id: 'bee',
    label: 'Bee',
    svg: draw(`
      ${shell('#f5b921')}
      <g fill="${INK}">
        <rect x="18" y="13.5" width="5" height="21" rx="2"/>
        <rect x="26.5" y="11.5" width="5" height="25" rx="2"/>
        <rect x="35" y="14" width="5" height="20" rx="2"/>
      </g>
      ${wing('#dff3ff', '#9cc7e0')}`),
  },
  {
    id: 'firefly',
    label: 'Firefly',
    svg: draw(`
      ${shell('#5b3a29')}
      <circle cx="13" cy="25" r="12" fill="#ffe45c" opacity="0.35"/>
      <circle cx="13" cy="25" r="7.5" fill="#ffe45c"/>
      ${wing('#d9c9b6', '#a08b75')}`),
  },
]);

export const findBug = (id) => BUGS.find((bug) => bug.id === id);
