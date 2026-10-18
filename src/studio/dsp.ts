/** In-place radix-2 FFT. Reused buffers keep full-song analysis bounded. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const r = re[i]; re[i] = re[j]; re[j] = r; }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const vr = re[b] * ur - im[b] * ui, vi = re[b] * ui + im[b] * ur;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
}
