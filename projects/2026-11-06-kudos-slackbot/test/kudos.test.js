import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { KudoStore, executeCommand, parseCommand, parseUserRef, parseCount, KudoError } from '../src/kudos.js';

const fixedClock = () => new Date('2026-11-06T10:00:00Z');
const newStore = () => new KudoStore({}, fixedClock);

describe('parseUserRef', () => {
  test('accepts escaped Slack mentions with and without a label', () => {
    assert.equal(parseUserRef('<@U123ABC|alice>'), 'U123ABC');
    assert.equal(parseUserRef('<@u123abc>'), 'U123ABC');
  });
  test('accepts @handles and raw ids', () => {
    assert.equal(parseUserRef('@alice'), 'alice');
    assert.equal(parseUserRef('U999'), 'U999');
  });
  test('rejects garbage', () => {
    assert.throws(() => parseUserRef('<#C123>'), KudoError);
    assert.throws(() => parseUserRef(''), KudoError);
  });
});

describe('parseCount', () => {
  test('handles integers, star and defaults', () => {
    assert.equal(parseCount('3', 10), 3);
    assert.equal(parseCount('*', 10), Infinity);
    assert.equal(parseCount(undefined, 10), 10);
  });
  test('rejects zero, negatives and words', () => {
    for (const bad of ['0', '-1', 'ten', '2.5']) assert.throws(() => parseCount(bad, 1), KudoError);
  });
});

describe('parseCommand', () => {
  test('add keeps multi-word text intact', () => {
    assert.deepEqual(parseCommand('add <@U1|bob>   shipped the   release!'), {
      action: 'add',
      recipient: 'U1',
      text: 'shipped the   release!',
    });
  });
  test('actions are case-insensitive and empty input means help', () => {
    assert.equal(parseCommand('LIST 2').action, 'list');
    assert.equal(parseCommand('').action, 'help');
  });
  test('validates required arguments', () => {
    assert.throws(() => parseCommand('add @bob'), /kudo text/);
    assert.throws(() => parseCommand('add'), /Usage/);
    assert.throws(() => parseCommand('replace abc new text'), /valid kudo id/);
    assert.throws(() => parseCommand('delete'), /valid kudo id/);
    assert.throws(() => parseCommand('user'), /Usage/);
    assert.throws(() => parseCommand('dance'), /Unknown action/);
    assert.throws(() => parseCommand(`add @bob ${'x'.repeat(501)}`), /limited/);
  });
});

describe('executeCommand', () => {
  test('add announces publicly and stores the kudo', () => {
    const store = newStore();
    const res = executeCommand(store, 'UALICE', 'add <@UBOB|bob> great code review');
    assert.equal(res.visibility, 'in_channel');
    assert.equal(res.changed, true);
    assert.match(res.text, /<@UALICE> gave kudo \*#1\* to <@UBOB>: great code review/);
    assert.deepEqual(store.kudos[0], {
      id: 1,
      author: 'UALICE',
      recipient: 'UBOB',
      text: 'great code review',
      createdAt: '2026-11-06T10:00:00.000Z',
    });
  });

  test('cannot give a kudo to yourself', () => {
    const store = newStore();
    const res = executeCommand(store, 'UALICE', 'add <@UALICE> me me me');
    assert.equal(res.visibility, 'ephemeral');
    assert.equal(res.changed, false);
    assert.equal(store.kudos.length, 0);
  });

  test('replace and delete are restricted to the author', () => {
    const store = newStore();
    executeCommand(store, 'UALICE', 'add @UBOB thanks');

    const denied = executeCommand(store, 'UCAROL', 'replace 1 hijacked');
    assert.match(denied.text, /Only the author/);
    assert.equal(store.kudos[0].text, 'thanks');

    const replaced = executeCommand(store, 'UALICE', 'replace 1 thanks a lot!');
    assert.equal(replaced.changed, true);
    assert.equal(store.kudos[0].text, 'thanks a lot!');
    assert.ok(store.kudos[0].updatedAt);

    assert.match(executeCommand(store, 'UBOB', 'delete 1').text, /Only the author/);
    assert.match(executeCommand(store, 'UALICE', 'delete 1').text, /deleted/);
    assert.equal(store.kudos.length, 0);
    assert.match(executeCommand(store, 'UALICE', 'delete 1').text, /does not exist/);
  });

  test('ids are never reused after a delete', () => {
    const store = newStore();
    executeCommand(store, 'UA', 'add @UB one');
    executeCommand(store, 'UA', 'delete 1');
    executeCommand(store, 'UA', 'add @UB two');
    assert.equal(store.kudos[0].id, 2);
  });

  test('list shows the n most recent kudos, newest first, or all with *', () => {
    const store = newStore();
    for (const n of [1, 2, 3]) executeCommand(store, 'UA', `add @UB kudo ${n}`);

    const two = executeCommand(store, 'UA', 'list 2').text.split('\n');
    assert.equal(two.length, 3);
    assert.match(two[1], /#3/);
    assert.match(two[2], /#2/);

    assert.equal(executeCommand(store, 'UA', 'list *').text.split('\n').length, 4);
    assert.match(executeCommand(newStore(), 'UA', 'list').text, /No kudos yet/);
  });

  test('edited kudos are flagged in listings', () => {
    const store = newStore();
    executeCommand(store, 'UA', 'add @UB first draft');
    executeCommand(store, 'UA', 'replace 1 final');
    assert.match(executeCommand(store, 'UA', 'list').text, /final _\(edited\)_/);
  });

  test('user shows only kudos for that person', () => {
    const store = newStore();
    executeCommand(store, 'UA', 'add @UB for bob');
    executeCommand(store, 'UA', 'add @UC for carol');
    executeCommand(store, 'UC', 'add @UB bob again');

    const res = executeCommand(store, 'UA', 'user <@UB|bob>').text;
    assert.match(res, /<@UB> has 2 kudos/);
    assert.match(res, /bob again/);
    assert.doesNotMatch(res, /for carol/);
    assert.match(executeCommand(store, 'UA', 'user @UZ').text, /no kudos yet/);
  });

  test('top ranks recipients by count, ties broken by who was recognised first', () => {
    const store = newStore();
    executeCommand(store, 'UA', 'add @UC c1');
    executeCommand(store, 'UA', 'add @UB b1');
    executeCommand(store, 'UA', 'add @UB b2');
    executeCommand(store, 'UB', 'add @UD d1');

    assert.deepEqual(store.leaderboard(Infinity), [
      { recipient: 'UB', count: 2 },
      { recipient: 'UC', count: 1 },
      { recipient: 'UD', count: 1 },
    ]);
    const lines = executeCommand(store, 'UA', 'top 2').text.split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[1], /first_place_medal.*<@UB> with 2 kudos/);
    assert.match(lines[2], /<@UC> with 1 kudo$/);
  });

  test('help and errors are ephemeral', () => {
    const store = newStore();
    assert.match(executeCommand(store, 'UA', 'help').text, /Kudos commands/);
    const err = executeCommand(store, 'UA', 'list nope');
    assert.equal(err.visibility, 'ephemeral');
    assert.match(err.text, /^:warning:/);
  });
});

describe('KudoStore serialisation', () => {
  test('round-trips through JSON without sharing state', () => {
    const store = newStore();
    store.add('UA', 'UB', 'hello');
    const copy = new KudoStore(JSON.parse(JSON.stringify(store)));
    copy.add('UA', 'UC', 'world');
    assert.equal(copy.kudos[1].id, 2);
    assert.equal(store.kudos.length, 1);
  });
});
