// All sounds are synthesised with the Web Audio API: no audio files to ship.

const BELL_PARTIALS = [
  { ratio: 1, gain: 0.5, decay: 2.2 },
  { ratio: 2.0, gain: 0.3, decay: 1.6 },
  { ratio: 2.76, gain: 0.22, decay: 1.2 },
  { ratio: 5.4, gain: 0.12, decay: 0.7 },
  { ratio: 8.93, gain: 0.06, decay: 0.4 },
];

// One distinct jingle per non-bell score: more points, more (and higher) notes.
const AWARD_NOTES = [[98], [262], [262, 330], [262, 330, 392], [262, 330, 392, 523]];
const FANFARE_NOTES = [523, 523, 523, 659, 784, 659, 1047];

/**
 * Creates the game's sound effects. The audio context is created lazily on the
 * first sound, because browsers only allow audio after a user gesture.
 */
export function createSoundboard() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let context = null;
  let master = null;
  let muted = false;
  let slide = null;

  /** Returns the running audio context, or null where Web Audio is unavailable. */
  function audio() {
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  /** Plays a single enveloped oscillator note, optionally gliding to `endFrequency`. */
  function note({ frequency, endFrequency, delay = 0, duration, type = 'sine', gain = 0.2 }) {
    const ctx = audio();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    }
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  return {
    get muted() {
      return muted;
    },

    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 1;
    },

    /** The mallet hitting the lever. */
    thud() {
      note({ frequency: 140, endFrequency: 45, duration: 0.18, type: 'triangle', gain: 0.5 });
    },

    /** Starts the rising whistle of the puck on the rail; steer it with `slideTo`. */
    startSlide() {
      const ctx = audio();
      if (!ctx || slide) return;
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 160;
      envelope.gain.value = 0.045;
      oscillator.connect(envelope).connect(master);
      oscillator.start();
      slide = { oscillator, envelope };
    },

    /** Tunes the rail whistle to the puck's height (0..1). */
    slideTo(height) {
      if (!slide) return;
      slide.oscillator.frequency.setTargetAtTime(160 + height * 760, context.currentTime, 0.015);
    },

    stopSlide() {
      if (!slide) return;
      const { oscillator, envelope } = slide;
      slide = null;
      envelope.gain.setTargetAtTime(0, context.currentTime, 0.02);
      oscillator.stop(context.currentTime + 0.15);
    },

    /** The bell at the top of the tower: a stack of inharmonic, slowly decaying partials. */
    bell() {
      for (const partial of BELL_PARTIALS) {
        note({ frequency: 880 * partial.ratio, duration: partial.decay, gain: partial.gain * 0.5 });
      }
    },

    /** A jingle unique to each number of points below the bell (0 to 4). */
    award(points) {
      const notes = AWARD_NOTES[points];
      if (!notes) return;
      if (points === 0) {
        note({ frequency: notes[0], endFrequency: 55, duration: 0.45, type: 'sawtooth', gain: 0.18 });
        return;
      }
      notes.forEach((frequency, index) => {
        note({ frequency, delay: index * 0.09, duration: 0.22, type: 'square', gain: 0.1 });
      });
    },

    /** Played when the points target is reached. */
    fanfare(delay = 0) {
      FANFARE_NOTES.forEach((frequency, index) => {
        const last = index === FANFARE_NOTES.length - 1;
        note({
          frequency,
          delay: delay + index * 0.13,
          duration: last ? 0.7 : 0.16,
          type: 'triangle',
          gain: 0.22,
        });
      });
    },
  };
}
