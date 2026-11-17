import { CatalogError } from './errors.js';
import { paginate, searchMovies, sortByReleaseDate } from './movies.js';

/**
 * Serves the bundled catalogue. `loadMovies` returns a promise of the raw
 * movie array; it is called once and retried only after a failure.
 */
export function createDemoProvider(loadMovies) {
  let cache;

  function all() {
    cache ??= Promise.resolve()
      .then(loadMovies)
      .then(sortByReleaseDate)
      .catch((error) => {
        cache = undefined;
        throw error;
      });
    return cache;
  }

  return {
    async list({ page = 1, query = '' } = {}) {
      return paginate(searchMovies(await all(), query), page);
    },

    async get(id) {
      const movie = (await all()).find((candidate) => candidate.id === id);
      if (!movie) throw new CatalogError('not-found', 'This movie could not be found.');
      return movie;
    },
  };
}
