'use strict';

/**
 * Local Offline HTTP Server cho TradeFin Import L/C Simulator
 * Phục vụ tĩnh thư mục public/ và cung cấp API giải nén .docx / tải danh sách mẫu có sẵn.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const parser = require('./public/js/docx-pdf-parser.js');

const PORT = Number(process.env.PORT || 3005);
const PUBLIC_DIR = path.join(__dirname, 'public');
const SAMPLE_DIR = path.join(__dirname, 'sample_files');
const TESSERACT_DIR = path.join(PUBLIC_DIR, 'vendor', 'tesseract');
const MAX_OCR_BODY_BYTES = 25 * 1024 * 1024;

let ocrRuntimePromise = null;
let ocrQueue = Promise.resolve();

async function getNodeOcrRuntime() {
  if (!ocrRuntimePromise) {
    ocrRuntimePromise = (async () => {
      const simdPath = path.join(TESSERACT_DIR, 'tesseract-core-simd-lstm.wasm.js');
      const fallbackPath = path.join(TESSERACT_DIR, 'tesseract-core-lstm.wasm.js');
      let TesseractCore;
      try {
        TesseractCore = require(simdPath);
      } catch (_) {
        TesseractCore = require(fallbackPath);
      }
      const mod = await TesseractCore();
      const engGzPath = path.join(TESSERACT_DIR, 'eng.traineddata.gz');
      if (!fs.existsSync(engGzPath)) {
        throw new Error('Thiếu file dữ liệu OCR tiếng Anh (eng.traineddata.gz).');
      }
      mod.FS.writeFile('eng.traineddata', zlib.gunzipSync(fs.readFileSync(engGzPath)));

      let hasVie = false;
      const vieGzPath = path.join(TESSERACT_DIR, 'vie.traineddata.gz');
      if (fs.existsSync(vieGzPath)) {
        mod.FS.writeFile('vie.traineddata', zlib.gunzipSync(fs.readFileSync(vieGzPath)));
        hasVie = true;
      }

      return { mod, lang: hasVie ? 'eng+vie' : 'eng' };
    })().catch(err => {
      ocrRuntimePromise = null;
      throw err;
    });
  }
  return ocrRuntimePromise;
}

function runNodeWasmOcr(imageBuffer) {
  const task = ocrQueue.then(async () => {
    const { mod, lang } = await getNodeOcrRuntime();
    mod.FS.writeFile('/input', new Uint8Array(imageBuffer));
    const api = new mod.TessBaseAPI();
    try {
      const rc = api.Init(null, lang, 1);
      if (rc !== 0) {
        throw new Error(`TessBaseAPI Init thất bại (code=${rc})`);
      }
      const setRc = api.SetImageFile(1, 0);
      if (setRc !== 0) {
        throw new Error(`Không thể đọc dữ liệu hình ảnh đầu vào (code=${setRc})`);
      }
      return api.GetUTF8Text() || '';
    } finally {
      try { api.End(); } catch (_) {}
      try { mod.FS.unlink('/input'); } catch (_) {}
    }
  });
  ocrQueue = task.catch(() => {});
  return task;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function listFilesRecursive(baseDir, relPrefix) {
  if (!fs.existsSync(baseDir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const full = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, rel));
    } else {
      results.push({ name: entry.name, path: rel, size: fs.statSync(full).size });
    }
  }
  return results;
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    // API 1: Liệt kê các file mẫu trong sample_files/
    if (req.method === 'GET' && pathname === '/api/samples') {
      const files = listFilesRecursive(SAMPLE_DIR, '');
      return sendJson(res, 200, { files });
    }

    // API 2: Tải nội dung file mẫu (trả về binary để browser xử lý qua bộ đọc file thật)
    if (req.method === 'GET' && pathname.startsWith('/api/sample-file/')) {
      const rel = pathname.replace('/api/sample-file/', '').replace(/\.\./g, '');
      const fullPath = path.join(SAMPLE_DIR, rel);
      if (!fullPath.startsWith(SAMPLE_DIR) || !fs.existsSync(fullPath)) {
        return sendJson(res, 404, { error: 'Sample file not found' });
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${path.basename(fullPath)}"`
      });
      return fs.createReadStream(fullPath).pipe(res);
    }

    // API 3: Giải nén .docx fallback trên Node.js bằng zlib
    if (req.method === 'POST' && pathname === '/api/parse-docx') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const xml = await parser.extractDocxXmlFromBytes(new Uint8Array(buf));
      const text = parser.extractTextFromWordXml(xml);
      return sendJson(res, 200, { text });
    }

    // API 4: Nhận diện chữ OCR 100% Offline trên Node.js WASM (eng + vie)
    if (req.method === 'POST' && pathname === '/api/ocr-image') {
      const chunks = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_OCR_BODY_BYTES) {
          req.destroy();
          return sendJson(res, 413, { error: 'Dung lượng hình ảnh vượt quá giới hạn 25 MB.' });
        }
        chunks.push(chunk);
      }
      const buf = Buffer.concat(chunks);
      if (!buf || buf.length === 0) {
        return sendJson(res, 400, { error: 'Dữ liệu hình ảnh gửi lên bị trống.' });
      }
      const text = await runNodeWasmOcr(buf);
      return sendJson(res, 200, { text });
    }

    // Phục vụ file tĩnh trong public/
    let safeRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '').replace(/\.\./g, '');
    let filePath = path.join(PUBLIC_DIR, safeRel);
    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const isVendorAsset = safeRel.startsWith('vendor/');
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': isVendorAsset ? 'public, max-age=86400' : 'no-store, no-cache, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`TradeFin Import L/C Simulator running offline at http://127.0.0.1:${PORT}`);
});
