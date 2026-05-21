/**
 * Cyber Acoustic — procedurally synthesized ambient soundscapes.
 *
 * No audio files. Just Web Audio: pink noise + biquad lowpass at different
 * cutoffs gives surprisingly evocative textures:
 *   - rain    : crisp pink noise, lowpass 2.5kHz, light resonance
 *   - server  : deep pink noise rumble, lowpass 380Hz, mid Q
 *   - wind    : breathy pink noise, lowpass 800Hz, slow LFO swell
 *   - tape    : warmer pink noise, lowpass 1.4kHz + slight notch
 */

export type Preset = "off" | "rain" | "server" | "wind" | "tape";

const STORAGE_KEY = "cyber-audio:v1";

interface Settings {
  preset: Preset;
  volume: number; // 0..1
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { preset: "off", volume: 0.35, ...JSON.parse(raw) };
  } catch {}
  return { preset: "off", volume: 0.35 };
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

function makePinkBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Paul Kellet's refined pink-noise filter
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private settings: Settings = loadSettings();
  private listeners = new Set<(s: Settings) => void>();

  getSettings(): Settings {
    return { ...this.settings };
  }

  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn({ ...this.settings }));
  }

  private ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
  }

  private teardownChain() {
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source.disconnect();
      this.source = null;
    }
    if (this.filter) {
      this.filter.disconnect();
      this.filter = null;
    }
    if (this.lfo) {
      try { this.lfo.stop(); } catch {}
      this.lfo.disconnect();
      this.lfo = null;
    }
    if (this.lfoGain) {
      this.lfoGain.disconnect();
      this.lfoGain = null;
    }
  }

  setVolume(v: number) {
    this.settings.volume = Math.max(0, Math.min(1, v));
    saveSettings(this.settings);
    if (this.master && this.ctx && this.settings.preset !== "off") {
      this.master.gain.linearRampToValueAtTime(
        this.settings.volume,
        this.ctx.currentTime + 0.08,
      );
    }
    this.emit();
  }

  async setPreset(preset: Preset) {
    this.settings.preset = preset;
    saveSettings(this.settings);
    this.emit();

    if (preset === "off") {
      if (this.master && this.ctx) {
        this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.25);
      }
      // Stop sources after fade
      setTimeout(() => this.teardownChain(), 300);
      return;
    }

    this.ensureCtx();
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch {}
    }

    this.teardownChain();

    const buf = makePinkBuffer(this.ctx);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";

    switch (preset) {
      case "rain":
        filter.frequency.value = 2500;
        filter.Q.value = 0.5;
        break;
      case "server":
        filter.frequency.value = 380;
        filter.Q.value = 1.4;
        break;
      case "wind":
        filter.frequency.value = 820;
        filter.Q.value = 0.7;
        break;
      case "tape":
        filter.frequency.value = 1400;
        filter.Q.value = 0.4;
        break;
    }

    // Subtle LFO on cutoff for liveliness (wind sways, server pulses)
    const lfoFreq = preset === "wind" ? 0.08 : preset === "server" ? 0.25 : 0.18;
    const lfoDepth = preset === "wind" ? 220 : preset === "server" ? 30 : 60;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = lfoFreq;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = lfoDepth;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    src.connect(filter).connect(this.master);
    src.start();

    this.source = src;
    this.filter = filter;
    this.lfo = lfo;
    this.lfoGain = lfoGain;

    // Fade in
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(
      this.settings.volume,
      this.ctx.currentTime + 0.5,
    );
  }
}

export const ambientAudio = new AmbientAudio();

export const PRESETS: { key: Preset; label: string }[] = [
  { key: "off", label: "off" },
  { key: "rain", label: "rain · neo-tokyo" },
  { key: "server", label: "server room" },
  { key: "wind", label: "cyber wind" },
  { key: "tape", label: "tape hiss" },
];
