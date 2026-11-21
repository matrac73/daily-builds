# Elevator

A four-floor elevator simulator for the browser, driven by a first-in, first-out call queue and a deterministic, fully tested state machine.

## Features

- **Building cross section** with four floors, a shaft, an animated car with sliding doors, and the right call buttons on each floor (up only on 1, down only on 4, both in between).
- **Control panel** beside the diagram with one button per floor, a floor display and a direction arrow.
- **FIFO call queue**: hall calls are answered strictly in the order they were clicked, never by proximity. The queue is shown live.
- **5-second wait**: after answering a call the doors open and a countdown runs. Pick a floor in time and the car takes you there; otherwise it moves on to the next call.
- **Returns home**: with nothing left to do the car goes back to floor 1. A new call interrupts the trip.
- **Request limit**: at most 6 calls can wait. One more triggers a buzzer and a visible warning.
- **Arrival chime** each time the car reaches a floor (synthesised with Web Audio, can be muted).
- **Random occupants** appear on floors and say which way they want to go; the matching call button pulses as a hint. The interval between arrivals is configurable (0 turns them off).
- **Two delegated event handlers** in total: one for every hall call button, one for every control-panel button.
- No dependencies, no build step, works from any static file host.

## Quick start

The app uses ES modules, so it must be served over HTTP (opening `index.html` from disk will not work).

```bash
git clone <this-repo-url> elevator-app
cd elevator-app
python -m http.server 8000
```

Then open <http://localhost:8000/>. Any static server works, for example `npx serve .`.

## Usage

1. Click an **▲** or **▼** button on a floor to call the elevator. The button lights up and the call joins the queue.
2. When the car arrives, the doors open and the countdown bar starts. Click a floor on the **control panel** within 5 seconds to ride there.
3. If you click nothing, the car answers the next queued call, or returns to floor 1 when the queue is empty.
4. Watch for occupants appearing on floors: the pulsing button shows which call they are waiting for. Change **Seconds between occupants** to speed them up, slow them down or switch them off.

The control panel is active whenever the car is ready for a passenger (idle on floor 1, or waiting after a call) and disabled while it is moving.

### Using the simulation core on its own

`src/elevator.js` has no DOM or timer dependency. Time only moves when you call `tick(ms)`:

```js
import { Elevator } from './src/elevator.js';

const elevator = new Elevator({ floors: 4, waitMs: 5000, maxRequests: 6 });
elevator.subscribe((event) => console.log(event.type, event.floor ?? ''));

elevator.call(3, 'down');   // { accepted: true }
elevator.call(3, 'down');   // { accepted: false, reason: 'duplicate' }
elevator.tick(2400);        // two floors at 1200 ms per floor -> "arrive 3"
elevator.selectFloor(1);    // ride down during the 5 s wait
elevator.tick(10_000);
console.log(elevator.state.phase); // "idle"
```

| Option        | Default | Meaning                                         |
| ------------- | ------- | ----------------------------------------------- |
| `floors`      | `4`     | Number of floors                                |
| `homeFloor`   | `1`     | Floor the car returns to when idle              |
| `msPerFloor`  | `1200`  | Travel time between two adjacent floors         |
| `waitMs`      | `5000`  | Wait for a floor selection after a call         |
| `dwellMs`     | `1500`  | Door-open time after delivering a passenger     |
| `maxRequests` | `6`     | Maximum number of calls waiting in the queue    |

## Project structure

```
index.html            Page markup
styles.css            Layout, building diagram and animations
src/elevator.js       Simulation core: state machine and FIFO call queue
src/occupants.js      Random occupant arrivals and interval parsing
src/sound.js          Web Audio chime and warning buzzer
src/app.js            DOM rendering, event delegation, animation loop
tests/                Unit tests for the core modules
```

## Tests

Requires Node.js 20 or newer. No install step is needed.

```bash
npm test
```

The suite covers FIFO ordering, the 5-second wait, floor selection, the return to floor 1, interrupted trips home, duplicate and overflowing calls, input validation and the occupant generator.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/Elevator-App.md) idea bank.
