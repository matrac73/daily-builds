// Video export: composite the WebGL map + a stats overlay on a 2D canvas and record it.

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** First container the browser can record, or null. */
export function pickMimeType(isTypeSupported) {
  return MIME_CANDIDATES.find((m) => isTypeSupported(m)) ?? null;
}

export function extensionFor(mimeType) {
  return mimeType?.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** Safe download file name from an activity title. */
export function videoFileName(title, mimeType) {
  const slug = String(title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `3d-strava-${slug || 'activite'}.${extensionFor(mimeType)}`;
}

/**
 * Records frames pushed with `capture()`. Call `capture()` from the map's
 * `render` event: the WebGL drawing buffer is still valid at that moment, so no
 * costly `preserveDrawingBuffer` is needed.
 */
export class VideoRecorder {
  /**
   * @param {HTMLCanvasElement} source WebGL canvas of the map
   * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} drawOverlay
   */
  constructor(source, drawOverlay) {
    this.mimeType = pickMimeType((m) => globalThis.MediaRecorder?.isTypeSupported(m));
    if (!this.mimeType) throw new Error("Ton navigateur ne permet pas l'enregistrement vidéo.");
    this.source = source;
    this.drawOverlay = drawOverlay;
    this.canvas = document.createElement('canvas');
    this.canvas.width = source.width & ~1; // even sizes keep H.264 encoders happy
    this.canvas.height = source.height & ~1;
    this.ctx = this.canvas.getContext('2d');
    this.chunks = [];
    const stream = this.canvas.captureStream(30);
    this.recorder = new MediaRecorder(stream, { mimeType: this.mimeType, videoBitsPerSecond: 12_000_000 });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
  }

  start() {
    this.capture();
    this.recorder.start(1000);
  }

  capture() {
    const { ctx, canvas } = this;
    ctx.drawImage(this.source, 0, 0, canvas.width, canvas.height);
    this.drawOverlay(ctx, canvas.width, canvas.height);
  }

  /** @returns {Promise<Blob>} */
  stop() {
    return new Promise((resolve) => {
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType }));
      this.recorder.stop();
    });
  }
}
