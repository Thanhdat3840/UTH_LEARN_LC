'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SAMPLES_DIR = path.join(ROOT_DIR, 'sample_files');
const OUTPUT_FILE = path.join(ROOT_DIR, 'UTH_Learn_LC_Portable.html');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

function readBase64(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath)).toString('base64');
}

function escapeScriptBody(js) {
  return String(js).replace(/<\/script/gi, '<\\/script');
}

function escapePlainTag(text) {
  return String(text).replace(/<\/script/gi, '__STANDALONE_CLOSE_SCRIPT__');
}

function collectSampleFiles() {
  const folders = ['contracts', 'shipping_docs_clean', 'shipping_docs_discrepant'];
  const files = [];
  const data = {};

  for (const folder of folders) {
    const dir = path.join(SAMPLES_DIR, folder);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir).sort();
    for (const name of entries) {
      if (!name.toLowerCase().endsWith('.docx')) continue;
      const rel = `${folder}/${name}`;
      const abs = path.join(dir, name);
      files.push({ path: rel, name });
      data[rel] = fs.readFileSync(abs).toString('base64');
    }
  }
  return { files, data };
}

function standaloneRuntimeClient(samplesBundle) {
  window.__STANDALONE_MODE__ = true;
  window.__STANDALONE_REMOTE_BASE__ = 'https://uthlearnlc.vercel.app/';
  window.__STANDALONE_SAMPLES__ = samplesBundle;

  function b64ToUint8(b64) {
    var clean = String(b64 || '').replace(/\s+/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function readB64TagBytes(id) {
    var node = document.getElementById(id);
    if (!node) return null;
    var txt = (node.textContent || '').trim();
    return txt ? b64ToUint8(txt) : null;
  }

  var origFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (url === '/api/samples' || url.endsWith('/api/samples')) {
      return Promise.resolve(new Response(JSON.stringify({ files: window.__STANDALONE_SAMPLES__.files }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    var sampleIdx = url.indexOf('/api/sample-file/');
    if (sampleIdx !== -1) {
      var rel = decodeURIComponent(url.slice(sampleIdx + '/api/sample-file/'.length));
      var b64 = window.__STANDALONE_SAMPLES__.data[rel];
      if (!b64) {
        return Promise.resolve(new Response('Not found', { status: 404 }));
      }
      return Promise.resolve(new Response(b64ToUint8(b64), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      }));
    }
    if (origFetch) return origFetch(input, init);
    return Promise.reject(new Error('Fetch unavailable in standalone mode: ' + url));
  };

  var pdfWorkerBytes = readB64TagBytes('standalone-pdf-worker-b64');
  if (pdfWorkerBytes && window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    var pdfWorkerUrl = URL.createObjectURL(new Blob([pdfWorkerBytes], { type: 'application/javascript' }));
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }

  var cachedTessWorkerUrl = null;
  function buildTesseractWorkerBlobUrl() {
    if (cachedTessWorkerUrl) return cachedTessWorkerUrl;
    var coreBytes = readB64TagBytes('standalone-tess-core-b64');
    var workerBytes = readB64TagBytes('standalone-tess-worker-b64');
    var engNode = document.getElementById('standalone-tess-eng-gz-b64');
    var engGzB64 = engNode ? (engNode.textContent || '').trim() : '';

    var workerBootstrapPrefix = [
      '\n;if (typeof self.TesseractCore === "undefined" && typeof self.TesseractCoreWASM !== "undefined") { self.TesseractCore = self.TesseractCoreWASM; }\n',
      'self.__EMBEDDED_ENG_GZ_B64__ = ', JSON.stringify(engGzB64), ';\n',
      '(function () {\n',
      '  var _origFetch = self.fetch;\n',
      '  self.fetch = function (input, init) {\n',
      '    var u = typeof input === "string" ? input : (input && input.url ? input.url : "");\n',
      '    if (/eng\\.traineddata(\\.gz)?$/i.test(u)) {\n',
      '      var b = atob(self.__EMBEDDED_ENG_GZ_B64__);\n',
      '      var arr = new Uint8Array(b.length);\n',
      '      for (var i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);\n',
      '      return Promise.resolve(new Response(arr, { status: 200, headers: { "Content-Type": "application/gzip" } }));\n',
      '    }\n',
      '    return _origFetch ? _origFetch.apply(this, arguments) : Promise.reject(new Error("Offline worker fetch blocked: " + u));\n',
      '  };\n',
      '})();\n'
    ].join('');

    var blob = new Blob([coreBytes, workerBootstrapPrefix, workerBytes], { type: 'application/javascript' });
    cachedTessWorkerUrl = URL.createObjectURL(blob);
    return cachedTessWorkerUrl;
  }

  window.__STANDALONE_OCR_FACTORY__ = function (loggerFn) {
    var workerBlobUrl = buildTesseractWorkerBlobUrl();
    return window.Tesseract.createWorker('eng', 1, {
      workerPath: workerBlobUrl,
      workerBlobURL: false,
      langPath: 'https://offline.local',
      cacheMethod: 'none',
      gzip: true,
      errorHandler: function (err) { console.error('Offline OCR Worker Error:', err); },
      logger: loggerFn
    });
  };
}

function buildStandaloneRuntimeShim(samplesBundle) {
  const payloadJson = escapeScriptBody(JSON.stringify(samplesBundle));
  const fnSource = escapeScriptBody(standaloneRuntimeClient.toString());
  return `<script>\n(${fnSource})(${payloadJson});\n  </script>`;
}

function build() {
  let html = readText('public/index.html');

  const stylesCss = readText('public/styles.css');
  const bgJpgB64 = readBase64('public/images/Hinh_UTH.jpg');
  const logoPngB64 = readBase64('public/images/logo_uth.png');
  const inlinedCss = stylesCss.replace(
    /url\(["']?images\/Hinh_UTH\.jpg["']?\)/g,
    () => `url("data:image/jpeg;base64,${bgJpgB64}")`
  );

  const mammothJs = escapeScriptBody(readText('public/vendor/mammoth.browser.min.js'));
  const pdfJs = escapeScriptBody(readText('public/vendor/pdf.min.js'));
  const tesseractJs = escapeScriptBody(readText('public/vendor/tesseract/tesseract.min.js'));

  const pdfWorkerB64 = readBase64('public/vendor/pdf.worker.min.js');
  const tessCoreB64 = readBase64('public/vendor/tesseract/tesseract-core-lstm.wasm.js');
  const tessWorkerB64 = readBase64('public/vendor/tesseract/worker.min.js');
  const tessEngGzB64 = readBase64('public/vendor/tesseract/eng.traineddata.gz');

  const samplesBundle = collectSampleFiles();
  const shimScript = buildStandaloneRuntimeShim(samplesBundle);

  const engineJs = escapeScriptBody(readText('public/js/ucp600-engine.js'));
  const bankLogosJs = escapeScriptBody(readText('public/js/bank-logos.js'));
  const bankTemplatesJs = escapeScriptBody(readText('public/js/bank-templates.js'));
  const parserJs = escapeScriptBody(readText('public/js/docx-pdf-parser.js'));
  const appJs = escapeScriptBody(readText('public/js/app.js'));

  const cssRegex = /<link\s+rel="stylesheet"\s+href="styles\.css[^"]*"\s*\/?>/i;
  if (!cssRegex.test(html)) throw new Error('Không tìm thấy thẻ link styles.css trong public/index.html');
  html = html.replace(cssRegex, () => `<style>\n${inlinedCss}\n  </style>`);

  const vendorRegex = /<script\s+src="vendor\/mammoth\.browser\.min\.js"><\/script>\s*<script\s+src="vendor\/pdf\.min\.js"><\/script>\s*<script\s+src="vendor\/tesseract\/tesseract\.min\.js"><\/script>/i;
  if (!vendorRegex.test(html)) throw new Error('Không tìm thấy cụm script vendor trong public/index.html');
  const inlinedVendorHead = [
    `<script>\n${mammothJs}\n  </script>`,
    `<script>\n${pdfJs}\n  </script>`,
    `<script>\n${tesseractJs}\n  </script>`,
    `<script type="text/plain" id="standalone-pdf-worker-b64">${pdfWorkerB64}</script>`,
    `<script type="text/plain" id="standalone-tess-core-b64">${tessCoreB64}</script>`,
    `<script type="text/plain" id="standalone-tess-worker-b64">${tessWorkerB64}</script>`,
    `<script type="text/plain" id="standalone-tess-eng-gz-b64">${tessEngGzB64}</script>`,
    shimScript
  ].join('\n  ');
  html = html.replace(vendorRegex, () => inlinedVendorHead);

  const logoRegex = /src="images\/logo_uth\.png"/g;
  if (!logoRegex.test(html)) throw new Error('Không tìm thấy logo_uth.png trong public/index.html');
  html = html.replace(logoRegex, () => `src="data:image/png;base64,${logoPngB64}"`);

  const appScriptsRegex = /<script\s+src="js\/ucp600-engine\.js[^"]*"><\/script>\s*<script\s+src="js\/bank-logos\.js[^"]*"><\/script>\s*<script\s+src="js\/bank-templates\.js[^"]*"><\/script>\s*<script\s+src="js\/docx-pdf-parser\.js[^"]*"><\/script>\s*<script\s+src="js\/app\.js[^"]*"><\/script>/i;
  if (!appScriptsRegex.test(html)) throw new Error('Không tìm thấy cụm script js/* cuối body trong public/index.html');
  const inlinedAppScripts = [
    `<script>\n${engineJs}\n  </script>`,
    `<script>\n${bankLogosJs}\n  </script>`,
    `<script>\n${bankTemplatesJs}\n  </script>`,
    `<script>\n${parserJs}\n  </script>`,
    `<script>\n${appJs}\n  </script>`
  ].join('\n  ');
  html = html.replace(appScriptsRegex, () => inlinedAppScripts);

  fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
  const stat = fs.statSync(OUTPUT_FILE);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`Built standalone portable HTML: ${OUTPUT_FILE}`);
  console.log(`Embedded sample files: ${samplesBundle.files.length}`);
  console.log(`Output size: ${stat.size} bytes (${sizeMb} MB)`);
}

build();
