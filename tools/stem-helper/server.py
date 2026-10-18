#!/usr/bin/env python3
"""Optional loopback-only Chart Studio helper. Songs never go to an external service."""
import argparse
from contextlib import suppress
import atexit
import json
import os
import signal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time

MAX_UPLOAD = 100 * 1024 * 1024


class Jobs:
    def __init__(self, device):
        self.device = device
        self.lock = threading.RLock()
        self.current = None

    def clean(self):
        with self.lock:
            if self.current:
                process = self.current.get('process')
                if process and process.poll() is None:
                    if os.name == 'posix':
                        with suppress(ProcessLookupError):
                            os.killpg(process.pid, signal.SIGTERM)
                    else:
                        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        if os.name == 'posix':
                            with suppress(ProcessLookupError):
                                os.killpg(process.pid, signal.SIGKILL)
                        else:
                            process.kill()
                        process.wait()
                shutil.rmtree(self.current['folder'], ignore_errors=True)
                self.current = None

    def prune(self):
        with self.lock:
            if self.current and time.monotonic() - self.current['seen'] > 120:
                self.clean()

    def expire(self):
        # A closed/crashed tab must not leave a model running or songs on disk indefinitely.
        while True:
            time.sleep(15)
            self.prune()


def handler_for(jobs, token, origin, port):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.0'

        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, *_):
            pass  # Do not log tokens, paths or song data.

        def cors_headers(self):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Access-Control-Allow-Private-Network', 'true')

        def reply(self, code, value):
            data = json.dumps(value).encode()
            self.send_response(code)
            self.cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def allowed(self, auth=True):
            if self.headers.get('Host') != f'127.0.0.1:{port}' or self.headers.get('Origin') != origin:
                self.send_error(403)
                return False
            if auth and not secrets.compare_digest(self.headers.get('Authorization', ''), f'Bearer {token}'):
                self.reply(401, {'error': 'The pairing code is incorrect. Copy the code printed by the helper.'})
                return False
            return True

        def do_OPTIONS(self):
            if not self.allowed(False):
                return
            self.send_response(204)
            self.cors_headers()
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.end_headers()

        def do_POST(self):
            if not self.allowed():
                return
            if self.path != '/jobs' or self.headers.get('Content-Type') != 'application/octet-stream':
                return self.reply(400, {'error': 'Send song audio to /jobs.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            if not 0 < length <= MAX_UPLOAD:
                return self.reply(413, {'error': 'Choose audio smaller than 100 MB.'})
            with jobs.lock:
                if jobs.current:
                    return self.reply(409, {'error': 'Another separation is active. Cancel it first or restart the helper.'})
                job = jobs.current = {'id': secrets.token_hex(16), 'folder': Path(tempfile.mkdtemp(prefix='chart-stems-')), 'seen': time.monotonic()}
                try:
                    self.connection.settimeout(30)
                    with (job['folder'] / 'input').open('wb') as out:
                        remaining = length
                        while remaining:
                            chunk = self.rfile.read(min(1024 * 1024, remaining))
                            if not chunk:
                                raise ValueError('Upload interrupted.')
                            out.write(chunk)
                            remaining -= len(chunk)
                    # Fixed script and arguments; no browser supplied paths, commands, or model URLs.
                    with (job['folder'] / 'worker.log').open('wb') as log:
                        job['process'] = subprocess.Popen([sys.executable, str(Path(__file__).with_name('separate.py')),
                                                          str(job['folder']), jobs.device], stdout=log, stderr=log, start_new_session=os.name == 'posix')
                    self.reply(202, {'id': job['id']})
                except Exception:
                    jobs.clean()
                    self.reply(400, {'error': 'Could not receive audio. Retry the separation.'})

        def do_GET(self):
            if not self.allowed():
                return
            if self.path == '/health':
                return self.reply(200, {'service': 'reclone-stems', 'version': 1, 'model': 'htdemucs_6s'})
            with jobs.lock:
                job = jobs.current
                if not job or not (self.path == '/jobs/' + job['id'] or self.path.startswith('/jobs/' + job['id'] + '/')):
                    return self.reply(404, {'error': 'This separation no longer exists.'})
                job['seen'] = time.monotonic()
                tail = self.path[len('/jobs/' + job['id']):]
                process = job['process']
                if tail in ('/guitar.ogg', '/backing.ogg') and process.poll() == 0:
                    path = job['folder'] / tail[1:]
                    self.send_response(200)
                    self.cors_headers()
                    self.send_header('Content-Type', 'audio/ogg')
                    self.send_header('Content-Length', str(path.stat().st_size))
                    self.end_headers()
                    with path.open('rb') as source:
                        shutil.copyfileobj(source, self.wfile)
                elif tail == '':
                    try:
                        status = json.loads((job['folder'] / 'status.json').read_text())
                    except (FileNotFoundError, json.JSONDecodeError):
                        status = {'phase': 'Starting model', 'progress': 0}
                    state = 'running' if process.poll() is None else 'ready' if process.returncode == 0 else 'error'
                    # Keep stack traces in the terminal, not the browser. Include useful final failure text.
                    if state == 'error':
                        print((job['folder'] / 'worker.log').read_text()[-4000:], file=sys.stderr)
                    result = json.loads((job['folder'] / 'result.json').read_text()) if state == 'ready' else {}
                    self.reply(200, {**status, **result, 'state': state})
                else:
                    self.reply(404, {'error': 'No such output.'})

        def do_DELETE(self):
            if not self.allowed():
                return
            with jobs.lock:
                if jobs.current and self.path == '/jobs/' + jobs.current['id']:
                    jobs.clean()
                self.reply(200, {'deleted': True})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default='https://nathsou.github.io', help='Exact Chart Studio origin; use null for file://')
    parser.add_argument('--device', choices=['cpu', 'cuda', 'mps'], default='cpu')
    port = 8765
    args = parser.parse_args()
    if not shutil.which('ffmpeg'):
        parser.error('Install ffmpeg first and ensure it is on PATH.')
    jobs = Jobs(args.device)
    atexit.register(jobs.clean)
    threading.Thread(target=jobs.expire, daemon=True).start()
    token = secrets.token_urlsafe(24)
    handler = handler_for(jobs, token, args.origin, port)
    server = ThreadingHTTPServer(('127.0.0.1', port), handler)
    server.daemon_threads = True
    print(f'Chart Studio helper: http://127.0.0.1:{port}\nAllowed origin: {args.origin}\nPairing code: {token}', flush=True)
    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        jobs.clean()


if __name__ == '__main__':
    main()
