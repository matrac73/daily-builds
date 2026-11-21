/**
 * Elevator simulation core: a deterministic state machine with no DOM or
 * timer dependencies. Time only advances through `tick(ms)`, which makes the
 * whole behaviour reproducible in tests and trivially drivable from
 * `requestAnimationFrame` in the browser.
 */

export const Phase = Object.freeze({
  /** Parked at the home floor with nothing to do. */
  IDLE: 'idle',
  /** Travelling towards `target`. */
  MOVING: 'moving',
  /** Doors open after answering a call, waiting for a floor selection. */
  WAITING: 'waiting',
  /** Doors open after delivering a passenger. */
  DWELL: 'dwell',
});

export const Purpose = Object.freeze({
  CALL: 'call',
  RIDE: 'ride',
  HOME: 'home',
});

export const Direction = Object.freeze({
  UP: 'up',
  DOWN: 'down',
});

export const DEFAULT_CONFIG = Object.freeze({
  floors: 4,
  homeFloor: 1,
  msPerFloor: 1200,
  waitMs: 5000,
  dwellMs: 1500,
  maxRequests: 6,
});

const sameCall = (a, b) => a.floor === b.floor && a.direction === b.direction;

export class Elevator {
  #listeners = new Set();
  #queue = [];
  #phase = Phase.IDLE;
  #purpose = null;
  #activeCall = null;
  #timerMs = 0;
  #position;
  #target;

  constructor(options = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };
    if (!Number.isInteger(config.floors) || config.floors < 2) {
      throw new RangeError('An elevator needs at least 2 floors');
    }
    if (!Number.isInteger(config.homeFloor) || config.homeFloor < 1 || config.homeFloor > config.floors) {
      throw new RangeError(`homeFloor must be between 1 and ${config.floors}`);
    }
    for (const key of ['msPerFloor', 'waitMs', 'dwellMs', 'maxRequests']) {
      if (!(config[key] > 0)) throw new RangeError(`${key} must be a positive number`);
    }
    this.config = Object.freeze(config);
    this.#position = config.homeFloor;
    this.#target = config.homeFloor;
  }

  /** Immutable view of the current state, safe to hand to a renderer. */
  get state() {
    const moving = this.#phase === Phase.MOVING;
    const answering = moving && this.#purpose === Purpose.CALL;
    return {
      phase: this.#phase,
      purpose: moving ? this.#purpose : null,
      position: this.#position,
      floor: Math.round(this.#position),
      target: this.#target,
      direction: moving ? Math.sign(this.#target - this.#position) : 0,
      timerMs: this.#timerMs,
      queue: this.#queue.map((call) => ({ ...call })),
      pendingCalls: [...(answering ? [this.#activeCall] : []), ...this.#queue].map((call) => ({ ...call })),
    };
  }

  /** Call directions that exist on a floor: no "down" at the bottom, no "up" at the top. */
  allowedDirections(floor) {
    this.#assertFloor(floor);
    const directions = [];
    if (floor < this.config.floors) directions.push(Direction.UP);
    if (floor > 1) directions.push(Direction.DOWN);
    return directions;
  }

  /** Subscribe to simulation events. Returns an unsubscribe function. */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * A hall button was pressed. Calls are served strictly first-in, first-out.
   * @returns {{accepted: boolean, reason?: 'duplicate' | 'full'}}
   */
  call(floor, direction) {
    if (!this.allowedDirections(floor).includes(direction)) {
      throw new RangeError(`Floor ${floor} has no "${direction}" call button`);
    }
    const call = { floor, direction };
    const travellingToIt =
      this.#phase === Phase.MOVING && this.#purpose === Purpose.CALL && sameCall(this.#activeCall, call);
    if (travellingToIt || this.#queue.some((queued) => sameCall(queued, call))) {
      return { accepted: false, reason: 'duplicate' };
    }
    if (this.#queue.length >= this.config.maxRequests) {
      this.#emit('overflow', { call, limit: this.config.maxRequests });
      return { accepted: false, reason: 'full' };
    }
    this.#queue.push(call);
    this.#emit('queued', { call });

    const interruptible =
      this.#phase === Phase.IDLE || (this.#phase === Phase.MOVING && this.#purpose === Purpose.HOME);
    if (interruptible) this.#dispatchNext();
    return { accepted: true };
  }

  /**
   * A control-panel button was pressed. Only honoured while the car is
   * stationary and ready for a passenger (idle, or waiting after a call).
   * @returns {{accepted: boolean, reason?: 'busy' | 'same-floor'}}
   */
  selectFloor(floor) {
    this.#assertFloor(floor);
    if (this.#phase !== Phase.IDLE && this.#phase !== Phase.WAITING) {
      return { accepted: false, reason: 'busy' };
    }
    if (floor === this.#position) {
      return { accepted: false, reason: 'same-floor' };
    }
    this.#travel(floor, Purpose.RIDE);
    return { accepted: true };
  }

  /** Advance the simulation by `elapsedMs` milliseconds. */
  tick(elapsedMs) {
    if (!(elapsedMs >= 0)) throw new RangeError('elapsedMs must be a non-negative number');
    let budget = elapsedMs;
    while (budget > 0) budget = this.#step(budget);
  }

  /** Consume as much of `budget` as the current phase needs; return the rest. */
  #step(budget) {
    if (this.#phase === Phase.IDLE) return 0;

    if (this.#phase === Phase.MOVING) {
      const distance = this.#target - this.#position;
      const needed = Math.abs(distance) * this.config.msPerFloor;
      if (budget < needed) {
        this.#position += (Math.sign(distance) * budget) / this.config.msPerFloor;
        return 0;
      }
      this.#arrive();
      return budget - needed;
    }

    if (budget < this.#timerMs) {
      this.#timerMs -= budget;
      return 0;
    }
    const rest = budget - this.#timerMs;
    this.#timerMs = 0;
    this.#dispatchNext();
    return rest;
  }

  #dispatchNext() {
    if (this.#queue.length > 0) {
      this.#activeCall = this.#queue.shift();
      this.#travel(this.#activeCall.floor, Purpose.CALL);
    } else if (this.#position !== this.config.homeFloor) {
      this.#travel(this.config.homeFloor, Purpose.HOME);
    } else {
      this.#phase = Phase.IDLE;
      this.#emit('idle', { floor: this.#position });
    }
  }

  #travel(target, purpose) {
    this.#target = target;
    this.#purpose = purpose;
    if (this.#position === target) {
      this.#arrive();
      return;
    }
    this.#phase = Phase.MOVING;
    this.#emit('depart', { target, purpose });
  }

  #arrive() {
    const purpose = this.#purpose;
    this.#position = this.#target;
    if (purpose === Purpose.CALL) {
      this.#phase = Phase.WAITING;
      this.#timerMs = this.config.waitMs;
    } else if (purpose === Purpose.RIDE) {
      this.#phase = Phase.DWELL;
      this.#timerMs = this.config.dwellMs;
    } else {
      this.#phase = Phase.IDLE;
    }
    const detail = { floor: this.#position, purpose };
    if (purpose === Purpose.CALL) detail.call = { ...this.#activeCall };
    this.#emit('arrive', detail);
    if (purpose === Purpose.HOME) this.#emit('idle', { floor: this.#position });
  }

  #assertFloor(floor) {
    if (!Number.isInteger(floor) || floor < 1 || floor > this.config.floors) {
      throw new RangeError(`Floor must be an integer between 1 and ${this.config.floors}`);
    }
  }

  #emit(type, detail) {
    for (const listener of this.#listeners) listener({ type, ...detail });
  }
}
