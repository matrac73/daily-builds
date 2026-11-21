/**
 * Tiny Web Audio synthesiser for the two elevator sounds. Browsers only allow
 * audio after a user gesture, so nothing plays until `unlock()` has been
 * called from a click handler.
 */
export function createSounds() {
  let context = null;
  let enabled = true;

  const tone = ({ frequency, type, start, duration, volume }) => {
    const begin = context.currentTime + start;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, begin);
    gain.gain.exponentialRampToValueAtTime(0.001, begin + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(begin);
    oscillator.stop(begin + duration);
  };

  const play = (notes) => {
    if (enabled && context?.state === 'running') notes.forEach(tone);
  };

  return {
    unlock() {
      const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      context ??= new AudioContextClass();
      if (context.state === 'suspended') context.resume();
    },
    setEnabled(value) {
      enabled = value;
    },
    /** Two-note "ding-dong" played when the car reaches a floor. */
    arrival() {
      play([
        { frequency: 880, type: 'sine', start: 0, duration: 0.5, volume: 0.2 },
        { frequency: 660, type: 'sine', start: 0.18, duration: 0.7, volume: 0.2 },
      ]);
    },
    /** Harsh double buzz played when the call queue is full. */
    warning() {
      play([
        { frequency: 160, type: 'square', start: 0, duration: 0.16, volume: 0.12 },
        { frequency: 160, type: 'square', start: 0.22, duration: 0.16, volume: 0.12 },
      ]);
    },
  };
}
