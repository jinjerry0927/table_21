import type { UserSettings } from './storage';

type SoundName = 'card' | 'chip' | 'button' | 'win' | 'lose' | 'insurance' | 'shuffle';

export class TableAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambience: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private settings: UserSettings;

  constructor(settings: UserSettings) {
    this.settings = settings;
  }

  async enable(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.effects = this.context.createGain();
      this.ambience = this.context.createGain();
      this.effects.connect(this.master);
      this.ambience.connect(this.master);
      this.master.connect(this.context.destination);
      this.applySettings(this.settings);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.ensureAmbience();
  }

  applySettings(settings: UserSettings): void {
    this.settings = settings;
    if (!this.context || !this.master || !this.effects || !this.ambience) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.masterVolume, now, 0.03);
    this.effects.gain.setTargetAtTime(settings.effectsVolume, now, 0.03);
    this.ambience.gain.setTargetAtTime(settings.ambienceVolume * 0.16, now, 0.08);
    this.ensureAmbience();
  }

  play(name: SoundName): void {
    if (!this.context || !this.effects || this.context.state !== 'running') return;
    const profile: Record<SoundName, [number, number, OscillatorType]> = {
      card: [520, 0.055, 'triangle'],
      chip: [760, 0.08, 'sine'],
      button: [360, 0.04, 'triangle'],
      win: [660, 0.2, 'sine'],
      lose: [170, 0.18, 'sawtooth'],
      insurance: [480, 0.12, 'sine'],
      shuffle: [230, 0.22, 'triangle'],
    };
    const [frequency, duration, type] = profile[name];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(90, frequency * 0.72), this.context.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, this.context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.effects);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration + 0.01);
  }

  private ensureAmbience(): void {
    if (!this.context || !this.ambience || this.ambienceSource || this.settings.ambienceVolume === 0) return;
    const frameCount = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) channel[index] = (Math.random() * 2 - 1) * 0.12;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    source.buffer = buffer;
    source.loop = true;
    source.connect(filter);
    filter.connect(this.ambience);
    source.start();
    this.ambienceSource = source;
  }
}
