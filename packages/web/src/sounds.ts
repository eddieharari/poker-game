/**
 * Procedural card sounds via Web Audio API — no audio files required.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  // Resume if browser suspended it (autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** A single card snap — played each time a card is placed. */
export function playDealSound(): void {
  try {
    const ac = getCtx();
    const now = ac.currentTime;

    // Short noise burst shaped like a card slap
    const bufLen = Math.floor(ac.sampleRate * 0.08);
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.12));
    }

    const src = ac.createBufferSource();
    src.buffer = buf;

    const hpf = ac.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 800;

    const bpf = ac.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 3500;
    bpf.Q.value = 0.8;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    src.connect(hpf);
    hpf.connect(bpf);
    bpf.connect(gain);
    gain.connect(ac.destination);
    src.start(now);
    src.stop(now + 0.09);
  } catch {
    // Silently ignore — audio is non-critical
  }
}

/** Rising fanfare — played when the player wins. */
export function playWinSound(): void {
  try {
    const ac = getCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    const now = ac.currentTime;
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch { /* non-critical */ }
}

/** Descending sad tones — played when the player loses. */
export function playLoseSound(): void {
  try {
    const ac = getCtx();
    const notes = [440, 349.23, 293.66]; // A4 F4 D4
    const now = ac.currentTime;
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.2;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch { /* non-critical */ }
}

/** A rapid riffle shuffle — played once when the game starts. */
export function playShuffleSound(): void {
  try {
    const ac = getCtx();
    const flicks = 14;
    const interval = 0.055; // seconds between flicks

    for (let i = 0; i < flicks; i++) {
      const t = ac.currentTime + i * interval;

      const bufLen = Math.floor(ac.sampleRate * 0.045);
      const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      // Pitch rises slightly toward the end of the shuffle
      const decay = bufLen * (0.08 + (i / flicks) * 0.12);
      for (let j = 0; j < bufLen; j++) {
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / decay);
      }

      const src = ac.createBufferSource();
      src.buffer = buf;

      const bpf = ac.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 1800 + i * 80;
      bpf.Q.value = 1.2;

      // Velocity accent: louder at start and end of shuffle
      const vel = 0.18 + 0.18 * Math.abs(Math.sin((i / flicks) * Math.PI));
      const gain = ac.createGain();
      gain.gain.setValueAtTime(vel, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      src.connect(bpf);
      bpf.connect(gain);
      gain.connect(ac.destination);
      src.start(t);
      src.stop(t + 0.05);
    }
  } catch {
    // Silently ignore
  }
}
