import type { Frame } from '../vision/canvas';

export interface Grab { frame: Frame; done(): void }

/** Why a capture failed, in words the person can act on. */
export type CaptureError = 'unsupported' | 'cancelled' | 'blocked-by-system' | 'failed';

export class CaptureFailed extends Error {
  constructor(readonly kind: CaptureError, readonly detail: string) { super(detail); }
}

/**
 * A screen or window share. Every frame the share delivers is read and the newest kept: a still
 * screen sends no new frames, so waiting for "the next frame" could wait forever.
 */
export class ScreenCapture {
  stream: MediaStream | null = null;
  track: MediaStreamTrack | null = null;
  framesIn = 0;
  latestAt = 0;
  private latest: VideoFrame | null = null;
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private imageCapture: { grabFrame(): Promise<ImageBitmap> } | null = null;
  private video: HTMLVideoElement | null = null;

  get active(): boolean { return !!this.stream; }

  async start(onEnded: () => void): Promise<void> {
    let framed = false;
    try { framed = window.top !== window.self; } catch { framed = true; }
    if (framed || !window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) throw new CaptureFailed('unsupported', '');
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 4096 }, height: { ideal: 4096 }, frameRate: { ideal: 5, max: 10 } },
        audio: false,
        // @ts-expect-error: Chrome's option to leave this tab out of the picker
        selfBrowserSurface: 'exclude',
      });
    } catch (e) {
      this.stream = null;
      const name = (e as Error)?.name || 'Error', msg = (e as Error)?.message || '';
      const detail = `${name}${msg ? `: ${msg}` : ''}`;
      if (/policy|not allowed in this document|disallowed/i.test(msg)) throw new CaptureFailed('unsupported', detail);
      if (/by system/i.test(msg) || name === 'NotReadableError' || name === 'AbortError') throw new CaptureFailed('blocked-by-system', detail);
      if (name === 'NotAllowedError') throw new CaptureFailed('cancelled', detail);
      throw new CaptureFailed('failed', detail);
    }
    const track = this.stream.getVideoTracks()[0]!;
    this.track = track;
    track.addEventListener('ended', onEnded);
    this.startReader(track);
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
    this.imageCapture = IC ? new IC(track) : null;
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.srcObject = this.stream;
    v.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:0;bottom:0';
    document.body.appendChild(v);
    this.video = v;
    try { await v.play(); } catch { /* frames still arrive through the reader */ }
  }

  private startReader(track: MediaStreamTrack): void {
    this.framesIn = 0;
    const MSTP = (window as unknown as { MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } }).MediaStreamTrackProcessor;
    if (!MSTP) return;
    try {
      const reader = new MSTP({ track }).readable.getReader();
      this.reader = reader;
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            this.latest?.close();
            this.latest = value;
            this.latestAt = Date.now();
            this.framesIn++;
          }
        } catch (e) { console.warn('frame reader stopped', e); }
      })();
    } catch (e) { console.warn('no frame reader', e); }
  }

  /** The newest frame. Call `done()` when finished with it. */
  async grab(): Promise<Grab | null> {
    if (this.latest) {
      try { const f = this.latest.clone(); return { frame: f, done: () => f.close() }; } catch { /* just replaced */ }
    }
    if (this.imageCapture) {
      try {
        const b = await Promise.race([
          this.imageCapture.grabFrame(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
        ]);
        this.framesIn++;
        return { frame: b, done: () => b.close() };
      } catch { /* fall through */ }
    }
    const v = this.video;
    if (v && v.readyState >= 2 && v.videoWidth) return { frame: v, done: () => {} };
    return null;
  }

  /** Waits up to a few seconds for a first frame. */
  async grabSoon(): Promise<Grab | null> {
    for (let i = 0; i < 12; i++) {
      const g = await this.grab();
      if (g) return g;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  sharingWholeScreen(): boolean {
    try { return (this.track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface === 'monitor'; } catch { return false; }
  }

  describe(): { surface: string; size: string } {
    try {
      const st = this.track?.getSettings() as (MediaTrackSettings & { displaySurface?: string }) | undefined;
      return { surface: st?.displaySurface ?? '?', size: `${st?.width ?? '?'}×${st?.height ?? '?'}` };
    } catch { return { surface: '?', size: '?' }; }
  }

  stop(): void {
    try { void this.reader?.cancel(); } catch { /* closed */ }
    this.reader = null;
    try { this.latest?.close(); } catch { /* closed */ }
    this.latest = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video?.remove();
    this.stream = this.track = null;
    this.imageCapture = null;
    this.video = null;
  }
}
