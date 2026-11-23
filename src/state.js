/**
 * Decide which control-panel buttons are enabled.
 *
 * The rule is driven by what is actually stored rather than by the last button
 * clicked, so it stays correct when data persisted by a previous session is
 * found on startup:
 *
 * | Database | Load DB  | Query DB | Clear DB |
 * |----------|----------|----------|----------|
 * | empty    | enabled  | enabled  | disabled |
 * | has rows | disabled | enabled  | enabled  |
 *
 * While an operation is running every button is disabled.
 *
 * @param {object} state
 * @param {number} [state.rowCount] Rows currently stored
 * @param {boolean} [state.busy] Whether a database operation is in flight
 * @returns {{ load: boolean, query: boolean, clear: boolean }} `true` = enabled
 */
export function buttonStates({ rowCount = 0, busy = false } = {}) {
  if (busy) {
    return { load: false, query: false, clear: false };
  }
  return { load: rowCount === 0, query: true, clear: rowCount > 0 };
}
