import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addEvent, removeEvent, sortByTarget, serialize, deserialize } from '../src/events.js';

const a = { id: 'a', name: 'Alpha', target: 3000 };
const b = { id: 'b', name: 'Bravo', target: 1000 };
const c = { id: 'c', name: 'Charlie', target: 2000 };

describe('event list', () => {
  test('sortByTarget orders soonest first without mutating', () => {
    const list = [a, b, c];
    assert.deepEqual(sortByTarget(list).map((e) => e.id), ['b', 'c', 'a']);
    assert.deepEqual(list.map((e) => e.id), ['a', 'b', 'c']);
  });

  test('addEvent inserts in order and keeps the given id', () => {
    const list = addEvent([a, b], { name: 'Charlie', target: 2000 }, 'c');
    assert.deepEqual(list.map((e) => e.id), ['b', 'c', 'a']);
  });

  test('addEvent generates unique ids by default', () => {
    const list = addEvent(addEvent([], { name: 'One', target: 1 }), { name: 'Two', target: 2 });
    assert.equal(list.length, 2);
    assert.notEqual(list[0].id, list[1].id);
    assert.ok(list.every((e) => typeof e.id === 'string' && e.id.length > 0));
  });

  test('removeEvent drops only the matching id', () => {
    assert.deepEqual(removeEvent([a, b, c], 'b'), [a, c]);
    assert.deepEqual(removeEvent([a], 'missing'), [a]);
  });
});

describe('persistence', () => {
  test('round-trips through serialize/deserialize', () => {
    assert.deepEqual(deserialize(serialize([a, b, c])), [b, c, a]);
  });

  test('serialize strips unknown properties', () => {
    assert.equal(serialize([{ ...a, extra: true }]), JSON.stringify([a]));
  });

  test('deserialize tolerates missing or corrupt data', () => {
    assert.deepEqual(deserialize(null), []);
    assert.deepEqual(deserialize(''), []);
    assert.deepEqual(deserialize('{not json'), []);
    assert.deepEqual(deserialize('{"id":"a"}'), []);
  });

  test('deserialize drops malformed entries', () => {
    const raw = JSON.stringify([
      a,
      null,
      { id: '', name: 'No id', target: 1 },
      { id: 'x', name: '   ', target: 1 },
      { id: 'y', name: 'Bad target', target: 'soon' },
      { id: 'z', name: 'Infinity', target: null },
    ]);
    assert.deepEqual(deserialize(raw), [a]);
  });
});
