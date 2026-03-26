import { AssetId } from "../assets/assetIds";
import { assetRegistry, resolvePublicAssetUrl } from "../assets/assetRegistry";

export type AudioManagerOptions = {
  /**
   * Optional element to attach an unlock listener to. If omitted, unlock can be
   * triggered by calling unlock() manually.
   */
  unlockElement?: HTMLElement;
  initialVolume?: number;
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly unlockElement?: HTMLElement;
  private readonly initialVolume: number;

  constructor(opts: AudioManagerOptions = {}) {
    this.unlockElement = opts.unlockElement;
    this.initialVolume = opts.initialVolume ?? 0.8;

    if (this.unlockElement) {
      const tryUnlock = () => void this.unlock();
      // Use pointerdown so it works on mobile.
      this.unlockElement.addEventListener("pointerdown", tryUnlock, { passive: true });
    }
  }

  isUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.initialVolume;
      this.master.connect(this.ctx.destination);
    }

    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
  }

  setMasterVolume(v: number) {
    if (!this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  async playSfx(assetId: AssetId): Promise<void> {
    if (!this.ctx || !this.master) return;

    const entry = assetRegistry[assetId];
    if (!entry || entry.kind !== "audio") {
      throw new Error(`Asset is not audio: ${assetId}`);
    }

    const chosenPath = pickSupportedAudioPath(entry.mp3Path, entry.oggPath);
    const url = resolvePublicAssetUrl(chosenPath);
    const buffer = await this.getOrLoadBuffer(url);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master);
    src.start(0);
  }

  async playBgm(assetId: AssetId, volume = 0.35): Promise<void> {
    if (!this.ctx || !this.master) return;

    this.stopBgm();

    const entry = assetRegistry[assetId];
    if (!entry || entry.kind !== "audio") {
      throw new Error(`Asset is not audio: ${assetId}`);
    }

    const chosenPath = pickSupportedAudioPath(entry.mp3Path, entry.oggPath);
    const url = resolvePublicAssetUrl(chosenPath);
    const buffer = await this.getOrLoadBuffer(url);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = volume;
    this.bgmGain.connect(this.master);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.bgmGain);
    src.start(0);
    this.bgmSource = src;
  }

  stopBgm(): void {
    if (this.bgmSource) {
      try { this.bgmSource.stop(); } catch { /* already stopped */ }
      this.bgmSource.disconnect();
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
  }

  private async getOrLoadBuffer(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    if (!this.ctx) throw new Error("Audio not initialized");

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch audio: ${url} (${res.status})`);
    }
    const data = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.buffers.set(url, buffer);
    return buffer;
  }
}

function pickSupportedAudioPath(mp3Path: string, oggPath?: string): string {
  // iOS Safari: mp3 is the safe bet, ogg often unsupported.
  // We still feature-detect so this works across browsers.
  const a = document.createElement("audio");

  if (oggPath) {
    const canOgg = a.canPlayType('audio/ogg; codecs="vorbis"');
    if (canOgg === "probably" || canOgg === "maybe") {
      return oggPath;
    }
  }

  return mp3Path;
}



