# Local guitar separation for Chart Studio

This optional helper uses Meta's pretrained **Demucs `htdemucs_6s`** model to estimate a guitar track. The backing is the original recording minus that estimate. Songs stay on your computer; only model/package downloads need Internet access. The game itself still works without Python or this helper.

## Install once

Use **Python 3.10–3.12**, **ffmpeg** on PATH, and a checkout of this repository. Allow several GB of disk space and at least 4 GB of free RAM. Longer recordings may need more memory. CPU separation can take longer than the recording.

macOS / Linux:

```sh
python3 -m venv .venv-stems
. .venv-stems/bin/activate
# Linux CPU: install these wheels first to avoid the much larger CUDA packages.
python -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r tools/stem-helper/requirements.txt
python tools/stem-helper/server.py
```

On macOS omit the CPU-wheel command; the requirements install the platform's wheels. On Windows use `py -3.12 -m venv .venv-stems`, then `.venv-stems\Scripts\activate` and the remaining commands above. Install ffmpeg with your usual package manager (for example `brew install ffmpeg`, `apt install ffmpeg`, or `winget install Gyan.FFmpeg`).

For an NVIDIA GPU, install the matching PyTorch 2.6.0 / torchaudio 2.6.0 CUDA wheels from [PyTorch](https://pytorch.org/get-started/previous-versions/), then run with `--device cuda`. Apple Silicon users can try `--device mps`; use the CPU default if the GPU backend reports unsupported operations or runs out of memory.

## Connect and separate

1. Open Chart Studio and import or open a song. Select **Audio** in the inspector.
2. Run the command shown under **Set up the local helper**. The default origin is `https://nathsou.github.io`; a local dev server requires its exact origin, e.g. `python tools/stem-helper/server.py --origin http://localhost:5173`. A `file://` build uses `--origin null`.
3. Paste the helper terminal's **Pairing code** into the Audio tab, then click **Separate guitar**. If prompted, allow the page to access your local network. The first separation downloads the ~80 MB model from `dl.fbaipublicfiles.com`; subsequent jobs use the local Torch cache.
4. Audition **Guitar only** and **Backing only** using the studio transport. Watch the bot or playtest to hear the combined tracks. Misses now mute the estimated guitar part while backing continues.
5. Save or export. Browser saves and Studio ZIPs include the original plus both tracks. Extracted ZIPs contain `guitar.ogg` and backing `song.ogg` for ordinary Clone Hero import. `original.*` preserves your recording and is ignored by game stem discovery. **Use original mix** discards the estimates and restores whole-mix gameplay.

There is no model training. See [Demucs](https://github.com/facebookresearch/demucs) for model details and terms. Guitar separation is approximate: vocals, cymbals, keys, and reverb can bleed into the guitar estimate, and some guitar may remain in the backing. The six-source model's guitar output is experimental. Always audition before keeping it. This action does not regenerate or move chart notes.

## Privacy, cancellation, troubleshooting

The service binds only to **127.0.0.1:8765**, checks Host and your exact Origin, requires a fresh random pairing code, and never accepts arbitrary file paths, commands, or model URLs from the browser. Keep the code private. Do not expose the helper on a public interface or through a reverse proxy. The code is only held in the current studio screen, not saved with projects or ZIPs.

Audio is uploaded from your browser to the local process, not to a cloud service. Temporary audio/output files are removed after download, cancellation, helper shutdown, or two minutes without browser polling. Abruptly killing the whole helper/computer can leave a `chart-stems-*` folder in your OS temporary directory; it can be deleted manually. The downloaded model remains cached. Closing the editor cancels its job. One job runs at a time. Recordings must be under 100 MB and between 0.5 seconds and 20 minutes.

If connection fails, check the origin/port, pairing code, OS firewall, browser local-network permission, and whether another helper owns the port. Firefox or restrictive browser policies may reject HTTPS-to-loopback requests; run the app locally with the matching `--origin` when needed. No general browser security bypass is required. A model-download error leaves your original unchanged: check Internet access to the model host and retry. Inference errors appear in the Audio tab and helper terminal. Stop the helper with Ctrl-C when finished.

Both outputs use the same sample clock, overlap-add at segment boundaries, and a single shared headroom gain. Backing is computed as the sample-aligned residual **before** encoding. Vorbis quality 7 keeps exports small and browser-compatible; lossy encoding means their sum is not mathematically identical to the source. No time stretching or chart offset is applied.

## Validation

Run `python -m unittest discover -s tools/stem-helper -p 'test_*.py'` for the loopback API tests. With helper dependencies installed, this also checks the actual overlap-add, stereo/anti-phase handling, shared gain, codecs and sample alignment using a deterministic model substitute. Model inference is deliberately an explicit opt-in audit requiring downloaded weights and external music; see `tests/tools/studio-stems-audit.mjs` and `tests/tools/stem-music-audit.py`. No model weights or music recordings are included in this repository.

The development workspace could not download the pretrained weights: its network allowlist blocks `dl.fbaipublicfiles.com` (HTTP 403). The helper protocol, browser workflow, playback routing and DSP/codec mechanics were tested, but **pretrained guitar-isolation quality on recorded songs was not validated here**. That remaining audit is documented in [Chart Studio](../../docs/chart-studio.md#optional-instrument-audio). The substitute-model tests do not establish separation quality.
