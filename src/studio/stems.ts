/** Audio is separate from chart history: undoing a note edit must never lose separated tracks. */
export interface StudioStems { guitar: Blob; backing: Blob; model: 'htdemucs_6s'; gain: number }
export const HELPER_URL = 'http://127.0.0.1:8765';

async function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(HELPER_URL + path, { ...init, mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new Error('Cannot reach the local helper. Start it with the origin shown below and allow local network access if your browser asks.');
  }
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    throw new Error(value?.error ?? `Local helper returned ${response.status}.`);
  }
  return response;
}

export async function connectHelper(token: string, signal?: AbortSignal): Promise<void> {
  const value = await (await request('/health', token, { signal })).json();
  if (value.service !== 'reclone-stems' || value.version !== 1 || value.model !== 'htdemucs_6s') throw new Error('This helper version is incompatible. Update it from the repository.');
}

function delay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Separation cancelled.', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Poll a cancellable local job; always release its files after download, failure or cancellation. */
export async function separateAudio(audio: Blob, token: string, duration: number, signal: AbortSignal,
  progress: (phase: string, fraction: number) => void): Promise<StudioStems> {
  let id = '';
  try {
    await connectHelper(token, signal);
    progress('Sending recording to local helper', 0);
    const job = await (await request('/jobs', token, { method: 'POST', body: audio, headers: { 'Content-Type': 'application/octet-stream' }, signal })).json();
    if (typeof job.id !== 'string' || !/^[a-f0-9]{32}$/.test(job.id)) throw new Error('Invalid local separation job.');
    id = job.id;
    while (true) {
      signal.throwIfAborted();
      const result = await (await request(`/jobs/${id}`, token, { signal })).json();
      progress(String(result.phase), Math.max(0, Math.min(1, Number(result.progress) || 0)));
      if (result.state === 'error') throw new Error(`${result.phase}. Check the helper terminal, then retry.`);
      if (result.state === 'ready') {
        if (result.model !== 'htdemucs_6s' || !Number.isFinite(result.duration) || Math.abs(result.duration - duration) > 0.15 || !Number.isFinite(result.gain) || result.gain <= 0 || result.gain > 1) throw new Error('Separated audio does not match this recording. The original is unchanged.');
        const tracks = await Promise.all(['guitar', 'backing'].map(async (name) => {
          const blob = await (await request(`/jobs/${id}/${name}.ogg`, token, { signal })).blob();
          if (!blob.size || blob.size > 100 * 1024 * 1024) throw new Error('Invalid separated audio size.');
          return blob;
        }));
        return { guitar: tracks[0], backing: tracks[1], model: result.model, gain: result.gain };
      }
      if (result.state !== 'running') throw new Error('Invalid helper response.');
      await delay(signal);
    }
  } finally {
    // A separate timeout is intentional: the job must be deleted even after the operation was aborted.
    if (id) await request(`/jobs/${id}`, token, { method: 'DELETE', signal: AbortSignal.timeout(8000) }).catch(() => {});
  }
}
