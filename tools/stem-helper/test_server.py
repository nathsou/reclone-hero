"""Model-free protocol tests. These do not claim to measure separation quality."""
import http.client
import json
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from server import Jobs, ThreadingHTTPServer, handler_for

ORIGIN = 'http://localhost:5173'


class ProtocolTest(unittest.TestCase):
    def setUp(self):
        self.jobs = Jobs('cpu')
        self.token = secrets.token_urlsafe(24)
        # Bind first so the Host validation can use the ephemeral test port.
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.jobs, self.token, ORIGIN, 0))
        self.port = self.server.server_address[1]
        self.server.RequestHandlerClass = handler_for(self.jobs, self.token, ORIGIN, self.port)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.jobs.clean()

    def request(self, method, path, body=None, headers=None):
        client = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        client.request(method, path, body, {'Origin': ORIGIN, 'Authorization': f'Bearer {self.token}', **(headers or {})})
        response = client.getresponse()
        status, data, cors = response.status, response.read(), response.getheader('Access-Control-Allow-Origin')
        client.close()
        return status, data, cors

    def test_pairing_origin_and_host_are_required(self):
        self.assertEqual(self.request('GET', '/health')[0], 200)
        self.assertEqual(self.request('GET', '/health', headers={'Authorization': 'Bearer wrong'})[0], 401)
        self.assertEqual(self.request('GET', '/health', headers={'Origin': 'https://untrusted.example'})[0], 403)
        self.assertEqual(self.request('GET', '/health', headers={'Host': 'attacker.example'})[0], 403)
        self.assertEqual(self.request('OPTIONS', '/jobs')[0], 204)
        self.assertEqual(self.request('GET', '/health')[2], ORIGIN)

    def test_reject_invalid_size_and_path_without_starting_worker(self):
        self.assertEqual(self.request('POST', '/jobs', b'', {'Content-Type': 'application/octet-stream'})[0], 413)
        self.assertEqual(self.request('POST', '/jobs', b'x', {'Content-Type': 'text/plain'})[0], 400)
        self.assertEqual(self.request('GET', '/jobs/../../etc/passwd')[0], 404)
        self.assertIsNone(self.jobs.current)

    def test_upload_cancel_cleanup_and_single_job(self):
        # Exercise the real HTTP upload/process boundary; substitute a sleeping subprocess for the model.
        real_popen = subprocess.Popen
        def worker(*args, **kwargs):
            return real_popen([sys.executable, '-c', 'import time; time.sleep(60)'], **kwargs)
        with patch('server.subprocess.Popen', worker):
            status, data, _ = self.request('POST', '/jobs', b'recording', {'Content-Type': 'application/octet-stream'})
        self.assertEqual(status, 202)
        job_id = json.loads(data)['id']
        folder, process = self.jobs.current['folder'], self.jobs.current['process']
        self.assertEqual((folder / 'input').read_bytes(), b'recording')
        self.assertEqual(self.request('POST', '/jobs', b'other', {'Content-Type': 'application/octet-stream'})[0], 409)
        status, data, _ = self.request('GET', f'/jobs/{job_id}')
        self.assertEqual(json.loads(data)['state'], 'running')
        self.assertEqual(self.request('GET', f'/jobs/{job_id}/guitar.ogg')[0], 404, 'unfinished outputs cannot be read')
        self.assertEqual(self.request('GET', f'/jobs/{job_id}extra')[0], 404)
        self.assertEqual(self.request('DELETE', f'/jobs/{job_id}')[0], 200)
        self.assertFalse(folder.exists())
        self.assertIsNotNone(process.poll())
        self.assertIsNone(self.jobs.current)

    def test_abandoned_browser_job_expires(self):
        folder = Path(tempfile.mkdtemp(prefix='chart-stems-test-'))
        process = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'], start_new_session=True)
        self.jobs.current = {'id': 'a' * 32, 'folder': folder, 'process': process, 'seen': time.monotonic() - 121}
        self.jobs.prune()
        self.assertIsNotNone(process.poll())
        self.assertFalse(folder.exists())
        self.assertIsNone(self.jobs.current)

    def test_ready_download_and_failure_status(self):
        folder = Path(tempfile.mkdtemp(prefix='chart-stems-test-'))
        process = subprocess.Popen([sys.executable, '-c', 'pass'])
        process.wait()
        self.jobs.current = {'id': 'a' * 32, 'folder': folder, 'process': process, 'seen': time.monotonic()}
        (folder / 'result.json').write_text(json.dumps({'model': 'htdemucs_6s', 'duration': 30, 'gain': 1}))
        (folder / 'guitar.ogg').write_bytes(b'guitar')
        (folder / 'status.json').write_text(json.dumps({'phase': 'Ready', 'progress': 1}))
        status, data, _ = self.request('GET', '/jobs/' + 'a' * 32)
        self.assertEqual(json.loads(data)['state'], 'ready')
        status, data, _ = self.request('GET', '/jobs/' + 'a' * 32 + '/guitar.ogg')
        self.assertEqual((status, data), (200, b'guitar'))
        self.request('DELETE', '/jobs/' + 'a' * 32)
        self.assertFalse(folder.exists())
        folder = Path(tempfile.mkdtemp(prefix='chart-stems-test-'))
        process = subprocess.Popen([sys.executable, '-c', 'raise SystemExit(2)'])
        process.wait()
        self.jobs.current = {'id': 'b' * 32, 'folder': folder, 'process': process, 'seen': time.monotonic()}
        (folder / 'status.json').write_text(json.dumps({'phase': 'Separation failed: decoding', 'progress': 0}))
        (folder / 'worker.log').write_text('Fixture worker failure')
        status, data, _ = self.request('GET', '/jobs/' + 'b' * 32)
        self.assertEqual(json.loads(data)['state'], 'error')
        self.assertIn('decoding', json.loads(data)['phase'])


if __name__ == '__main__':
    unittest.main()
