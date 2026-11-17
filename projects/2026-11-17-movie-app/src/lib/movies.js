export const PAGE_SIZE = 12;

const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

/** Newest first; undated movies sink to the end, ties break alphabetically. */
export function sortByReleaseDate(movies) {
  return [...movies].sort(
    (a, b) =>
      (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.title.localeCompare(b.title),
  );
}

/** Lower-cases and strips diacritics so "Timothee" finds "Timothée". */
export function normalizeText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Keeps the movies where every search term appears in the title, genres, directors or cast. */
export function searchMovies(movies, query) {
  const terms = normalizeText(query ?? '').split(/\s+/).filter(Boolean);
  if (terms.length === 0) return movies;
  return movies.filter((movie) => {
    const haystack = normalizeText(
      [
        movie.title,
        ...(movie.genres ?? []),
        ...(movie.directors ?? []),
        ...(movie.cast ?? []).map((member) => member.name),
      ].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

export function paginate(items, page = 1, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: current, totalPages };
}

export function releaseYear(movie) {
  return /^\d{4}/.test(movie.releaseDate ?? '') ? movie.releaseDate.slice(0, 4) : '';
}

/** Formats an ISO date (`2024-03-01`) or timestamp; returns '' when it is missing or invalid. */
export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

export function formatRuntime(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const isRated = (rating) => Number.isFinite(rating) && rating > 0;

export function formatRating(rating) {
  return isRated(rating) ? rating.toFixed(1) : 'NR';
}

/** Converts a 0–10 score to a 0–100 percentage. */
export function ratingPercent(rating) {
  return isRated(rating) ? Math.min(100, Math.round(rating * 10)) : 0;
}

export function ratingTier(rating) {
  if (!isRated(rating)) return 'unrated';
  if (rating >= 7.5) return 'high';
  return rating >= 6 ? 'mid' : 'low';
}

/** Mean of the reviews' ratings rounded to one decimal, or null without rated reviews. */
export function averageRating(reviews) {
  const ratings = reviews.map((review) => review.rating).filter(Number.isFinite);
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10;
}

export function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

export function truncate(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** The subset of a movie that cards need — what the watchlist persists. */
export function toSummary(movie) {
  return {
    id: movie.id,
    title: movie.title,
    releaseDate: movie.releaseDate ?? '',
    rating: movie.rating ?? 0,
    genres: movie.genres ?? [],
    posterUrl: movie.posterUrl ?? null,
  };
}
