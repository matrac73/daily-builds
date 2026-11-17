import { CatalogError } from './errors.js';

/** TMDB ids are numeric; the bundled catalogue uses slugs such as `dune-part-two`. */
export const isTmdbId = (id) => /^\d+$/.test(id);

/**
 * Single entry point for movie data. Browsing uses TMDB as soon as an API
 * key is available and the bundled catalogue otherwise; a movie page is
 * always resolved by the provider its id belongs to, so watchlist entries
 * keep working after the data source changes.
 */
export function createCatalog({ demo, tmdb, hasApiKey }) {
  return {
    get source() {
      return hasApiKey() ? 'tmdb' : 'demo';
    },

    list(params) {
      return (hasApiKey() ? tmdb : demo).list(params);
    },

    async get(id) {
      if (!isTmdbId(id)) return demo.get(id);
      if (!hasApiKey()) {
        throw new CatalogError(
          'needs-key',
          'This movie comes from TMDB. Add your API key in the account panel to open it.',
        );
      }
      return tmdb.get(id);
    },
  };
}
