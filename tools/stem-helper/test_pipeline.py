"""Optional real DSP/codec test with a deterministic model substitute; not AI-quality validation."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch


@unittest.skipUnless(importlib.util.find_spec('torch') and importlib.util.find_spec('soundfile') and shutil.which('ffmpeg'),
                     'Install helper dependencies and ffmpeg for DSP/codec validation.')
class PipelineTest(unittest.TestCase):
    def test_overlap_add_stereo_alignment_and_shared_gain(self):
        import json
        import numpy as np
        import soundfile as sf
        import torch
        from demucs.apply import BagOfModels
        from separate import separate, RATE

        class FixtureModel(torch.nn.Module):
            sources = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']
            samplerate = RATE
            audio_channels = 2
            segment = 7.8

            def __init__(self):
                super().__init__()
                self.dummy = torch.nn.Parameter(torch.zeros(1))

            def forward(self, mix):
                output = torch.zeros(mix.shape[0], 6, 2, mix.shape[-1], device=mix.device)
                output[:, 4] = mix * 0.35
                return output

        for seconds, antiphase, codec in [(0.6, False, None), (16.3, False, None), (1.2, True, None),
                                           (1.2, False, 'aac'), (1.2, False, 'alac')]:
            with tempfile.TemporaryDirectory(prefix='chart-stems-dsp-') as name:
                folder = Path(name)
                time = np.arange(int(seconds * RATE)) / RATE
                # Unequal stereo channels, strong transients and >1 peak exercise shared headroom.
                mix = np.stack([0.8 * np.sin(2 * np.pi * 220 * time), 0.7 * np.sin(2 * np.pi * 330 * time)], axis=1).astype('float32')
                mix[::22050] += 1.4
                if antiphase:
                    mix[:, 1] = -mix[:, 0]
                sf.write(folder / 'input', mix, RATE, format='WAV', subtype='FLOAT')
                if codec:
                    encoded = folder / 'encoded.m4a'
                    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(folder / 'input'), '-c:a', codec, str(encoded)], check=True)
                    encoded.replace(folder / 'input')  # The upload has no extension; demuxing must inspect bytes.
                    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(folder / 'input'),
                                                   '-ac', '2', '-ar', str(RATE), '-f', 'f32le', 'pipe:1'])
                    # AAC can pad the final frame and alter samples; compare against its decoded recording.
                    mix = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
                    self.assertLess(abs(len(mix) / RATE - seconds), 0.05)
                with patch('demucs.pretrained.get_model', return_value=BagOfModels([FixtureModel()])):
                    separate(folder)
                guitar, rate = sf.read(folder / 'guitar.ogg', dtype='float32', always_2d=True)
                backing, _ = sf.read(folder / 'backing.ogg', dtype='float32', always_2d=True)
                result = json.loads((folder / 'result.json').read_text())
                self.assertEqual(rate, RATE)
                self.assertEqual(guitar.shape, mix.shape)
                self.assertEqual(backing.shape, mix.shape)
                self.assertTrue(np.isfinite(guitar).all() and np.isfinite(backing).all())
                self.assertLess(result['gain'], 1)
                target = mix * result['gain']
                snr = 10 * np.log10(np.mean(target**2) / np.mean((guitar + backing - target)**2))
                self.assertGreater(snr, 30, f'Encoded sum reconstruction: {snr:.1f} dB')
                # Across the overlap boundaries, the estimated component remains the same gain.
                expected = (mix - mix.mean()) * 0.35 + mix.mean() / 6
                self.assertLess(np.sqrt(np.mean((guitar / result['gain'] - expected)**2)), 0.015)
                self.assertFalse((folder / 'decoded.wav').exists())
                self.assertFalse((folder / 'guitar.wav').exists())


if __name__ == '__main__':
    unittest.main()
