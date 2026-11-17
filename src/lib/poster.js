/** 32-bit FNV-1a hash — small, fast and stable across runtimes. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Derives a deterministic two-tone gradient from a title, used to draw a
 * poster for movies that ship without artwork (the whole demo catalogue).
 */
export function posterPalette(title) {
  const hash = hashString(title);
  const hue = hash % 360;
  const secondHue = (hue + 40 + ((hash >>> 9) % 80)) % 360;
  return {
    from: `hsl(${hue} 55% 34%)`,
    to: `hsl(${secondHue} 60% 13%)`,
    angle: 120 + ((hash >>> 17) % 100),
  };
}
