import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buttonStates } from '../src/state.js';

describe('buttonStates', () => {
  it('initial display / after Clear DB: load and query enabled, clear disabled', () => {
    assert.deepEqual(buttonStates({ rowCount: 0 }), { load: true, query: true, clear: false });
  });

  it('after Load DB / Query DB with data: load disabled, query and clear enabled', () => {
    assert.deepEqual(buttonStates({ rowCount: 8 }), { load: false, query: true, clear: true });
  });

  it('disables everything while an operation is running', () => {
    assert.deepEqual(buttonStates({ rowCount: 8, busy: true }), { load: false, query: false, clear: false });
    assert.deepEqual(buttonStates({ busy: true }), { load: false, query: false, clear: false });
  });

  it('defaults to the empty-database state', () => {
    assert.deepEqual(buttonStates(), buttonStates({ rowCount: 0, busy: false }));
  });
});
