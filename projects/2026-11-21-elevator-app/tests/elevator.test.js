import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Elevator, Phase, Purpose } from '../src/elevator.js';

const CONFIG = { msPerFloor: 1000, waitMs: 5000, dwellMs: 1500, maxRequests: 3 };

function setup(options = {}) {
  const elevator = new Elevator({ ...CONFIG, ...options });
  const events = [];
  elevator.subscribe((event) => events.push(event));
  const arrivals = () => events.filter((e) => e.type === 'arrive').map((e) => e.floor);
  return { elevator, events, arrivals };
}

test('starts idle on the first floor with an empty queue', () => {
  const { elevator } = setup();
  const { phase, position, queue } = elevator.state;
  assert.equal(phase, Phase.IDLE);
  assert.equal(position, 1);
  assert.deepEqual(queue, []);
});

test('exposes the call buttons that exist on each floor', () => {
  const { elevator } = setup();
  assert.deepEqual(elevator.allowedDirections(1), ['up']);
  assert.deepEqual(elevator.allowedDirections(2), ['up', 'down']);
  assert.deepEqual(elevator.allowedDirections(3), ['up', 'down']);
  assert.deepEqual(elevator.allowedDirections(4), ['down']);
});

test('travels to a called floor at the configured speed', () => {
  const { elevator } = setup();
  assert.deepEqual(elevator.call(3, 'down'), { accepted: true });
  assert.equal(elevator.state.phase, Phase.MOVING);
  assert.equal(elevator.state.direction, 1);

  elevator.tick(500);
  assert.equal(elevator.state.position, 1.5);

  elevator.tick(1500);
  assert.equal(elevator.state.position, 3);
  assert.equal(elevator.state.phase, Phase.WAITING);
  assert.equal(elevator.state.timerMs, 5000);
});

test('serves calls in the order they were made, not by proximity', () => {
  const { elevator, arrivals } = setup();
  elevator.call(4, 'down');
  elevator.call(2, 'up');
  elevator.call(3, 'down');
  assert.deepEqual(elevator.state.pendingCalls.map((c) => c.floor), [4, 2, 3]);

  elevator.tick(60_000);
  assert.deepEqual(arrivals(), [4, 2, 3, 1]);
});

test('waits 5 seconds for a floor selection, then handles the next call', () => {
  const { elevator } = setup();
  elevator.call(2, 'up');
  elevator.call(4, 'down');
  elevator.tick(1000);
  assert.equal(elevator.state.phase, Phase.WAITING);

  elevator.tick(4999);
  assert.equal(elevator.state.phase, Phase.WAITING);
  assert.equal(elevator.state.position, 2);

  elevator.tick(1);
  assert.equal(elevator.state.phase, Phase.MOVING);
  assert.equal(elevator.state.purpose, Purpose.CALL);
  assert.equal(elevator.state.target, 4);
});

test('a floor selected during the wait is travelled to before the next call', () => {
  const { elevator, arrivals } = setup();
  elevator.call(2, 'up');
  elevator.call(3, 'down');
  elevator.tick(1000);

  assert.deepEqual(elevator.selectFloor(4), { accepted: true });
  assert.equal(elevator.state.purpose, Purpose.RIDE);

  elevator.tick(2000);
  assert.equal(elevator.state.phase, Phase.DWELL);
  assert.equal(elevator.state.position, 4);

  elevator.tick(1500);
  assert.equal(elevator.state.purpose, Purpose.CALL);
  assert.equal(elevator.state.target, 3);

  elevator.tick(60_000);
  assert.deepEqual(arrivals(), [2, 4, 3, 1]);
});

test('returns to the first floor and goes idle when nothing is left', () => {
  const { elevator, events } = setup();
  elevator.call(3, 'up');
  elevator.tick(2000 + 5000);
  assert.equal(elevator.state.purpose, Purpose.HOME);
  assert.equal(elevator.state.direction, -1);

  elevator.tick(2000);
  assert.equal(elevator.state.phase, Phase.IDLE);
  assert.equal(elevator.state.position, 1);
  assert.equal(events.at(-1).type, 'idle');
});

test('a new call interrupts the trip back home', () => {
  const { elevator } = setup();
  elevator.call(4, 'down');
  elevator.tick(3000 + 5000 + 1500);
  assert.equal(elevator.state.position, 2.5);

  elevator.call(3, 'up');
  assert.equal(elevator.state.purpose, Purpose.CALL);
  assert.equal(elevator.state.direction, 1);

  elevator.tick(500);
  assert.equal(elevator.state.position, 3);
  assert.equal(elevator.state.phase, Phase.WAITING);
});

test('a call on the floor where the car is parked opens the doors at once', () => {
  const { elevator, events } = setup();
  elevator.call(1, 'up');
  assert.equal(elevator.state.phase, Phase.WAITING);
  assert.deepEqual(events.map((e) => e.type), ['queued', 'arrive']);
  assert.deepEqual(events[1].call, { floor: 1, direction: 'up' });
});

test('the control panel works from the idle car', () => {
  const { elevator, arrivals } = setup();
  assert.deepEqual(elevator.selectFloor(3), { accepted: true });
  elevator.tick(60_000);
  assert.deepEqual(arrivals(), [3, 1]);
});

test('the control panel is ignored while moving or for the current floor', () => {
  const { elevator } = setup();
  assert.deepEqual(elevator.selectFloor(1), { accepted: false, reason: 'same-floor' });

  elevator.call(3, 'up');
  elevator.tick(500);
  assert.deepEqual(elevator.selectFloor(2), { accepted: false, reason: 'busy' });
  assert.equal(elevator.state.target, 3);
});

test('duplicate calls are not queued twice', () => {
  const { elevator } = setup();
  elevator.call(4, 'down');
  elevator.call(2, 'up');
  assert.deepEqual(elevator.call(2, 'up'), { accepted: false, reason: 'duplicate' });
  assert.deepEqual(elevator.call(4, 'down'), { accepted: false, reason: 'duplicate' });
  assert.deepEqual(elevator.call(2, 'down'), { accepted: true });
  assert.equal(elevator.state.queue.length, 2);
});

test('rejects calls beyond the request limit and reports the overflow', () => {
  const { elevator, events } = setup();
  elevator.call(4, 'down'); // dispatched immediately, frees its queue slot
  elevator.call(2, 'up');
  elevator.call(2, 'down');
  elevator.call(3, 'up');
  assert.deepEqual(elevator.call(3, 'down'), { accepted: false, reason: 'full' });

  const overflow = events.at(-1);
  assert.equal(overflow.type, 'overflow');
  assert.equal(overflow.limit, 3);
  assert.deepEqual(overflow.call, { floor: 3, direction: 'down' });
  assert.equal(elevator.state.queue.length, 3);
});

test('a single large tick is equivalent to many small ones', () => {
  const run = (step) => {
    const { elevator, events } = setup();
    elevator.call(3, 'down');
    elevator.call(2, 'up');
    for (let elapsed = 0; elapsed < 30_000; elapsed += step) elevator.tick(step);
    return { events, state: elevator.state };
  };
  assert.deepEqual(run(30_000), run(16));
});

test('state snapshots cannot mutate the queue', () => {
  const { elevator } = setup();
  elevator.call(4, 'down');
  elevator.call(2, 'up');
  elevator.state.queue.pop();
  elevator.state.queue[0].floor = 3;
  assert.deepEqual(elevator.state.queue, [{ floor: 2, direction: 'up' }]);
});

test('rejects impossible floors, directions and configuration', () => {
  const { elevator } = setup();
  assert.throws(() => elevator.call(0, 'up'), RangeError);
  assert.throws(() => elevator.call(5, 'down'), RangeError);
  assert.throws(() => elevator.call(1, 'down'), RangeError);
  assert.throws(() => elevator.call(4, 'up'), RangeError);
  assert.throws(() => elevator.selectFloor(2.5), RangeError);
  assert.throws(() => elevator.tick(-1), RangeError);
  assert.throws(() => new Elevator({ floors: 1 }), RangeError);
  assert.throws(() => new Elevator({ homeFloor: 9 }), RangeError);
  assert.throws(() => new Elevator({ waitMs: 0 }), RangeError);
});

test('unsubscribed listeners stop receiving events', () => {
  const elevator = new Elevator(CONFIG);
  const seen = [];
  const unsubscribe = elevator.subscribe((event) => seen.push(event.type));
  elevator.call(2, 'up');
  unsubscribe();
  elevator.tick(10_000);
  assert.deepEqual(seen, ['queued', 'depart']);
});
