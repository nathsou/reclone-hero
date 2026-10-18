"""Isolated, cancellable worker. Only the official, checksum-verified Demucs model is loaded."""
import json
import os
from pathlib import Path
import subprocess
import sys

RATE = 44100
MAX_SECONDS = 1200


def report(folder, phase, progress=0):
    temporary = folder / 'status.tmp'
    temporary.write_text(json.dumps({'phase': phase, 'progress': progress}))
    temporary.replace(folder / 'status.json')


def separate(folder, device='cpu'):
    # Demucs 4.0.1 uses serialized model classes. Its fixed official download is hash checked.
    os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD'] = '1'
    import numpy as np
    import soundfile as sf
    import torch
    from demucs.apply import apply_model, TensorChunk
    from demucs.pretrained import get_model

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    report(folder, 'Decoding recording')
    decoded = folder / 'decoded.wav'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mp3,wav,ogg', '-i', str(folder / 'input'),
                    '-t', str(MAX_SECONDS + 1), '-map', '0:a:0', '-vn', '-sn', '-dn', '-ac', '2', '-ar', str(RATE), '-c:a', 'pcm_f32le', str(decoded)],
                   check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    samples, rate = sf.read(decoded, dtype='float32', always_2d=True)
    if not RATE // 2 <= len(samples) <= MAX_SECONDS * RATE or not np.isfinite(samples).all():
        raise ValueError('Choose a recording between 0.5 seconds and 20 minutes.')
    decoded.unlink()
    report(folder, 'Loading guitar model (first use downloads ~80 MB)')
    model = get_model('htdemucs_6s')
    # The named recipe is a one-model bag; unwrap it for segment sizing.
    if hasattr(model, 'models'):
        if len(model.models) != 1:
            raise ValueError('Expected the single six-source guitar model.')
        model = model.models[0]
    if model.samplerate != RATE or model.audio_channels != 2 or 'guitar' not in model.sources:
        raise ValueError('The guitar model is incompatible.')
    mix = torch.from_numpy(samples.T.copy())
    mono = mix.mean(0)
    mean, std = mono.mean(), mono.std()
    # A phase-inverted stereo recording can have a silent mono sum despite audible channels.
    if std < mix.std() * 1e-3:
        std = mix.std()
    guitar = torch.zeros_like(mix)
    if std > 1e-8:
        normalized = (mix - mean) / std
        size = int(RATE * float(model.segment))
        stride = int(size * 0.75)
        weight = torch.cat([torch.arange(1, size // 2 + 1), torch.arange(size - size // 2, 0, -1)]).float()
        weight /= weight.max()
        total = torch.zeros(mix.shape[-1])
        offsets = list(range(0, mix.shape[-1], stride))
        with torch.inference_mode():
            for index, start in enumerate(offsets):
                report(folder, 'Separating guitar', index / len(offsets))
                chunk = TensorChunk(normalized[None], start, size)
                # Keep only one segment's six outputs in memory, and accumulate guitar alone on CPU.
                output = apply_model(model, chunk, device=device, shifts=0, split=False)[0, model.sources.index('guitar')].cpu()
                length = output.shape[-1]
                guitar[:, start:start + length] += output * weight[:length]
                total[start:start + length] += weight[:length]
        guitar = guitar / total * std + mean / len(model.sources)
    backing = mix - guitar
    if not torch.isfinite(guitar).all() or not torch.isfinite(backing).all():
        raise ValueError('The model produced invalid audio.')
    # One shared gain preserves balance and reconstruction. Never normalize stems independently.
    peak = max(float(guitar.abs().max()), float(backing.abs().max()), float(mix.abs().max()), 0.98)
    gain = min(1.0, 0.98 / peak)
    report(folder, 'Encoding aligned tracks', 1)
    for name, track in [('guitar', guitar), ('backing', backing)]:
        # Vorbis gives broad Web Audio compatibility and small portable ZIPs.
        raw = folder / f'{name}.wav'
        sf.write(raw, (track * gain).T.numpy(), RATE, subtype='FLOAT')
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(raw), '-c:a', 'libvorbis', '-q:a', '7',
                        str(folder / f'{name}.ogg')], check=True, timeout=180, stderr=subprocess.PIPE)
        raw.unlink()
    (folder / 'result.json').write_text(json.dumps({'model': 'htdemucs_6s', 'duration': len(samples) / RATE, 'gain': gain}))
    report(folder, 'Ready', 1)


if __name__ == '__main__':
    folder = Path(sys.argv[1])
    try:
        separate(folder, sys.argv[2])
    except Exception as error:
        report(folder, f'Separation failed: {error}')
        raise
