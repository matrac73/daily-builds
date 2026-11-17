/**
 * Hash routes (they survive static hosting in a sub-folder):
 *   #/                 home, optionally with a search: #/?q=dune
 *   #/movie/:id        a movie page
 *   #/watchlist        the saved movies
 */
export function parseRoute(hash) {
  const [path, search = ''] = String(hash ?? '').replace(/^#/, '').split('?');
  const segments = path.split('/').filter(Boolean).map(safeDecode);

  if (segments.length === 0) {
    return { name: 'home', query: (new URLSearchParams(search).get('q') ?? '').trim() };
  }
  if (segments.length === 1 && segments[0] === 'watchlist') return { name: 'watchlist' };
  if (segments.length === 2 && segments[0] === 'movie') return { name: 'movie', id: segments[1] };
  return { name: 'not-found' };
}

export function routeToHash(route) {
  switch (route.name) {
    case 'movie':
      return `#/movie/${encodeURIComponent(route.id)}`;
    case 'watchlist':
      return '#/watchlist';
    default: {
      const query = (route.query ?? '').trim();
      return query ? `#/?${new URLSearchParams({ q: query })}` : '#/';
    }
  }
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
