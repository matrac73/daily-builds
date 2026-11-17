import { createCatalog } from './lib/catalog.js';
import { createDemoProvider } from './lib/demo-provider.js';
import { CatalogError } from './lib/errors.js';
import { UserStore } from './lib/store.js';
import { createTmdbProvider } from './lib/tmdb-provider.js';

/** localStorage can throw on access when the browser blocks site data. */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function loadBundledMovies() {
  const response = await fetch(new URL('../data/movies.json', import.meta.url)).catch(() => null);
  if (!response?.ok) throw new CatalogError('network', 'Could not load the demo catalogue.');
  return response.json();
}

/** The app-wide singletons shared by every component. */
export const store = new UserStore({ storage: browserStorage() });

export const catalog = createCatalog({
  demo: createDemoProvider(loadBundledMovies),
  tmdb: createTmdbProvider({ getApiKey: () => store.tmdbKey }),
  hasApiKey: () => Boolean(store.tmdbKey),
});
