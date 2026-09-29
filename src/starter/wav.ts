/** 16-bit stereo PCM WAV, written a block at a time. */
export class WavWriter {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private pos = 44;

  constructor(frames: number, sampleRate: number) {
    const dataLen = frames * 4;
    this.bytes = new Uint8Array(44 + dataLen);
    const v = (this.view = new DataView(this.bytes.buffer));
    const str = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) this.bytes[o + i] = s.charCodeAt(i);
    };
    str(0, 'RIFF');
    v.setUint32(4, 36 + dataLen, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, dataLen, true);
  }

  write(l: Float32Array, r: Float32Array, n: number, gain = 1): void {
    const v = this.view;
    let p = this.pos;
    const end = this.bytes.length;
    for (let i = 0; i < n && p < end; i++) {
      v.setInt16(p, Math.max(-32767, Math.min(32767, Math.round(l[i] * gain * 32767))), true);
      v.setInt16(p + 2, Math.max(-32767, Math.min(32767, Math.round(r[i] * gain * 32767))), true);
      p += 4;
    }
    this.pos = p;
  }
}
