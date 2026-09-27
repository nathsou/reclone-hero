/**
 * WSOLA time stretching for practice mode: slows audio down without changing pitch.
 * Works on an excerpt so it stays fast (a 30 s excerpt takes a fraction of a second).
 */
export function stretchExcerpt(ctx: BaseAudioContext, buf: AudioBuffer, start: number, end: number, rate: number): AudioBuffer {
  const sr = buf.sampleRate;
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.min(buf.length, Math.ceil(end * sr));
  const inLen = Math.max(0, s1 - s0);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).subarray(s0, s1));
  if (rate === 1 || inLen < 4096) {
    const out = ctx.createBuffer(chans.length, Math.max(1, inLen), sr);
    chans.forEach((c, i) => out.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return out;
  }
  const N = 2048;
  const Hs = N / 2;
  const Ha = Hs * rate;
  const TOL = 512;
  const outLen = Math.floor(inLen / rate);
  const outs = chans.map(() => new Float32Array(outLen + N));
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const mono = new Float32Array(inLen);
  for (const c of chans) for (let i = 0; i < inLen; i++) mono[i] += c[i];

  const corr = (a: number, b: number, step: number) => {
    let s = 0;
    for (let i = 0; i < Hs; i += step) s += mono[a + i] * mono[b + i];
    return s;
  };

  let prev = 0;
  for (let k = 0; k * Hs < outLen; k++) {
    const outPos = k * Hs;
    const ideal = Math.round(k * Ha);
    let best = ideal;
    if (k > 0) {
      const natural = prev + Hs;
      if (natural + Hs < inLen) {
        const lo = Math.max(0, ideal - TOL);
        const hi = Math.min(inLen - N - 1, ideal + TOL);
        let bestC = -Infinity;
        for (let p = lo; p <= hi; p += 4) {
          const c = corr(p, natural, 4);
          if (c > bestC) {
            bestC = c;
            best = p;
          }
        }
        const center = best;
        for (let p = Math.max(lo, center - 4); p <= Math.min(hi, center + 4); p++) {
          const c = corr(p, natural, 1);
          if (c > bestC) {
            bestC = c;
            best = p;
          }
        }
      }
    }
    best = Math.max(0, Math.min(inLen - N, best));
    for (let c = 0; c < chans.length; c++) {
      const src = chans[c];
      const dst = outs[c];
      for (let i = 0; i < N && best + i < inLen; i++) dst[outPos + i] += src[best + i] * win[i];
    }
    prev = best;
  }
  const out = ctx.createBuffer(chans.length, outLen, sr);
  outs.forEach((o, i) => out.copyToChannel(o.subarray(0, outLen) as Float32Array<ArrayBuffer>, i));
  return out;
}
