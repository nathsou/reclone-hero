// Dev-only convenience: serves a local charts folder so the game can load songs
// without the File System Access picker. Set CHARTS_DIR to point elsewhere.
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const CHARTS_DIR = path.resolve(process.env.CHARTS_DIR ?? '/Volumes/S/charts');
const CHART_RE = /\.(chart|mid)$/i;
const MIME = {
  ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  mp4: 'video/mp4', webm: 'video/webm', ini: 'text/plain', chart: 'text/plain', mid: 'audio/midi',
};

async function scan(dir, rel, out) {
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  const files = entries.filter((e) => e.isFile() && !e.name.startsWith('._')).map((e) => e.name);
  if (files.some((f) => CHART_RE.test(f))) {
    const iniName = files.find((f) => f.toLowerCase() === 'song.ini');
    const ini = iniName ? await fs.promises.readFile(path.join(dir, iniName)) : null;
    let chartHead = null;
    const chartName = files.find((f) => f.toLowerCase() === 'notes.chart');
    if (!ini && chartName) {
      const fh = await fs.promises.open(path.join(dir, chartName));
      const buf = Buffer.alloc(4096);
      const { bytesRead } = await fh.read(buf, 0, 4096, 0);
      await fh.close();
      chartHead = buf.subarray(0, bytesRead).toString('base64');
    }
    out.push({ path: rel, files, ini: ini ? ini.toString('base64') : null, chartHead });
  }
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith('.')) await scan(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name, out);
  }
}

function chartsPlugin() {
  const handler = async (req, res, next) => {
    if (!req.url?.startsWith('/__charts/')) return next();
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/__charts/scan') {
        if (!fs.existsSync(CHARTS_DIR)) { res.statusCode = 404; return res.end('charts dir not found'); }
        if (req.method === 'HEAD') return res.end();
        const out = [];
        await scan(CHARTS_DIR, '', out);
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ root: path.basename(CHARTS_DIR), songs: out }));
      }
      if (url.pathname.startsWith('/__charts/folder/') && req.method === 'DELETE') {
        // "Delete from disk" in the song list: one song folder, never the root or anything outside it.
        const rel = decodeURIComponent(url.pathname.slice('/__charts/folder/'.length));
        const abs = path.resolve(CHARTS_DIR, rel);
        if (!rel || !abs.startsWith(CHARTS_DIR + path.sep)) { res.statusCode = 403; return res.end(); }
        const entries = await fs.promises.readdir(abs, { withFileTypes: true });
        if (!entries.some((e) => e.isFile() && CHART_RE.test(e.name))) { res.statusCode = 400; return res.end('not a song folder'); }
        await fs.promises.rm(abs, { recursive: true });
        return res.end();
      }
      if (url.pathname.startsWith('/__charts/file/')) {
        const rel = decodeURIComponent(url.pathname.slice('/__charts/file/'.length));
        const abs = path.resolve(CHARTS_DIR, rel);
        if (!abs.startsWith(CHARTS_DIR + path.sep)) { res.statusCode = 403; return res.end(); }
        const stat = await fs.promises.stat(abs);
        const ext = path.extname(abs).slice(1).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');
        // Range support lets <audio> seek to a song's preview point without downloading everything before it.
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (m && (m[1] || m[2])) {
          const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
          const end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          return fs.createReadStream(abs, { start, end }).pipe(res);
        }
        res.setHeader('Content-Length', String(stat.size));
        return fs.createReadStream(abs).pipe(res);
      }
      res.statusCode = 404;
      res.end();
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  };
  return {
    name: 'charts-dir',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

/**
 * Build output is a single self-contained index.html (scripts and styles inlined), so it can be opened
 * straight from disk (file://) or dropped on any static host. Browsers refuse to load module scripts
 * from file:// URLs, but inline modules are fine.
 */
function singleFilePlugin() {
  return {
    name: 'single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html) return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && name.endsWith('.js')) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${escapeRe(name)}"[^>]*></script>`);
          // Everything is in this one file, so Vite's dynamic-import preload list is always empty.
          const code = file.code.replace(/__VITE_PRELOAD__/g, 'void 0').replace(/<\/(script)/gi, '<\\/$1');
          source = source.replace(tag, () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${escapeRe(name)}"[^>]*>`);
          source = source.replace(tag, () => `<style>${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig({
  plugins: [chartsPlugin(), singleFilePlugin()],
  base: './',
  server: { port: Number(process.env.PORT) || 5230 },
  build: {
    target: 'es2023',
    modulePreload: false,
    cssCodeSplit: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
