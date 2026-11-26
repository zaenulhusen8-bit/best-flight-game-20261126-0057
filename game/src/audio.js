// audio.js — all sound is synthesised in the browser with WebAudio: an engine
// drone whose pitch follows the throttle, wind noise that rises with airspeed,
// a chime when a ring is flown, and a thud on a hard touchdown. No audio files.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.started = false;
  }

  // Browsers need a user gesture before audio; call from the mission picker.
  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine: two detuned sawtooths through a low-pass filter.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 70;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 71.5;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(filter); osc2.connect(filter);
      filter.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start(); osc2.start();
      this.engineOsc2 = osc2;
      // Wind: looped filtered noise.
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;
      noise.connect(windFilter); windFilter.connect(this.windGain); this.windGain.connect(this.ctx.destination);
      noise.start();
      this.started = true;
    } catch (err) {
      // Audio is garnish: a browser that refuses it still flies.
      this.started = false;
    }
  }

  update(throttle, speedKnots) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + throttle * 95;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.02, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.02 + throttle * 0.05, t, 0.15);
    this.windGain.gain.setTargetAtTime(Math.min(0.09, Math.max(0, speedKnots - 40) * 0.0009), t, 0.2);
  }

  chime() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    for (const [freq, when] of [[880, 0], [1318.5, 0.09]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + when);
      g.gain.exponentialRampToValueAtTime(0.18, t + when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + when + 0.5);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t + when); osc.stop(t + when + 0.55);
    }
  }

  thud(hard) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(hard ? 0.5 : 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.3);
  }
}
