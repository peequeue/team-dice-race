// Tiny chiptune bleeps. Muted by default (open plan office).
let ctx = null;
let muted = true;
try { muted = localStorage.getItem('tdr-sound') !== 'on'; } catch { /* storage unavailable */ }

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('tdr-sound', m ? 'off' : 'on'); } catch { /* ignore */ }
}

const SOUNDS = {
  step: [[660, 0.04]],
  slide: [[330, 0.03]],
  dice: [[200, 0.03], [260, 0.03], [220, 0.03]],
  coin: [[988, 0.06], [1319, 0.12]],
  powerup: [[523, 0.06], [659, 0.06], [784, 0.06], [1047, 0.12]],
  trap: [[300, 0.08], [200, 0.08], [120, 0.2]],
  hell: [[150, 0.15], [110, 0.15], [80, 0.35]],
  win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.1], [784, 0.1], [1047, 0.3]],
};

export function sfx(name) {
  if (muted) return;
  try {
    ctx = ctx ?? new AudioContext();
    let t = ctx.currentTime;
    for (const [freq, dur] of SOUNDS[name] ?? []) {
      const o = ctx.createOscillator();
      const gain = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(gain).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur);
      t += dur;
    }
  } catch { /* audio unavailable */ }
}
