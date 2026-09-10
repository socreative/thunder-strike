import type * as THREE from "three/webgpu";

export type Sfx =
  | "gun"
  | "hydra"
  | "hellfire"
  | "cannon"
  | "aa"
  | "rifle"
  | "samLaunch"
  | "explosion"
  | "explosionSmall"
  | "hit"
  | "pickup"
  | "board"
  | "rescue"
  | "winch"
  | "empty"
  | "objective"
  | "message"
  | "crash"
  | "victory"
  | "select"
  | "flare"
  | "missileAlert";

/**
 * Fully synthesised sound: no audio files. Distant enemy sounds are attenuated
 * by distance to the listener (the helicopter).
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private rotorGain!: GainNode;
  private rotorLfo!: OscillatorNode;
  private rotorHum!: OscillatorNode;
  /** Synth bed and recorded loop each feed rotorGain through their own fader. */
  private rotorSynthMix!: GainNode;
  private rotorSampleMix!: GainNode;
  private rotorSample: AudioBufferSourceNode | null = null;
  private noiseBuffer!: AudioBuffer;
  private listener: THREE.Vector3 | null = null;
  private lastPlay = new Map<Sfx, number>();
  volume = 0.7;
  muted = false;
  musicVolume = 0.55;
  private rotorOn = false;
  private musicGain!: GainNode;
  private musicDuck!: GainNode;
  private musicBuffers = new Map<string, AudioBuffer>();
  private musicLoading = new Map<string, Promise<AudioBuffer | null>>();
  private musicCurrent: string | null = null;
  private musicWanted: string | null = null;
  private musicVoices: { src: AudioBufferSourceNode; gain: GainNode; endsAt: number; track: string }[] = [];
  private musicNextAt = 0;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    // Music bus: level control, then a duck stage the game pulls down under heavy action.
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicGain.connect(this.musicDuck).connect(this.master);
    if (this.musicWanted) this.playMusic(this.musicWanted);

    // White noise buffer reused by everything percussive.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildRotor();
  }

  private buildRotor(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 160;
    bp.Q.value = 0.9;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    this.rotorLfo = ctx.createOscillator();
    this.rotorLfo.type = "triangle";
    this.rotorLfo.frequency.value = 13;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    this.rotorLfo.connect(lfoDepth).connect(chop.gain);
    this.rotorHum = ctx.createOscillator();
    this.rotorHum.type = "sawtooth";
    this.rotorHum.frequency.value = 52;
    const humLp = ctx.createBiquadFilter();
    humLp.type = "lowpass";
    humLp.frequency.value = 220;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.25;
    this.rotorGain = ctx.createGain();
    this.rotorGain.gain.value = 0;
    this.rotorSynthMix = ctx.createGain();
    this.rotorSynthMix.gain.value = 1;
    this.rotorSampleMix = ctx.createGain();
    this.rotorSampleMix.gain.value = 0;
    src.connect(bp).connect(chop).connect(this.rotorSynthMix);
    this.rotorHum.connect(humLp).connect(humGain).connect(this.rotorSynthMix);
    this.rotorSynthMix.connect(this.rotorGain);
    this.rotorSampleMix.connect(this.rotorGain);
    this.rotorGain.connect(this.master);
    src.start();
    this.rotorLfo.start();
    this.rotorHum.start();
    void this.loadRotorSample();
  }

  /**
   * A recorded rotor loop takes over from the synth bed once it has decoded.
   * The synth keeps running underneath at zero gain so a failed fetch just
   * leaves the original sound in place.
   */
  private async loadRotorSample(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const probe = document.createElement("audio");
    const ext = probe.canPlayType('audio/webm; codecs="opus"') ? "webm" : "mp3";
    try {
      const res = await fetch(`/sfx/rotor.${ext}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      if (this.ctx !== ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.rotorSampleMix);
      src.start();
      this.rotorSample = src;
      const t = ctx.currentTime;
      this.rotorSampleMix.gain.setTargetAtTime(1, t, 0.4);
      this.rotorSynthMix.gain.setTargetAtTime(0, t, 0.4);
    } catch (err) {
      console.warn("[audio] rotor sample unavailable, keeping the synth", err);
    }
  }

  setListener(pos: THREE.Vector3): void {
    this.listener = pos;
  }

  /** throttle 0..1, on false silences the rotor (menus, death). */
  setRotor(on: boolean, throttle: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.3 + throttle * 0.15 : 0;
    if (on !== this.rotorOn) {
      this.rotorGain.gain.cancelScheduledValues(t);
      this.rotorGain.gain.setTargetAtTime(target, t, on ? 0.6 : 0.25);
      this.rotorOn = on;
    } else if (on) {
      this.rotorGain.gain.setTargetAtTime(target, t, 0.3);
    }
    this.rotorLfo.frequency.setTargetAtTime(12.5 + throttle * 4, t, 0.4);
    this.rotorHum.frequency.setTargetAtTime(50 + throttle * 10, t, 0.4);
    // The recording spins up with the throttle: a little faster and higher under power.
    this.rotorSample?.playbackRate.setTargetAtTime(0.9 + throttle * 0.22, t, 0.5);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  play(name: Sfx, at?: THREE.Vector3): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    // Rate limit rapid repeats so bursts do not stack into clipping.
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    const minGap = name === "gun" ? 0.04 : name === "aa" || name === "rifle" ? 0.05 : name === "missileAlert" ? 0.2 : 0.03;
    if (now - last < minGap) return;
    this.lastPlay.set(name, now);

    let gain = 1;
    if (at && this.listener) {
      const d = at.distanceTo(this.listener);
      gain = Math.max(0, 1 - d / 220);
      if (gain <= 0.01) return;
      gain *= gain;
    }
    switch (name) {
      case "gun":
        this.noiseBurst(0.07, 1800, "highpass", 0.5 * gain, 0.002);
        this.tone("square", 180, 90, 0.05, 0.12 * gain);
        break;
      case "aa":
        this.noiseBurst(0.09, 900, "bandpass", 0.35 * gain, 0.004);
        this.tone("square", 140, 60, 0.07, 0.1 * gain);
        break;
      case "rifle":
        this.noiseBurst(0.05, 2400, "highpass", 0.2 * gain, 0.002);
        break;
      case "cannon":
        this.noiseBurst(0.35, 400, "lowpass", 0.6 * gain, 0.01);
        this.tone("sine", 90, 35, 0.3, 0.4 * gain);
        break;
      case "hydra":
        this.sweepNoise(0.6, 1400, 300, 0.4 * gain);
        break;
      case "hellfire":
        this.sweepNoise(1.2, 900, 200, 0.5 * gain);
        this.tone("sawtooth", 220, 90, 0.9, 0.12 * gain);
        break;
      case "samLaunch":
        this.sweepNoise(1.4, 700, 2200, 0.6 * gain);
        this.tone("sawtooth", 160, 420, 1.2, 0.14 * gain);
        this.noiseBurst(0.5, 900, "lowpass", 0.5 * gain, 0.004, 200);
        break;
      case "explosion":
        this.noiseBurst(1.4, 1600, "lowpass", 0.9 * gain, 0.02, 90);
        this.tone("sine", 70, 28, 0.9, 0.6 * gain);
        break;
      case "explosionSmall":
        this.noiseBurst(0.6, 1800, "lowpass", 0.55 * gain, 0.01, 150);
        this.tone("sine", 110, 40, 0.4, 0.35 * gain);
        break;
      case "crash":
        this.noiseBurst(2.2, 1200, "lowpass", 1.0, 0.03, 60);
        this.tone("sine", 60, 20, 1.6, 0.7);
        break;
      case "hit":
        this.noiseBurst(0.08, 3000, "bandpass", 0.35, 0.002);
        this.tone("square", 600, 300, 0.05, 0.08);
        break;
      case "pickup":
        this.tone("sine", 660, 660, 0.09, 0.25);
        setTimeout(() => this.tone("sine", 990, 990, 0.14, 0.25), 90);
        break;
      case "board":
        this.tone("triangle", 520, 520, 0.08, 0.2);
        setTimeout(() => this.tone("triangle", 780, 780, 0.12, 0.2), 80);
        break;
      case "rescue":
        this.tone("triangle", 523, 523, 0.1, 0.22);
        setTimeout(() => this.tone("triangle", 659, 659, 0.1, 0.22), 100);
        setTimeout(() => this.tone("triangle", 784, 784, 0.18, 0.22), 200);
        break;
      case "winch":
        this.tone("square", 240, 240, 0.05, 0.08);
        break;
      case "empty":
        this.tone("square", 220, 200, 0.04, 0.1);
        break;
      case "objective":
        [0, 120, 240, 360].forEach((d, i) => setTimeout(() => this.tone("triangle", [523, 659, 784, 1046][i], [523, 659, 784, 1046][i], 0.16, 0.24), d));
        break;
      case "victory":
        [0, 150, 300, 450, 600, 900].forEach((d, i) => setTimeout(() => this.tone("triangle", [392, 523, 659, 784, 1046, 1318][i], [392, 523, 659, 784, 1046, 1318][i], 0.3, 0.25), d));
        break;
      case "message":
        this.tone("sine", 1200, 1200, 0.03, 0.06);
        setTimeout(() => this.tone("sine", 1500, 1500, 0.03, 0.06), 45);
        break;
      case "select":
        this.tone("square", 880, 880, 0.03, 0.08);
        break;
      case "flare":
        this.noiseBurst(0.25, 2600, "highpass", 0.45, 0.003);
        this.tone("triangle", 900, 300, 0.2, 0.15);
        break;
      case "missileAlert":
        this.alarm(0.5, 0.5);
        break;
    }
  }

  /**
   * Missile launch warning modelled on a cockpit radar warning receiver: a
   * clean two-tone warble that steps between a low and a high pitch about
   * fourteen times a second, with an octave-down body under it and a soft
   * gate at each step so the notes articulate. The steady cadence from the
   * world makes it read as a continuous "deedle-deedle" while a missile is
   * tracking.
   */
  private alarm(duration: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const step = 0.07;
    const low = 1180;
    const high = 1580;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(gain, t + 0.008);
    out.gain.setValueAtTime(gain, t + duration - 0.05);
    out.gain.exponentialRampToValueAtTime(0.001, t + duration);
    out.connect(this.sfx);

    // Gentle bandpass: keeps it bright on phone speakers without harshness.
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.5;
    bp.connect(out);

    // Articulation: a shallow dip at every pitch step.
    const gate = ctx.createGain();
    gate.gain.value = 1;
    gate.connect(bp);
    const steps = Math.floor(duration / step);
    for (let i = 0; i <= steps; i++) {
      const at = t + i * step;
      gate.gain.setValueAtTime(0.35, at);
      gate.gain.linearRampToValueAtTime(1, at + 0.018);
    }

    // Lead tone and its octave-down body.
    const lead = ctx.createOscillator();
    lead.type = "triangle";
    const body = ctx.createOscillator();
    body.type = "sine";
    for (let i = 0; i <= steps; i++) {
      const f = i % 2 === 0 ? low : high;
      lead.frequency.setValueAtTime(f, t + i * step);
      body.frequency.setValueAtTime(f / 2, t + i * step);
    }
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0.7;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.35;
    lead.connect(leadGain).connect(gate);
    body.connect(bodyGain).connect(gate);
    lead.start(t);
    body.start(t);
    lead.stop(t + duration + 0.05);
    body.stop(t + duration + 0.05);
  }

  private noiseBurst(duration: number, cutoff: number, type: BiquadFilterType, gain: number, attack: number, sweepTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + duration);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5, duration + 0.05);
  }

  private sweepNoise(duration: number, from: number, to: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5, duration + 0.05);
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  /* Music */

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** 1 = full music, lower values duck it (used during combat or menus). */
  setMusicDuck(level: number, time = 0.6): void {
    if (!this.ctx) return;
    this.musicDuck.gain.setTargetAtTime(level, this.ctx.currentTime, time);
  }

  private async loadMusic(track: string): Promise<AudioBuffer | null> {
    const cached = this.musicBuffers.get(track);
    if (cached) return cached;
    let pending = this.musicLoading.get(track);
    if (!pending) {
      pending = (async () => {
        const ctx = this.ctx;
        if (!ctx) return null;
        const probe = document.createElement("audio");
        const ext = probe.canPlayType('audio/webm; codecs="opus"') ? "webm" : "mp3";
        try {
          const res = await fetch(`/music/${track}.${ext}`);
          if (!res.ok) throw new Error(`${res.status}`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.musicBuffers.set(track, buf);
          return buf;
        } catch (err) {
          console.warn(`[audio] music "${track}" unavailable`, err);
          return null;
        }
      })();
      this.musicLoading.set(track, pending);
    }
    return pending;
  }

  /**
   * Start a looping track, crossfading from whatever is playing. Tracks loop
   * with a short overlap so the join is seamless even if the file has a tail.
   */
  playMusic(track: string | null): void {
    this.musicWanted = track;
    if (!this.ctx) return;
    if (track === this.musicCurrent) return;
    const ctx = this.ctx;
    // Fade out current voices.
    for (const v of this.musicVoices) {
      v.gain.gain.cancelScheduledValues(ctx.currentTime);
      v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      v.src.stop(ctx.currentTime + 2.5);
    }
    this.musicVoices = [];
    this.musicCurrent = track;
    if (!track) return;
    void this.loadMusic(track).then((buf) => {
      if (!buf || this.musicCurrent !== track || !this.ctx) return;
      this.startVoice(track, buf, this.ctx.currentTime + 0.05, 1.2);
    });
  }

  private loopLength(track: string, buf: AudioBuffer): number {
    // Known trailing silence per track; default trims nothing.
    // Loop points sit on a bar line just before each track's tail begins.
    const trims: Record<string, number> = { "iron-sector-run": 57.17, "jungle-advance": 86.66 };
    return Math.min(buf.duration, trims[track] ?? buf.duration);
  }

  private startVoice(track: string, buf: AudioBuffer, at: number, fadeIn: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + fadeIn);
    src.connect(gain).connect(this.musicGain);
    const len = this.loopLength(track, buf);
    const xfade = 0.35;
    src.start(at, 0, len + 0.05);
    gain.gain.setValueAtTime(1, at + len - xfade);
    gain.gain.linearRampToValueAtTime(0, at + len);
    this.musicVoices.push({ src, gain, endsAt: at + len, track });
    this.musicNextAt = at + len - xfade;
  }

  /** Call every frame: schedules the next loop iteration a little ahead of time. */
  updateMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicCurrent) return;
    const buf = this.musicBuffers.get(this.musicCurrent);
    if (!buf || this.musicVoices.length === 0) return;
    const now = ctx.currentTime;
    if (this.musicNextAt - now < 0.25) {
      this.startVoice(this.musicCurrent, buf, this.musicNextAt, 0.35);
    }
    this.musicVoices = this.musicVoices.filter((v) => v.endsAt > now - 0.1);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
