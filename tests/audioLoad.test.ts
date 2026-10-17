import { test } from 'node:test';
import assert from 'node:assert/strict';
import { install } from './bench/mocks.ts';
install();
const { AudioEngine } = await import('../src/audio/audio.ts');

function buffer(channels: number[][], sampleRate = 48000): AudioBuffer {
  const data = channels.map(c => new Float32Array(c));
  return { numberOfChannels: data.length, length: data[0].length, duration: data[0].length / sampleRate, sampleRate,
    getChannelData: (ch: number) => data[ch], copyToChannel: (src: Float32Array, ch: number) => data[ch].set(src),
  } as AudioBuffer;
}
function engine() {
  const a = new AudioEngine();
  a.ctx.createBuffer = (channels, length, rate) => buffer(Array.from({ length: channels }, () => new Array(length).fill(0)), rate);
  return a;
}

test('loading reads and mixes one stem at a time, including mono/stereo drum parts', async () => {
  const a = engine();
  const order: string[] = [];
  const decoded = [buffer([[1, 2]]), buffer([[3, 4], [5, 6]]), buffer([[0.5, 0.5]])];
  a.ctx.decodeAudioData = async () => { order.push('decode'); return decoded.shift()!; };
  async function* files() {
    for (const stem of ['drums_1', 'drums_2', 'song']) { order.push('read'); yield { stem, bytes: new Uint8Array(1) }; }
  }
  await a.loadSong(files(), 'drums');
  assert.deepEqual(order, ['read', 'decode', 'read', 'decode', 'read', 'decode']);
  assert.deepEqual(Array.from(a.buffers.player!.getChannelData(0)), [4, 6]);
  assert.deepEqual(Array.from(a.buffers.player!.getChannelData(1)), [6, 8]);
  assert.deepEqual(Array.from(a.buffers.backing!.getChannelData(0)), [0.5, 0.5]);
});

test('unloading during a decode prevents stale buffers from replacing the next song', async () => {
  const a = engine();
  let finish!: (b: AudioBuffer) => void;
  let began!: () => void;
  const started = new Promise<void>(r => { began = r; });
  a.ctx.decodeAudioData = () => { began(); return new Promise(r => { finish = r; }); };
  const load = a.loadSong([{ stem: 'guitar', bytes: new Uint8Array(1) }], 'guitar').then(() => 'resolved', e => e.name);
  await started;
  a.unload();
  const next = buffer([[9]]);
  a.setBuffers({ player: next, backing: null, origin: 0 });
  finish(buffer([[1]]));
  assert.equal(await load, 'AbortError');
  assert.equal(a.buffers.player, next);
});

test('built-in PCM uses its sample rate and never calls decodeAudioData', () => {
  const a = engine();
  a.ctx.decodeAudioData = () => { throw new Error('unexpected decode'); };
  const loaded = a.loadPcm([{ stem: 'guitar', channels: [new Float32Array([0.1, -0.2]), new Float32Array([0.3, -0.4])] }], 44100, 'guitar');
  assert.equal(loaded.hasPlayerStem, true);
  assert.equal(a.buffers.player!.sampleRate, 44100);
  assert.ok(Math.abs(a.buffers.player!.getChannelData(1)[1] + 0.4) < 1e-6);
});
