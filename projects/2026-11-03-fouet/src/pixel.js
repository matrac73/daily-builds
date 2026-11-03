// Pixel-art toolkit: palette, raster primitives, whip sprite and a 5×7 font.
// Cells are integer [x, y] grid coordinates; sprites are Map("x,y" -> colour).
// Mirrors the pixel-art section of fouet.py.

export const PALETTE = Object.freeze({
  outline: '#240c00',
  lash: Object.freeze(['#b83200', '#e04400', '#ff5a0a', '#ff7a1a', '#ff9f40']), // root -> tip
  lashCore: '#ffc46b',
  cracker: '#fff4dc',
  handle: '#7a3f14',
  handleWrap: '#3d1d07',
  pommel: '#ffb000',
  fire: Object.freeze(['#fff4dc', '#ffd166', '#ff9f1c', '#ff5a0a', '#c42a00']), // hot -> cold
  tiers: Object.freeze(['#ffd166', '#ff7a1a', '#ff2d2d']),
  miss: '#fff4dc',
});

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export const N4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
export const N8 = Object.freeze([...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]]);

export const key = (x, y) => `${x},${y}`;
export const unkey = (k) => k.split(',').map(Number);

/** Ordered-dither dissolve: a cell survives while `fade` < its Bayer threshold. */
export function ditherKeep(x, y, fade) {
  return (BAYER[y & 3][x & 3] + 0.5) / 16 > fade;
}

/** Bresenham line, both ends included. */
export function rasterLine(x0, y0, x1, y1) {
  const cells = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return cells;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Midpoint circle outline. */
export function circleCells(cx, cy, r) {
  if (r <= 0) return [[cx, cy]];
  const seen = new Map();
  let x = r;
  let y = 0;
  let err = 1 - r;
  while (x >= y) {
    for (const [px, py] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) {
      seen.set(key(cx + px, cy + py), [cx + px, cy + py]);
    }
    y += 1;
    if (err < 0) err += 2 * y + 1;
    else { x -= 1; err += 2 * (y - x) + 1; }
  }
  return [...seen.values()];
}

export function stamp(cells, x, y, size, color) {
  const lo = -Math.floor(size / 2);
  for (let oy = lo; oy < lo + size; oy++) {
    for (let ox = lo; ox < lo + size; ox++) cells.set(key(x + ox, y + oy), color);
  }
}

export function addOutline(cells, color, neighbours = N4) {
  const ring = [];
  for (const k of cells.keys()) {
    const [x, y] = unkey(k);
    for (const [dx, dy] of neighbours) {
      const nk = key(x + dx, y + dy);
      if (!cells.has(nk)) ring.push(nk);
    }
  }
  for (const k of ring) cells.set(k, color);
}

export const lashWidth = (t) => (t < 0.3 ? 3 : t < 0.68 ? 2 : 1);

const toCell = (p, cell) => [Math.floor(p.x / cell), Math.floor(p.y / cell)];

/** Pixel sprite of handle (grip -> hilt) + lash, outlined, in cell coordinates. */
export function whipSprite(points, grip, hilt, cell) {
  const cells = new Map();
  const c = points.map((p) => toCell(p, cell));
  const n = c.length - 1;
  const { lash } = PALETTE;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const width = lashWidth(t);
    const color = lash[Math.min(lash.length - 1, Math.floor(t * lash.length))];
    const line = rasterLine(c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]);
    for (const [x, y] of line) stamp(cells, x, y, width, color);
    if (width >= 2) for (const [x, y] of line) cells.set(key(x, y), PALETTE.lashCore);
  }
  cells.set(key(...c[n]), PALETTE.cracker);

  const [gx, gy] = toCell(grip, cell);
  const [hx, hy] = toCell(hilt, cell);
  rasterLine(gx, gy, hx, hy).forEach(([x, y], k) => {
    stamp(cells, x, y, 3, k % 3 === 2 ? PALETTE.handleWrap : PALETTE.handle);
  });
  stamp(cells, gx, gy, 3, PALETTE.pommel);
  cells.set(key(hx, hy), PALETTE.pommel);
  addOutline(cells, PALETTE.outline);
  return cells;
}

// 5×7 pixel font (uppercase only: lowercase text is drawn in capitals).
const FONT_ROWS = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. #..#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '##### ...#. ..#.. ...#. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '.': '..... ..... ..... ..... ..... ..... ..#..',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '-': '..... ..... ..... ##### ..... ..... .....',
  ' ': '..... ..... ..... ..... ..... ..... .....',
};
export const FONT = Object.freeze(
  Object.fromEntries(Object.entries(FONT_ROWS).map(([ch, rows]) => [ch, rows.split(' ')])),
);
export const GLYPH = Object.freeze({ width: 5, height: 7, advance: 6 });

/** Lit cells of `text` (top-left origin) plus its size in cells. */
export function textCells(text, scale = 1) {
  const cells = [];
  [...text.toUpperCase()].forEach((ch, i) => {
    const rows = FONT[ch] ?? FONT['?'];
    const ox = i * GLYPH.advance * scale;
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '#') return;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) cells.push([ox + rx * scale + sx, ry * scale + sy]);
        }
      });
    });
  });
  return { cells, width: Math.max(0, text.length * GLYPH.advance - 1) * scale, height: GLYPH.height * scale };
}

// 16×16 button icon. H/h handle, P pommel, L lash, S spark.
export const ICON = Object.freeze([
  '................',
  '.............S..',
  '......LLL...SSS.',
  '.....L...L...S..',
  '.....L....L.L...',
  '......L....L....',
  '.......L........',
  '........L.......',
  '.......hH.......',
  '......HHh.......',
  '.....hHH........',
  '....HHh.........',
  '...hHH..........',
  '..PPh...........',
  '..PP............',
  '................',
]);
const ICON_OFF = { bg: '#141414', rim: '#ff5a0a', L: '#ff5a0a', H: '#c98a4b', h: '#6b3a14', P: '#ffb000', S: '#ffd166' };
const ICON_ON = { bg: '#ff5a0a', rim: '#240c00', L: '#240c00', H: '#5a2a08', h: '#240c00', P: '#fff4dc', S: '#fff4dc' };

/** Badge + whip icon cells for the toggle button. */
export function iconCells(on, spark = true) {
  const pal = on ? ICON_ON : ICON_OFF;
  const size = ICON.length;
  const cells = new Map();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xEdge = x === 0 || x === size - 1;
      const yEdge = y === 0 || y === size - 1;
      if (xEdge && yEdge) continue;
      cells.set(key(x, y), xEdge || yEdge ? pal.rim : pal.bg);
    }
  }
  ICON.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (pal[ch] && (ch !== 'S' || spark)) cells.set(key(x, y), pal[ch]);
    });
  });
  return cells;
}
