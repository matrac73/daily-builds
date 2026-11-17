import { CatalogError } from './errors.js';

const API_ROOT = 'https://api.themoviedb.org/3';
const IMAGE_ROOT = 'https://image.tmdb.org/t/p';
const MAX_PAGES = 500; // TMDB refuses to page any further
const MAX_CAST = 12;

const image = (size, path) => (path ? `${IMAGE_ROOT}/${size}${path}` : null);

function toSummary(movie, genres) {
  return {
    id: String(movie.id),
    title: movie.title,
    releaseDate: movie.release_date ?? '',
    overview: movie.overview ?? '',
    rating: movie.vote_average ?? 0,
    voteCount: movie.vote_count ?? 0,
    genres,
    posterUrl: image('w342', movie.poster_path),
    backdropUrl: image('w1280', movie.backdrop_path),
  };
}

function toDetails(movie) {
  const crew = movie.credits?.crew ?? [];
  return {
    ...toSummary(movie, (movie.genres ?? []).map((genre) => genre.name)),
    tagline: movie.tagline ?? '',
    runtime: movie.runtime ?? null,
    directors: crew.filter((member) => member.job === 'Director').map((member) => member.name),
    cast: (movie.credits?.cast ?? []).slice(0, MAX_CAST).map((member) => ({
      name: member.name,
      character: member.character ?? '',
      photoUrl: image('w185', member.profile_path),
    })),
    reviews: (movie.reviews?.results ?? []).map((review) => ({
      author: review.author,
      text: review.content,
      date: review.created_at,
    })),
  };
}

/**
 * Live catalogue backed by the TMDB v3 API. `getApiKey` is read on every
 * request so the key can change at runtime; `fetch` and `today` are
 * injectable for tests.
 */
export function createTmdbProvider({
  getApiKey,
  fetch: fetchFn = (...args) => fetch(...args),
  today = () => new Date(),
}) {
  let genreNames;

  async function request(path, params = {}) {
    const url = new URL(`${API_ROOT}${path}`);
    url.search = new URLSearchParams({ ...params, api_key: getApiKey() });

    let response;
    try {
      response = await fetchFn(url);
    } catch {
      throw new CatalogError('network', 'Could not reach TMDB. Check your connection and retry.');
    }
    if (response.status === 401) {
      throw new CatalogError('unauthorized', 'TMDB rejected the API key. Check it in the account panel.');
    }
    if (response.status === 404) {
      throw new CatalogError('not-found', 'This movie could not be found.');
    }
    if (!response.ok) {
      throw new CatalogError('network', `TMDB request failed (HTTP ${response.status}).`);
    }
    return response.json();
  }

  /** List endpoints only return genre ids, so the id → name table is fetched once. */
  function genres() {
    genreNames ??= request('/genre/movie/list')
      .then((data) => new Map(data.genres.map((genre) => [genre.id, genre.name])))
      .catch((error) => {
        genreNames = undefined;
        throw error;
      });
    return genreNames;
  }

  return {
    async list({ page = 1, query = '' } = {}) {
      const search = query.trim();
      const movies = search
        ? request('/search/movie', { query: search, page })
        : request('/discover/movie', {
            sort_by: 'primary_release_date.desc',
            'primary_release_date.lte': today().toISOString().slice(0, 10),
            // Skips the long tail of obscure entries without votes or artwork.
            'vote_count.gte': 40,
            page,
          });
      const [data, names] = await Promise.all([movies, genres()]);
      return {
        items: data.results.map((movie) =>
          toSummary(movie, (movie.genre_ids ?? []).map((id) => names.get(id)).filter(Boolean)),
        ),
        page: data.page,
        totalPages: Math.min(data.total_pages, MAX_PAGES),
      };
    },

    async get(id) {
      return toDetails(
        await request(`/movie/${encodeURIComponent(id)}`, { append_to_response: 'credits,reviews' }),
      );
    },
  };
}
