import { audioEngine } from './engine';

export interface ScheduledClip {
  id: string;
  assetId: string;
  trackId: string;
  startBeat: number;
  lengthBeats: number;
  loop: boolean;
  offsetSeconds?: number;
}

/** Reserved for future event queue. */
export interface ScheduleEvent {
  time: number;
  type: 'start' | 'stop';
  clipId: string;
  sourceNode?: AudioBufferSourceNode;
}

export class TransportScheduler {
  private ctx: AudioContext | null = null;
  private running = false;
  private startTime = 0;
  private beatOffset = 0;
  private bpm = 128;
  private lookaheadSeconds = 0.1;
  private scheduleAheadSeconds = 0.3;
  private nextNoteTime = 0;
  private clips: ScheduledClip[] = [];
  private activeSources = new Map<string, AudioBufferSourceNode[]>();
  private rafId = 0;
  private scheduledEvents = new Set<string>();

  private beatToSeconds(beats: number) {
    return (beats / this.bpm) * 60;
  }

  get currentBeat() {
    if (!this.running || !this.ctx) return this.beatOffset;
    const elapsed = this.ctx.currentTime - this.startTime;
    return this.beatOffset + (elapsed / 60) * this.bpm;
  }

  setClips(next: ScheduledClip[]) {
    this.clips = next;
  }

  start(bpm: number, beatOffset = 0) {
    if (this.running) return;
    this.ctx = audioEngine.ctx;
    if (!this.ctx) return;
    this.bpm = bpm;
    this.beatOffset = beatOffset;
    this.startTime = this.ctx.currentTime;
    this.running = true;
    this.nextNoteTime = this.ctx.currentTime;
    this.scheduledEvents.clear();
    this.rafId = requestAnimationFrame(() => this.schedulerLoop());
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    for (const sources of this.activeSources.values()) {
      for (const src of sources) {
        try { src.stop(); } catch { /* already stopped */ }
      }
    }
    this.activeSources.clear();
    this.scheduledEvents.clear();
  }

  updateBpm(bpm: number) {
    if (!this.running || !this.ctx) return;
    const oldBpm = this.bpm;
    this.bpm = bpm;
    const now = this.ctx.currentTime;
    const elapsedBeats = ((now - this.startTime) / 60) * oldBpm;
    this.beatOffset += elapsedBeats;
    this.startTime = now;
    this.nextNoteTime = now;
  }

  registerSource(clipId: string, node: AudioBufferSourceNode) {
    const list = this.activeSources.get(clipId);
    if (list) {
      list.push(node);
    } else {
      this.activeSources.set(clipId, [node]);
    }
  }

  private schedulerLoop() {
    if (!this.running || !this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.nextNoteTime < now + this.scheduleAheadSeconds) {
      this.scheduleBeat(this.nextNoteTime);
      this.nextNoteTime += this.lookaheadSeconds;
    }
    if (!this.running) return;
    this.rafId = requestAnimationFrame(() => this.schedulerLoop());
  }

  private scheduleBeat(time: number) {
    const beat = this.beatOffset + ((time - this.startTime) / 60) * this.bpm;
    const windowStart = beat;
    const windowEnd = beat + ((this.lookaheadSeconds + this.scheduleAheadSeconds) / 60) * this.bpm;

    for (const clip of this.clips) {
      const clipEnd = clip.startBeat + clip.lengthBeats;
      const startsInWindow = clip.startBeat >= windowStart && clip.startBeat < windowEnd;
      const endsInWindow = clipEnd >= windowStart && clipEnd < windowEnd;

      if (startsInWindow && !this.scheduledEvents.has(`start:${clip.id}`)) {
        this.scheduledEvents.add(`start:${clip.id}`);
        this.emitStart(clip, this.startTime + this.beatToSeconds(clip.startBeat - this.beatOffset));
      }
      if (endsInWindow && !clip.loop && !this.scheduledEvents.has(`stop:${clip.id}`)) {
        this.scheduledEvents.add(`stop:${clip.id}`);
        this.emitStop(clip, this.startTime + this.beatToSeconds(clipEnd - this.beatOffset));
      }
    }
  }

  private emitStart(clip: ScheduledClip, when: number) {
    const clamped = this.ctx ? Math.max(when, this.ctx.currentTime + 0.005) : when;
    this.onStartClip?.(clip, clamped);
  }

  private emitStop(clip: ScheduledClip, when: number) {
    const clamped = this.ctx ? Math.max(when, this.ctx.currentTime + 0.005) : when;
    this.onStopClip?.(clip, clamped);
  }

  onStartClip?: (clip: ScheduledClip, when: number) => void;
  onStopClip?: (clip: ScheduledClip, when: number) => void;
}

export const transportScheduler = new TransportScheduler();
