"""Explicit pretrained-model audit on external recordings. Requires helper dependencies and weights.

python tests/tools/stem-music-audit.py --music-dir /tmp/studio-music-data/audio
No music or weights are downloaded by this script except Demucs's standard first-use model download.
Reconstruction metrics measure alignment/integrity, not guitar isolation quality (no ground-truth stems).
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time


def main():
    import numpy as np
    import soundfile as sf
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--music-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('/tmp/stem-music-audit'))
    parser.add_argument('--device', default='cpu', choices=['cpu', 'cuda', 'mps'])
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    worker_path = Path(__file__).resolve().parents[2] / 'tools/stem-helper/separate.py'
    spec = importlib.util.spec_from_file_location('stem_worker', worker_path)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    results = []
    for filename, start, length in [('Karissa_Hobbs_-_Lets_Go_Fishin.ogg', 30, 30),
                                     ('Kevin_MacLeod_-_Vibe_Ace.ogg', 10, 30),
                                     ('sorohanro_-_solo-trumpet-06.ogg', 0, 5)]:
        source = args.music_dir / filename
        with tempfile.TemporaryDirectory(prefix='chart-stems-music-') as name:
            folder = Path(name)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(source), '-t', str(length),
                            '-ar', '44100', '-ac', '2', '-c:a', 'pcm_f32le', '-f', 'wav', str(folder / 'input')], check=True)
            original, rate = sf.read(folder / 'input', dtype='float32', always_2d=True)
            started = time.monotonic()
            worker.separate(folder, args.device)
            metadata = json.loads((folder / 'result.json').read_text())
            guitar, sr = sf.read(folder / 'guitar.ogg', dtype='float32', always_2d=True)
            backing, _ = sf.read(folder / 'backing.ogg', dtype='float32', always_2d=True)
            assert sr == rate == 44100 and guitar.shape == backing.shape == original.shape
            assert np.isfinite(guitar).all() and np.isfinite(backing).all()
            target = original * metadata['gain']
            error = np.mean((guitar + backing - target) ** 2)
            snr = float(10 * np.log10(np.mean(target**2) / max(error, 1e-20)))
            assert snr > 25, f'Poor reconstruction or alignment: {snr:.1f} dB'
            result = {'file': filename, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                      **metadata, 'seconds_to_separate': time.monotonic() - started, 'sum_snr_db': snr,
                      'guitar_rms_fraction': float(np.sqrt(np.mean(guitar**2) / np.mean(target**2)))}
            results.append(result)
            for stem in ['guitar', 'backing']:
                (args.output / f'{source.stem}-{stem}.ogg').write_bytes((folder / f'{stem}.ogg').read_bytes())
            print(json.dumps(result), flush=True)
    (args.output / 'report.json').write_text(json.dumps(results, indent=2))
    print('Listen to the guitar/backing outputs to judge leakage; numerical integrity alone does not establish isolation quality.')


if __name__ == '__main__':
    main()
