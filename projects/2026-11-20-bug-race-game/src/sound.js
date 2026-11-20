/**
 * Tiny Web Audio jingles, synthesised on the fly (no audio files).
 * A note is [frequency in Hz, start offset in s, duration in s].
 */

const JINGLES = Object.freeze({
  start: { wave: 'square', notes: [[440, 0, 0.1], [440, 0.18, 0.1], [880, 0.36, 0.28]] },
  win: { wave: 'triangle', notes: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.4]] },
  lose: { wave: 'sawtooth', notes: [[392, 0, 0.2], [330, 0.2, 0.2], [262, 0.4, 0.45]] },
});

const VOLUME = 0.12;

export function createSoundboard() {
  let context = null;
  let muted = false;

  const play = ({ wave, notes }) => {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (muted || !AudioContextClass) return;

    context ??= new AudioContextClass();
    if (context.state === 'suspended') context.resume();

    for (const [frequency, offset, duration] of notes) {
      const startAt = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(VOLUME, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration);
    }
  };

  return {
    setMuted(value) {
      muted = value;
    },
    playStart: () => play(JINGLES.start),
    playWin: () => play(JINGLES.win),
    playLose: () => play(JINGLES.lose),
  };
}
