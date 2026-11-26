// audio.js — synthesized sound only, no audio files: a two-oscillator
// engine hum whose pitch and volume follow the throttle, plus filtered
// wind noise that rises with airspeed. Starts on the first user gesture,
// as browsers require.

export function createEngineAudio() {
  let ctx = null;
  let engineGain, windGain, oscA, oscB, started = false;

  function start() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return; // no audio available: the game plays silently
    }
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 58;
    oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 29;
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.5;
    oscA.connect(engineFilter);
    oscB.connect(oscBGain);
    oscBGain.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    oscA.start();
    oscB.start();

    // Wind: looped white noise through a bandpass.
    const len = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    noise.start();
  }

  function update(throttle, speed, crashed) {
    if (!ctx || !engineGain) return;
    const t = ctx.currentTime;
    const rpm = crashed ? 0 : throttle;
    oscA.frequency.setTargetAtTime(52 + rpm * 78, t, 0.08);
    oscB.frequency.setTargetAtTime(26 + rpm * 39, t, 0.08);
    engineGain.gain.setTargetAtTime(0.015 + rpm * 0.075, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.11, speed / 900), t, 0.15);
  }

  return { start, update };
}
