/**
 * An expected catalogue failure whose message is safe to show to the user.
 * `code` is one of: 'not-found', 'unauthorized', 'needs-key', 'network'.
 */
export class CatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
  }
}
