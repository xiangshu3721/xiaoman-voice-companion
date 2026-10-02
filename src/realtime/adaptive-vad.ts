export type VadUpdate = { active: boolean; rms: number; noiseFloor: number; threshold: number };

export class AdaptiveVadMonitor {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private startedAt = 0;
  private noiseFloor = 0.01;
  private onUpdate: ((update: VadUpdate) => void) | null = null;
  async start(stream: MediaStream, onUpdate: (update: VadUpdate) => void) {
    this.stop();
    const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return null;
    this.context = new Constructor();
    await this.context.resume().catch(() => undefined);
    this.source = this.context.createMediaStreamSource(stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    this.source.connect(this.analyser);
    this.onUpdate = onUpdate;
    this.startedAt = Date.now();
    const data = new Uint8Array(this.analyser.fftSize);
    const sample = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) { const centered = (value - 128) / 128; sum += centered * centered; }
      const rms = Math.sqrt(sum / data.length);
      if (Date.now() - this.startedAt < 650) this.noiseFloor = this.noiseFloor * 0.85 + rms * 0.15;
      const threshold = Math.max(0.018, this.noiseFloor * 2.2 + 0.008);
      this.onUpdate?.({ active: rms > threshold, rms, noiseFloor: this.noiseFloor, threshold });
      this.timer = window.setTimeout(sample, 60);
    };
    sample();
    return this.context;
  }
  stop() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.onUpdate = null;
  }
}
