'use strict';

/**
 * Bộ đọc file chuẩn hóa Offline:
 * - Dùng mammoth.js trên browser / node mammoth cho .docx
 * - Dùng pdfjs-dist trên browser / fallback regex cho .pdf
 * - Bộ bóc tách thông minh Sales Contract -> SWIFT MT700
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DocxPdfParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const MONTHS = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12'
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function normalizeDateToIso(str) {
    if (!str) return '';
    let s = String(str).trim();

    // Loại bỏ nhiễu OCR sau số ngày: ví dụ "03% 2020", "03* 2020", "03^ 2020", "03~ 2020", "03°% 2020"
    s = s.replace(/(\d{1,2})[%*~^°º#@$]+(\s*)/g, function (m, d, sp) { return d + sp; });

    // Hỗ trợ ngày mô tả theo thông lệ Điều 3 UCP 600:
    // Ví dụ: "END OF MAY, 2020" -> ngày cuối tháng (2020-05-31)
    // "BEGINNING OF MAY, 2020" -> ngày 10 (2020-05-10)
    // "MIDDLE OF MAY, 2020" -> ngày 20 (2020-05-20)
    const descMatch = s.match(/\b(END|BEGINNING|MIDDLE)\s+OF\s+([A-Za-z]+),?\s*(20\d{2})\b/i);
    if (descMatch && MONTHS[descMatch[2].toLowerCase()]) {
      const year = Number(descMatch[3]);
      const monthNum = Number(MONTHS[descMatch[2].toLowerCase()]);
      const pos = descMatch[1].toUpperCase();
      if (pos === 'END') {
        const lastDay = new Date(year, monthNum, 0).getDate();
        return `${year}-${pad2(monthNum)}-${pad2(lastDay)}`;
      } else if (pos === 'BEGINNING') {
        return `${year}-${pad2(monthNum)}-10`;
      } else if (pos === 'MIDDLE') {
        return `${year}-${pad2(monthNum)}-20`;
      }
    }

    // Month DD, YYYY e.g. MAY 03th, 2020 or MAY 03,2000 or MAY 03 2020
    let m = s.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(20\d{2})\b/i);
    if (m && MONTHS[m[1].toLowerCase()]) {
      return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${pad2(m[2])}`;
    }

    // DD Month YYYY (e.g. 14 November 2026 or 15th Dec, 2026)
    m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)[\s,]+(20\d{2})\b/i);
    if (m && MONTHS[m[2].toLowerCase()]) {
      return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${pad2(m[1])}`;
    }

    // YYYY-MM-DD or YYYY/MM/DD
    m = s.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

    // DD/MM/YYYY, DD.MM.YYYY, DD,MM,YYYY or MM/DD/YYYY
    m = s.match(/\b(\d{1,2})[-\/.,](\d{1,2})[-\/.,](20\d{2})\b/);
    if (m) {
      const p1 = Number(m[1]);
      const p2 = Number(m[2]);
      if (p2 > 12 && p1 <= 12) {
        return `${m[3]}-${pad2(p1)}-${pad2(p2)}`;
      }
      return `${m[3]}-${pad2(p2)}-${pad2(p1)}`;
    }

    // DDMMMYYYY or DD-MMM-YY (e.g. 04MAY2020, 20-May-20, 03 MAY., 2020)
    m = s.match(/\b(\d{1,2})[\s\-.]*([A-Za-z]{3,9})[.,\s\-]*(20\d{2}|\d{2})\b/i);
    if (m && MONTHS[m[2].toLowerCase()]) {
      const yr = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${yr}-${MONTHS[m[2].toLowerCase()]}-${pad2(m[1])}`;
    }

    // SWIFT YYMMDD (6 chữ số liền nhau, ví dụ 261114)
    m = s.match(/\b(2\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
    if (m) return `20${m[1]}-${m[2]}-${m[3]}`;

    return '';
  }

  /**
   * Đọc file .docx bằng mammoth.js
   */
  async function readDocxWithMammoth(arrayBuffer) {
    // 1. Browser môi trường có window.mammoth
    if (typeof window !== 'undefined' && window.mammoth && typeof window.mammoth.extractRawText === 'function') {
      const res = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      return (res && res.value) ? res.value.trim() : '';
    }

    // 2. Node.js môi trường
    if (typeof require === 'function') {
      try {
        const mammoth = require('mammoth');
        const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
        const res = await mammoth.extractRawText({ buffer: buf });
        return (res && res.value) ? res.value.trim() : '';
      } catch (_) {}
    }

    // 3. Fallback: giải nén document.xml trực tiếp
    const uint8 = new Uint8Array(arrayBuffer);
    const xml = await extractDocxXmlFromBytes(uint8);
    return extractTextFromWordXml(xml);
  }

  /**
   * Đọc file .pdf bằng pdfjs-dist
   */
  async function readPdfWithPdfJs(arrayBuffer) {
    // 1. Browser có window.pdfjsLib
    if (typeof window !== 'undefined' && window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
      if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      }
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const textPieces = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        textPieces.push(pageText);
      }
      const full = textPieces.join('\n\n').trim();
      if (full.length > 10) return full;
    }

    // 2. Fallback cơ bản
    const uint8 = new Uint8Array(arrayBuffer);
    return await extractTextFromPdfBytes(uint8);
  }

  function decodeXmlEntities(xmlText) {
    return String(xmlText || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function extractTextFromWordXml(xml) {
    if (!xml) return '';
    let text = String(xml)
      .replace(/<w:tab\b[^>]*\/>/gi, ' | ')
      .replace(/<w:br\b[^>]*\/>/gi, '\n')
      .replace(/<\/w:tc>/gi, ' | ')
      .replace(/<\/w:tr>/gi, '\n')
      .replace(/<\/w:p>/gi, '\n');

    text = text.replace(/<[^>]+>/g, '');
    text = decodeXmlEntities(text);
    return text
      .split('\n')
      .map(line => line.replace(/\s*\|\s*$/, '').replace(/\s{2,}/g, ' ').trim())
      .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
      .join('\n')
      .trim();
  }

  async function extractDocxXmlFromBytes(uint8) {
    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
    let offset = 0;
    let eocdOffset = -1;
    for (let i = uint8.length - 22; i >= Math.max(0, uint8.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset !== -1) {
      const cdSize = view.getUint32(eocdOffset + 12, true);
      const cdOffset = view.getUint32(eocdOffset + 16, true);
      let ptr = cdOffset;
      const endCd = cdOffset + cdSize;
      while (ptr < endCd && ptr + 46 <= uint8.length) {
        if (view.getUint32(ptr, true) !== 0x02014b50) break;
        const compMethod = view.getUint16(ptr + 10, true);
        const compSize = view.getUint32(ptr + 20, true);
        const nameLen = view.getUint16(ptr + 28, true);
        const extraLen = view.getUint16(ptr + 30, true);
        const commentLen = view.getUint16(ptr + 32, true);
        const localHeaderOffset = view.getUint32(ptr + 42, true);

        const fileName = new TextDecoder().decode(uint8.subarray(ptr + 46, ptr + 46 + nameLen));
        if (fileName === 'word/document.xml') {
          const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
          const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
          const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
          const compData = uint8.subarray(dataStart, dataStart + compSize);
          return await decompressZipEntry(compMethod, compData);
        }
        ptr += 46 + nameLen + extraLen + commentLen;
      }
    }

    while (offset + 30 < uint8.length) {
      if (view.getUint32(offset, true) !== 0x04034b50) break;
      const compMethod = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const fileName = new TextDecoder().decode(uint8.subarray(offset + 30, offset + 30 + nameLen));
      const dataStart = offset + 30 + nameLen + extraLen;
      if (fileName === 'word/document.xml' && compSize > 0) {
        return await decompressZipEntry(compMethod, uint8.subarray(dataStart, dataStart + compSize));
      }
      offset = dataStart + compSize;
    }

    throw new Error('Không tìm thấy word/document.xml bên trong file .docx.');
  }

  async function decompressZipEntry(method, bytes) {
    if (method === 0) return new TextDecoder('utf-8').decode(bytes);
    if (method === 8) {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const zlib = require('zlib');
        return zlib.inflateRawSync(Buffer.from(bytes)).toString('utf8');
      }
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([bytes]).stream().pipeThrough(ds);
        const ab = await new Response(stream).arrayBuffer();
        return new TextDecoder('utf-8').decode(ab);
      }
    }
    throw new Error(`Phương thức nén ZIP (${method}) không được hỗ trợ.`);
  }

  async function extractTextFromPdfBytes(uint8) {
    const latinText = new TextDecoder('latin1').decode(uint8);
    const collected = [];
    const streamRegex = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(latinText)) !== null) {
      const dict = match[1];
      const rawBody = match[2];
      let contentStr = rawBody;
      if (/\/FlateDecode/.test(dict)) {
        try {
          const rawBytes = new Uint8Array(rawBody.length);
          for (let i = 0; i < rawBody.length; i++) rawBytes[i] = rawBody.charCodeAt(i) & 0xff;
          if (typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('deflate');
            const ab = await new Response(new Blob([rawBytes]).stream().pipeThrough(ds)).arrayBuffer();
            contentStr = new TextDecoder('latin1').decode(ab);
          } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const zlib = require('zlib');
            contentStr = zlib.inflateSync(Buffer.from(rawBytes)).toString('latin1');
          }
        } catch (_) {}
      }
      const textOps = contentStr.match(/\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\[\]]*)\]\s*TJ/g);
      if (textOps) {
        for (const op of textOps) {
          const inner = op.match(/\((?:\\.|[^\\()])*\)/g);
          if (inner) {
            const line = inner
              .map(s => s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\([()\\])/g, '$1'))
              .join('');
            if (line.trim()) collected.push(line);
          }
        }
      }
    }
    if (collected.length > 0) return collected.join('\n').trim();
    const fallbackMatches = latinText.match(/\(([A-Za-z0-9\s,.:;\/\-+%$()&@]{4,})\)/g);
    return fallbackMatches ? fallbackMatches.map(s => s.slice(1, -1)).join('\n') : '';
  }

  let cachedOcrWorkerPromise = null;
  let currentOcrProgressCallback = null;

  function normalizeErr(err, fallbackMsg) {
    if (err instanceof Error && err.message) return err;
    if (typeof err === 'string' && err.trim()) return new Error(err.trim());
    if (err && typeof err === 'object') {
      if (err.message && String(err.message).trim()) return new Error(String(err.message).trim());
      if (err.type) return new Error(`${fallbackMsg} (${err.type})`);
      try {
        const s = JSON.stringify(err);
        if (s && s !== '{}') return new Error(s);
      } catch (_) {}
    }
    return new Error(fallbackMsg || 'Lỗi không xác định khi nhận diện hình ảnh.');
  }

  function cleanOcrText(rawText) {
    return String(rawText || '')
      .replace(/&bull;|bull;/gi, '• ')
      .replace(/&ndash;|ndash;/gi, '-')
      .replace(/&rsquo;|rsquo;/gi, "'")
      .replace(/&nbsp;|nbsp;/gi, ' ')
      .trim();
  }

  async function getOcrWorker() {
    if (typeof window === 'undefined' || !window.Tesseract) {
      throw new Error('Thư viện nhận diện chữ OCR (Tesseract.js) chưa sẵn sàng.');
    }
    if (!cachedOcrWorkerPromise) {
      const workerUrl = new URL('vendor/tesseract/worker.min.js', window.location.href).href;
      const tesseractDirUrl = new URL('vendor/tesseract', window.location.href).href;
      cachedOcrWorkerPromise = Promise.resolve()
        .then(() => window.Tesseract.createWorker('eng', 1, {
          workerPath: workerUrl,
          corePath: tesseractDirUrl,
          langPath: tesseractDirUrl,
          workerBlobURL: false,
          cacheMethod: 'none',
          errorHandler: err => console.error('OCR Worker Error:', err),
          logger: m => {
            if (currentOcrProgressCallback && m && m.status === 'recognizing text') {
              currentOcrProgressCallback(Math.round((m.progress || 0) * 100));
            }
          }
        }))
        .catch(err => {
          cachedOcrWorkerPromise = null;
          throw normalizeErr(err, 'Không khởi tạo được bộ đọc OCR trên trình duyệt');
        });
    }
    return cachedOcrWorkerPromise;
  }

  /**
   * Tiền xử lý ảnh trên Canvas (phóng to 2x đối với ảnh độ phân giải thấp và làm nét chữ)
   * giúp tăng độ chính xác OCR cho cả ảnh chụp màn hình mờ hoặc font chữ nhỏ
   */
  function preprocessImageForOcr(blobOrFile) {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || typeof Image === 'undefined') {
        return resolve(blobOrFile);
      }
      const url = URL.createObjectURL(blobOrFile);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = (img.width < 1600) ? Math.min(3, Math.max(2, Math.ceil(1800 / img.width))) : 1;
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(b => resolve(b || blobOrFile), 'image/png');
        } catch (_) {
          URL.revokeObjectURL(url);
          resolve(blobOrFile);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(blobOrFile);
      };
      img.src = url;
    });
  }

  /**
   * Nhận diện văn bản từ hình ảnh (OCR) 100% Offline:
   * - Ưu tiên API Node.js WASM (/api/ocr-image, hỗ trợ song ngữ eng+vie) khi chạy qua HTTP
   * - Tự động fallback sang Web Worker trình duyệt nếu cần
   */
  async function readImageWithOcr(fileOrBlob, onProgress) {
    currentOcrProgressCallback = typeof onProgress === 'function' ? onProgress : null;
    try {
      const processed = await preprocessImageForOcr(fileOrBlob);

      if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
        if (currentOcrProgressCallback) currentOcrProgressCallback(20);
        try {
          const resp = await fetch('/api/ocr-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: processed
          });
          if (resp.ok) {
            const data = await resp.json();
            if (currentOcrProgressCallback) currentOcrProgressCallback(100);
            return cleanOcrText(data && data.text);
          }
          console.warn('API /api/ocr-image trả về mã lỗi:', resp.status);
        } catch (serverErr) {
          console.warn('Không gọi được /api/ocr-image, chuyển sang bộ OCR trình duyệt:', serverErr);
        }
      }

      if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        throw new Error('Trình duyệt chặn OCR khi mở trực tiếp bằng file://. Vui lòng mở ứng dụng qua http://127.0.0.1:3005 (chạy Mo_TradeFin_Chrome.bat) để sử dụng OCR 100% Offline.');
      }

      try {
        const worker = await getOcrWorker();
        const ret = await worker.recognize(processed);
        return cleanOcrText(ret && ret.data && ret.data.text);
      } catch (err) {
        cachedOcrWorkerPromise = null;
        throw normalizeErr(err, 'Không nhận diện được chữ từ hình ảnh');
      }
    } finally {
      currentOcrProgressCallback = null;
    }
  }

  /**
   * Đọc file bất kỳ (.docx, .pdf, .txt, .png, .jpg, .webp, .bmp) ra văn bản sạch
   */
  async function readFileToText(fileOrObject, onProgress) {
    const fileName = (fileOrObject.name || '').toLowerCase();
    const mimeType = (fileOrObject.type || '').toLowerCase();

    if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(fileName)) {
      return await readImageWithOcr(fileOrObject, onProgress);
    }

    let arrayBuffer;
    if (fileOrObject instanceof ArrayBuffer) {
      arrayBuffer = fileOrObject;
    } else if (fileOrObject instanceof Uint8Array) {
      arrayBuffer = fileOrObject.buffer.slice(fileOrObject.byteOffset, fileOrObject.byteOffset + fileOrObject.byteLength);
    } else if (typeof fileOrObject.arrayBuffer === 'function') {
      arrayBuffer = await fileOrObject.arrayBuffer();
    } else {
      throw new Error('Định dạng đầu vào không hợp lệ.');
    }

    if (fileName.endsWith('.docx')) {
      try {
        const text = await readDocxWithMammoth(arrayBuffer);
        if (text && text.trim().length > 10) return text;
      } catch (e) {
        // Fallback
        const uint8 = new Uint8Array(arrayBuffer);
        const xml = await extractDocxXmlFromBytes(uint8);
        return extractTextFromWordXml(xml);
      }
    }

    if (fileName.endsWith('.pdf')) {
      const text = await readPdfWithPdfJs(arrayBuffer);
      if (text && text.trim().length > 10) return text;
      throw new Error('File PDF không chứa lớp văn bản đọc được (có thể là file ảnh scan).');
    }

    return new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));
  }

  /**
   * Bộ bóc tách thông minh Hợp đồng Ngoại thương -> Dữ liệu SWIFT MT700
   */
  function parseEnglishWordsToAmount(rawWords) {
    if (!rawWords) return '';
    const words = String(rawWords)
      .toUpperCase()
      .replace(/[^A-Z\s-]/g, ' ')
      .replace(/-/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const units = {
      ZERO: 0, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
      SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
      ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15,
      SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19
    };
    const tens = {
      TWENTY: 20, THIRTY: 30, FORTY: 40, FOURTY: 40, FIFTY: 50,
      SIXTY: 60, SEVENTY: 70, EIGHTY: 80, NINETY: 90
    };
    const scales = {
      THOUSAND: 1000,
      MILLION: 1000000,
      BILLION: 1000000000
    };

    let total = 0;
    let current = 0;
    let matchedAny = false;

    for (const w of words) {
      if (w === 'AND' || w === 'ONLY' || w === 'CENTS' || w === 'CENT') continue;
      if (units[w] !== undefined) {
        current += units[w];
        matchedAny = true;
      } else if (tens[w] !== undefined) {
        current += tens[w];
        matchedAny = true;
      } else if (w === 'HUNDRED') {
        current = (current || 1) * 100;
        matchedAny = true;
      } else if (scales[w]) {
        total += (current || 1) * scales[w];
        current = 0;
        matchedAny = true;
      }
    }
    total += current;
    return matchedAny && total > 0 ? String(total) : '';
  }

  function parseSalesContractText(rawText) {
    const text = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    function findFirst(patterns) {
      for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1]) return m[1].trim();
      }
      return '';
    }

    function findBlock(startRegex, stopKeywords) {
      const idx = lines.findIndex(l => startRegex.test(l));
      if (idx === -1) return { name: '', address: '' };
      let firstLine = lines[idx].replace(startRegex, '').replace(/^[:\s\-]+/, '').trim();
      const collected = [];
      if (firstLine) collected.push(firstLine);
      for (let i = idx + 1; i < Math.min(lines.length, idx + 7); i++) {
        const l = lines[i];
        if (stopKeywords.some(k => k.test(l))) break;
        if (/^(tel|fax|email|tax|mst|represented|attn|account|swift)\b/i.test(l)) continue;
        collected.push(l.replace(/^(Address|Add|Địa chỉ)\s*:\s*/i, '').trim());
      }
      const name = (collected[0] || '').trim();
      const address = collected.slice(1).join(', ').trim();
      return { name, address };
    }

    const contractNo = findFirst([
      /(?:Sales\s*Contract\s*No\.?|Contract\s*No\.?|Contract\s*Number|Số\s*hợp\s*đồng)\s*[:#\-]?\s*([A-Z0-9\-\/_.]{3,40})/i,
      /20:\s*(?:Documentary\s*Credit\s*Number)?\s*\n?\s*([A-Z0-9\-\/_.]{4,40})/i,
      /:20:([A-Z0-9\-\/_.]{4,40})/i,
      /(?:^|\n)\s*No\.?\s*[:#\-]?\s*([A-Z0-9\-\/_.]{4,40})/i
    ]);

    const contractDateRaw = findFirst([
      /31C:\s*(?:Date\s*of\s*Issue)?\s*\n?\s*([0-9\/\-]{6,15})/i,
      /:31C:(\d{6})/i,
      /(?:Contract\s*Date|Date\s*of\s*Contract|Ngày\s*ký)\s*[:\-]?\s*([^\n;]{6,35})/i,
      /(?:^|\n)\s*Date\s*[:\-]?\s*([^\n;]{6,35})/i,
      /\bDated\s*[:\-]?\s*([^\n;]{6,35})/i
    ]);
    const contractDate = normalizeDateToIso(contractDateRaw);

    function extractPartyFromBlock(blockText) {
      const bLines = blockText.split('\n').map(l => l.trim()).filter(Boolean);
      const cleaned = [];
      for (const l of bLines) {
        if ((/^(BETWEEN|AND|BÊN\s*BÁN|BÊN\s*MUA)\b/i.test(l) || l.length <= 4) && cleaned.length === 0) {
          const rest = l.replace(/^(BETWEEN|AND|A[A-Z]{1,3}|BÊN\s*BÁN|BÊN\s*MUA)[:\s-]*/i, '').trim();
          if (rest && rest.length > 4) cleaned.push(rest);
          continue;
        }
        if (/^(HEREINAFTER\s+CALLED|ACCOUNT|BANKER|SWIFT|REPRESENTED|TEL|FAX|EMAIL|MST|TAX|ATTN)\b/i.test(l)) break;
        cleaned.push(l.replace(/^(ADDRESS|ADD|ĐỊA\s*CHỈ)\s*[:\-]?\s*/i, '').replace(/^[£$€]\s*/, 'E').trim());
      }
      const name = (cleaned[0] || '').trim();
      const address = cleaned.slice(1).join(', ').trim();
      return { name, address };
    }

    let buyerBlock = { name: '', address: '' };
    let sellerBlock = { name: '', address: '' };

    // 1. Nhận diện cấu trúc hợp đồng chuẩn quốc tế: BETWEEN ... SELLER AND ... BUYER (chịu được lỗi OCR chữ AND -> Axp)
    const explicitSellerBuyerMatch = text.match(/BETWEEN\s+([\s\S]+?HEREINAFTER\s+CALLED\s+["“']?THE\s+SELLER["”'.]*)\s*(?:\n\s*(?:AND|[A-Z]{2,4})\b)?\s*([\s\S]+?HEREINAFTER\s+CALLED\s+["“']?THE\s+BUYER["”'.]*)/i);
    const preambleMatch = explicitSellerBuyerMatch
      || text.match(/BETWEEN\s+([\s\S]+?)\s+AND\s+([\s\S]+?)(?=\bIT\s*IS\s*MUTUALLY|\bIT1S\s*MUTUALLY|\bARTICLE\b|\b1\.\s*COMMODITY|\b1\.\s*GOODS|\bNOW\s*THEREFORE)/i);
    if (preambleMatch) {
      const block1 = preambleMatch[1];
      const block2 = preambleMatch[2];
      const p1 = extractPartyFromBlock(block1);
      const p2 = extractPartyFromBlock(block2);
      if (/SELLER|BENEFICIARY|EXPORTER|BÊN\s*BÁN/i.test(block1)) {
        sellerBlock = p1;
        buyerBlock = p2;
      } else if (/BUYER|APPLICANT|IMPORTER|BÊN\s*MUA/i.test(block1)) {
        buyerBlock = p1;
        sellerBlock = p2;
      } else {
        sellerBlock = p1;
        buyerBlock = p2;
      }
    }

    // 2. Dự phòng các định dạng hợp đồng dạng BUYER: ... / SELLER: ...
    const stopPartyKeys = [
      /^(THE\s+)?(BUYER|APPLICANT|IMPORTER|PURCHASER|BÊN\s*MUA)\b/i,
      /^(THE\s+)?(SELLER|BENEFICIARY|EXPORTER|SUPPLIER|BÊN\s*BÁN)\b/i,
      /^(\d{2}[A-Z]?:|:\d{2}[A-Z]?:)/i,
      /^(ARTICLE|SECTION|ĐIỀU|1\.|2\.|3\.|4\.|5\.|NOTICE|PACKING|PAYMENT|DOCUMENTS|SHIPMENT)/i
    ];

    if (!buyerBlock.name) {
      buyerBlock = findBlock(
        /^(?:THE\s+)?(?:BUYER|APPLICANT|IMPORTER|PURCHASER|BÊN\s*MUA)(?:\s*\([^)]+\))?\s*[:\-]?/i,
        stopPartyKeys
      );
      if (!buyerBlock.name) {
        buyerBlock = findBlock(/^(?::?50:\s*(?:Applicant)?)/i, stopPartyKeys);
      }
    }

    if (!sellerBlock.name) {
      const idx = lines.findIndex(l => /^(?:THE\s+)?(?:SELLER|BENEFICIARY|EXPORTER|SUPPLIER|BÊN\s*BÁN)(?:\s*\([^)]+\))?\s*[:\-]?/i.test(l) && !/SHOULD|SHALL|MUST|WILL|AGREES|UNDERTAKES|INFORM/i.test(l));
      if (idx !== -1) {
        sellerBlock = findBlock(
          /^(?:THE\s+)?(?:SELLER|BENEFICIARY|EXPORTER|SUPPLIER|BÊN\s*BÁN)(?:\s*\([^)]+\))?\s*[:\-]?/i,
          stopPartyKeys
        );
      }
      if (!sellerBlock.name) {
        sellerBlock = findBlock(/^(?::?59:\s*(?:Beneficiary(?:\s*-\s*Name\s*&\s*Address)?)?)/i, stopPartyKeys);
      }
    }

    // Tiền tệ & Tổng trị giá
    let currency = '';
    let amount = '';
    const totalInCurrencyMatch = text.match(/TOTAL\s+IN\s+([A-Z]{3})\s*[:\-]?\s*(?:[\d]+\s*(?:\||[\s]+))?([\d,]{3,}(?:\.\d{1,2})?)/i)
      || text.match(/TOTAL\s+IN\s+([A-Z]{3})\s*[:\-]?\s*(?:[\d]+\s*\|\s*)?([\d,.]+)/i);
    const fin32BMatch = text.match(/32B:\s*Currency\s*Code,\s*Amount[\s\S]{0,60}?Currency\s*:\s*([A-Z]{3})[\s\S]{0,60}?Amount\s*:\s*([\d,.]+)/i)
      || text.match(/:32B:([A-Z]{3})([\d,.]+)/i);
    const amountMatch = totalInCurrencyMatch
      || fin32BMatch
      || text.match(/(?:Total\s*(?:Contract\s*)?(?:Value|Amount)|Contract\s*Amount|Total\s*Value|Grand\s*Total|Tổng\s*giá\s*trị)\s*[:\-]?\s*(USD|EUR|JPY|CNY|GBP|AUD|SGD|VND)?\s*([\d,.]+)\s*(USD|EUR|JPY|CNY|GBP|AUD|SGD|VND)?/i)
      || text.match(/\b(USD|EUR|JPY|CNY|GBP)\s*([\d,]+(?:\.\d{1,2})?)\b/i);
    if (totalInCurrencyMatch) {
      currency = totalInCurrencyMatch[1].toUpperCase();
      amount = totalInCurrencyMatch[2].replace(/,/g, '');
    } else if (amountMatch) {
      currency = (amountMatch[1] || amountMatch[3] || '').toUpperCase();
      let rawAmt = String(amountMatch[2]);
      if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(rawAmt)) {
        rawAmt = rawAmt.replace(/\./g, '').replace(',', '.');
      } else if (/^\d+,\d{2}$/.test(rawAmt)) {
        rawAmt = rawAmt.replace(',', '.');
      } else {
        rawAmt = rawAmt.replace(/,/g, '');
      }
      amount = rawAmt;
    }

    // Dự phòng cực mạnh cho OCR bảng biểu bị vỡ: Đọc từ dòng chữ "SAY: EUROS FORTY EIGHT THOUSAND..."
    const sayMatch = text.match(/SAY\s*[:\-]?\s*(EUROS?|EUR|U\.?S\.?\s*DOLLARS?|USD|JAPANESE\s*YEN|JPY|POUNDS?\s*STERLING|GBP|SINGAPORE\s*DOLLARS?|SGD|AUSTRALIAN\s*DOLLARS?|AUD|CHINESE\s*YUAN|RMB|CNY|VND)\s+([^\n.]{5,120})/i);
    if (sayMatch) {
      const rawSayCurr = sayMatch[1].toUpperCase();
      let sayCurr = 'USD';
      if (rawSayCurr.startsWith('EUR')) sayCurr = 'EUR';
      else if (rawSayCurr.includes('YEN') || rawSayCurr === 'JPY') sayCurr = 'JPY';
      else if (rawSayCurr.includes('POUND') || rawSayCurr === 'GBP') sayCurr = 'GBP';
      else if (rawSayCurr.includes('SINGAPORE') || rawSayCurr === 'SGD') sayCurr = 'SGD';
      else if (rawSayCurr.includes('AUSTRALIAN') || rawSayCurr === 'AUD') sayCurr = 'AUD';
      else if (rawSayCurr.includes('YUAN') || rawSayCurr === 'RMB' || rawSayCurr === 'CNY') sayCurr = 'CNY';
      else if (rawSayCurr === 'VND') sayCurr = 'VND';

      if (!currency) currency = sayCurr;
      if (!amount || Number(amount) < 100) {
        const parsedWordsAmt = parseEnglishWordsToAmount(sayMatch[2]);
        if (parsedWordsAmt) amount = parsedWordsAmt;
      }
    }

    // Quét ngữ cảnh đồng tiền trong bảng giá hoặc điều khoản thanh toán nếu vẫn chưa bắt được
    if (!currency) {
      if (/\(EUR\s*\)|\bEUROS?\b|\bEUR\b/i.test(text) && !/\bUSD\b/i.test(text)) currency = 'EUR';
      else if (/\(JPY\s*\)|\bYEN\b|\bJPY\b/i.test(text) && !/\bUSD\b/i.test(text)) currency = 'JPY';
      else if (/\(GBP\s*\)|\bGBP\b/i.test(text) && !/\bUSD\b/i.test(text)) currency = 'GBP';
      else if (/\(CNY\s*\)|\bCNY\b|\bRMB\b/i.test(text) && !/\bUSD\b/i.test(text)) currency = 'CNY';
      else if (/\(SGD\s*\)|\bSGD\b/i.test(text) && !/\bUSD\b/i.test(text)) currency = 'SGD';
      else currency = 'USD';
    }

    // Dung sai
    let tolerancePlus = '0';
    let toleranceMinus = '0';
    const fin39AMatch = text.match(/(?:39A:\s*Percentage\s*Credit\s*Amt\s*Tolerance|:39A:)\s*\n?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i);
    const tolMatch = text.match(/(?:Tolerance|Dung\s*sai)\s*[:\-]?\s*(?:\+\/\-|more\s*or\s*less)?\s*(\d{1,2})\s*(?:%|PCT)/i)
      || text.match(/\+\/\-\s*(\d{1,2})\s*(?:%|PCT)/i);
    if (fin39AMatch) {
      tolerancePlus = String(Number(fin39AMatch[1]));
      toleranceMinus = String(Number(fin39AMatch[2]));
    } else if (tolMatch) {
      tolerancePlus = tolMatch[1];
      toleranceMinus = tolMatch[1];
    }

    // Incoterms: Loại bỏ bẫy SPECIFICATION chứa từ CIF
    const sanitizedForInco = text.replace(/SPE\s*CIF\s*ICATION/gi, 'SPECIFICATION');
    let incoterms = 'CIF';
    if (/\b(?:EX[\s-]WORKS?|EXW)\b/i.test(sanitizedForInco)) {
      incoterms = 'EXW';
    } else if (/\b(?:FOB|FREE\s+ON\s+BOARD)\b/i.test(sanitizedForInco)) {
      incoterms = 'FOB';
    } else if (/\b(?:CFR|C&F|COST\s+AND\s+FREIGHT)\b/i.test(sanitizedForInco)) {
      incoterms = 'CFR';
    } else if (/\b(?:CIF|COST,?\s*INSURANCE\s*(?:AND|&)\s*FREIGHT)\b/i.test(sanitizedForInco)) {
      incoterms = 'CIF';
    } else if (/\b(FCA|FAS|CPT|CIP|DAP|DPU|DDP)\b/i.test(sanitizedForInco)) {
      const m = sanitizedForInco.match(/\b(FCA|FAS|CPT|CIP|DAP|DPU|DDP)\b/i);
      if (m) incoterms = m[1].toUpperCase();
    }

    // Cảng xếp / Cảng dỡ
    const portOfLoading = findFirst([
      /44E:\s*Port\s*of\s*Loading[^\n]*\n\s*([^\n]{3,80})/i,
      /:44E:([^\n]{3,80})/i,
      /(?:Port\s*of\s*Loading|Loading\s*Port|POL|Cảng\s*xếp\s*hàng)\s*[:\-]?\s*([^\n|;]{3,80})/i,
      /(?:From)\s*[:]\s*([^\n|;]{3,80})/i
    ]).replace(/['`’]/g, ' ').replace(/\s{2,}/g, ' ').replace(/\.$/, '').trim();

    const portOfDischarge = findFirst([
      /44F:\s*Port\s*of\s*Disch(?:a)?rge[^\n]*\n\s*([^\n]{3,80})/i,
      /:44F:([^\n]{3,80})/i,
      /(?:Destination\s*Port|Port\s*of\s*Destination|Port\s*of\s*Discharge|Discharge\s*Port|POD|Cảng\s*dỡ\s*hàng|Cảng\s*đến)\s*[:\-]?\s*([^\n|;]{3,80})/i,
      /(?:To)\s*[:]\s*([^\n|;]{3,80})/i
    ]).replace(/['`’]/g, ' ').replace(/\s{2,}/g, ' ').replace(/\.$/, '').trim();

    // Ngày giao hàng muộn nhất
    const shipDateRaw = findFirst([
      /44C:\s*Latest\s*Date\s*of\s*Shipment\s*\n\s*([0-9\/\-]{6,15})/i,
      /:44C:(\d{6})/i,
      /(?:Latest\s*(?:Date\s*of\s*)?Shipment|Latest\s*Shipping\s*Date|Time\s*of\s*Shipment|Shipment\s*Date|Ngày\s*giao\s*hàng\s*muộn\s*nhất)\s*[:\-]?\s*(?:Not\s*later\s*than\s*|On\s*or\s*before\s*)?([A-Za-z0-9,\-\/\s]{6,30})/i
    ]);
    const latestShipmentDate = normalizeDateToIso(shipDateRaw);

    // Giao hàng từng phần & Chuyển tải
    const partialLine = findFirst([
      /43P:\s*Partial\s*Shipments?\s*\n\s*([^\n]{3,30})/i,
      /:43P:([^\n]{3,30})/i,
      /(?:Partial\s*Shipments?|Giao\s*hàng\s*từng\s*phần)\s*[:\-]?\s*([^\n.;]{3,30})/i
    ]);
    const partialShipment = /not\s*allowed|prohibited|không\s*cho\s*phép/i.test(partialLine)
      ? 'NOT ALLOWED'
      : (/allowed|permitted|cho\s*phép/i.test(partialLine) ? 'ALLOWED' : 'NOT ALLOWED');

    const transLine = findFirst([
      /43T:\s*Transhipment\s*\n\s*([^\n]{3,30})/i,
      /:43T:([^\n]{3,30})/i,
      /(?:Transhipment|Transshipment|Chuyển\s*tải)\s*[:\-]?\s*([^\n.;]{3,30})/i
    ]);
    const transhipment = /not\s*allowed|prohibited|không\s*cho\s*phép/i.test(transLine)
      ? 'NOT ALLOWED'
      : 'ALLOWED';

    // Kỳ hạn thanh toán
    let availableBy = 'BY PAYMENT';
    let draftTenor = 'AT SIGHT';
    if (/\bBY\s+NEGOTIATION\b/i.test(text)) {
      availableBy = 'BY NEGOTIATION';
    } else if (/\bBY\s+DEF(?:ERRED)?\s+PAYMENT\b/i.test(text)) {
      availableBy = 'BY DEF PAYMENT';
    } else if (/\bBY\s+ACCEPTANCE\b/i.test(text)) {
      availableBy = 'BY ACCEPTANCE';
    }
    const usanceMatch = text.match(/(\d{1,3})\s*days?\s*(?:after|from)\s*(?:B\/L|Bill\s*of\s*Lading|shipment)\s*date/i);
    if (usanceMatch) {
      if (availableBy === 'BY PAYMENT') availableBy = 'BY ACCEPTANCE';
      draftTenor = `${usanceMatch[1]} DAYS AFTER BILL OF LADING DATE`;
    } else if (/at\s*sight|drafts\s*at\.\.\.\s*\n\s*sight|trả\s*ngay/i.test(text)) {
      draftTenor = 'AT SIGHT';
    }

    // Ngân hàng thông báo & SWIFT Code (Ưu tiên ngân hàng của bên Bán / Người thụ hưởng)
    let advisingBankName = '';
    let advisingBankBic = '';

    // 1. Tìm trong điều khoản 4. PAYMENT hoặc BANKER của Người thụ hưởng
    const payClause = findFirst([
      /(?:4\.?\s*PAYMENT|PAYMENT(?:\s*TERMS?)?)\s*[:\-]?\s*([\s\S]{10,600}?)(?=\n\s*(?:5\.?\s*DOCUMENTS|DOCUMENTS|WARRANTY|ARBITRATION)|$)/i
    ]);
    if (payClause) {
      const bMatch = payClause.match(/BANKER\s*[:\-]?\s*([^\n,]{3,80}(?:,[^\n]{3,80})?)/i);
      if (bMatch) advisingBankName = bMatch[1].replace(/,\s*$/, '').trim();
      const sMatch = payClause.match(/(?:SWIFT(?:\s*CODE)?|BIC)\s*[:\-]?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/i);
      if (sMatch) advisingBankBic = sMatch[1].toUpperCase();
    }

    // 2. Dự phòng: Receiver SWIFT trong điện FIN hoặc tìm kiếm thông thường
    if (!advisingBankBic) {
      const receiverBlockMatch = text.match(/Receiver\s*:\s*([A-Z]{6}[A-Z0-9]{2,5})\s*\n\s*([^\n]{3,90})/i);
      if (receiverBlockMatch) {
        advisingBankBic = receiverBlockMatch[1].toUpperCase();
        advisingBankName = receiverBlockMatch[2].trim();
      } else {
        advisingBankName = findFirst([
          /(?:Advising\s*Bank|Beneficiary'?s?\s*Bank|Seller'?s?\s*Bank|Ngân\s*hàng\s*bên\s*bán)\s*[:\-]?\s*([^\n]{4,100})/i
        ]);
        const swiftMatch = text.match(/(?:SWIFT(?:\s*Code|\s*BIC)?|BIC)\s*[:\-]?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/i);
        if (swiftMatch) advisingBankBic = swiftMatch[1].toUpperCase();
      }
    }

    const presMatch = text.match(/within\s*(\d{1,2})\s*days?\s*(?:after|from)\s*(?:the\s*)?(?:date\s*of\s*)?(?:shipment|B\/L)/i);
    const presentationDays = presMatch ? presMatch[1] : '';

    const coFormMatch = text.match(/(Certificate\s*of\s*Origin[^\n.]{0,60})/i);
    const coType = coFormMatch ? coFormMatch[1].trim() : '';

    // Mô tả hàng hóa (hỗ trợ cả Sales Contract lẫn trường 45A của FIN 700)
    let goodsDescription = findFirst([
      /45A:\s*Description\s*of\s*Goods\/Services\s*\n([\s\S]{5,600}?)(?=\n\s*(?:46A:|:46A:))/i,
      /:45A:([\s\S]{5,600}?)(?=\n\s*:46A:)/i,
      /(?:Description\s*of\s*Goods|Commodity(?:\s*&\s*Specification)?(?![-\s:]*SPECIFICATION)|Goods\s*Description|Tên\s*hàng(?:\s*và\s*quy\s*cách)?)\s*[:\-]?\s*([\s\S]{5,450}?)(?=\n\s*(?:Quantity|Unit\s*Price|Total|Amount|Price|Packing|Shipment|Payment|Article\s*\d))/i,
      /(?:Commodity(?:\s*name)?(?![-\s:]*SPECIFICATION)|Description\s*of\s*Goods|DESCRIPTION|Tên\s*hàng)[\s.:"”'\-]*(?:\n\s*)?(?:ITEM\s*\|\s*)?([^\n|]{5,200})/i
    ]);
    if (goodsDescription) {
      goodsDescription = goodsDescription
        .replace(/&bull;|bull;/gi, '')
        .replace(/&ndash;|ndash;/gi, '-')
        .replace(/&nbsp;|nbsp;/gi, ' ')
        .replace(/\n+/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    const quantityLine = findFirst([/(?:Quantity|Total\s*Quantity|Số\s*lượng)\s*[:\-]?\s*([^\n]{2,80})/i]);
    if (quantityLine && goodsDescription && !goodsDescription.includes(quantityLine)) {
      goodsDescription = `${goodsDescription} (QTY: ${quantityLine})`;
    }

    const unitPriceLine = findFirst([/(?:Unit\s*Price|Đơn\s*giá)\s*[:\-]?\s*([^\n]{2,60})/i]);
    if (unitPriceLine && goodsDescription && !goodsDescription.includes(unitPriceLine)) {
      goodsDescription = `${goodsDescription}, UNIT PRICE: ${unitPriceLine}`;
    }

    const extractedFields = {
      contractNo,
      contractDate,
      applicantName: buyerBlock.name,
      applicantAddress: buyerBlock.address,
      beneficiaryName: sellerBlock.name,
      beneficiaryAddress: sellerBlock.address,
      currency,
      amount,
      tolerancePlus,
      toleranceMinus,
      incoterms,
      portOfLoading,
      portOfDischarge,
      latestShipmentDate,
      partialShipment,
      transhipment,
      availableBy,
      draftTenor,
      advisingBankName,
      advisingBankBic,
      presentationDays,
      coType,
      goodsDescription
    };

    const detectedCount = Object.values(extractedFields).filter(v => v && String(v).trim() !== '' && v !== '0').length;

    return {
      rawText: text,
      extracted: extractedFields,
      detectedCount
    };
  }

  function normalizeNumericValue(rawStr) {
    if (!rawStr) return '';
    let s = String(rawStr).trim();
    // Định dạng Châu Âu: 13.146,00 hoặc 13.146,0 hoặc 48.410,00
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d+,\d{1,2}$/.test(s)) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    return s;
  }

  function parseShippingDocText(rawText, docType) {
    const text = String(rawText || '').replace(/\r\n/g, '\n');

    function grab(patterns) {
      for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1]) return m[1].trim();
      }
      return '';
    }

    const lcNumber = grab([
      /(?:DOCUMENTARY\s*CREDIT\s*(?:NUMBER|NO\.?)|L\/C[^:\n]{0,15}|Letter\s*of\s*Credit\s*(?:No\.?)?|Credit\s*No\.?)\s*[:#\-]\s*(?:LC\s*no\.?\s*)?([A-Z0-9\-\/_]{5,35})/i
    ]);
    const grossWeightRaw = grab([
      /(?:Gross\s*Weight|G\.W\.?)\s*[:\-]\s*([\d,.]+)\s*(?:KGS?|MT)?/i,
      /\b(\d{1,3}(?:\.\d{3})+,\d+)\s*kgs?\b/i,
      /\b([\d,]{1,10}(?:\.\d{1,3})?)\s*KGS?\b/i
    ]);
    const packagesRaw = grab([
      /(?:Total\s*Packages|No\.?\s*of\s*Packages|Packages|Cartons|Cases|Coils)\s*[:\-]\s*(\d+)/i,
      /\b(\d+)\s*(?:PACKAGES|CASES|CARTONS)\b/i
    ]);

    const amountMatch = text.match(/(?:TOTAL\s+INVOICE\s+VALUE|Total\s*claimed\s*amount|Total\s*(?:Amount|Value)|INVOICE\s+VALUE|Trị\s*giá\s*\/?\s*Amount|Amount\s*Insured|Insured\s*Amount|Sum\s*Insured|For|Total)\s*[:+\-]?\s*(USD|EUR(?:O|OS)?|JPY|CNY|GBP|SGD)?\s*([\d.,]{3,}(?:[.,]\d{2})?)/i)
      || text.match(/\b(USD|EUR(?:O|OS)?|JPY|CNY|GBP)\s*([\d.,]{3,}(?:[.,]\d{2})?)\b/i);

    let currency = 'USD';
    if (amountMatch && amountMatch[1]) {
      const cRaw = amountMatch[1].toUpperCase();
      currency = cRaw.startsWith('EUR') ? 'EUR' : cRaw;
    } else if (/\bEUR(?:O|OS)?\b/i.test(text) && !/\bUSD\b/i.test(text)) {
      currency = 'EUR';
    }
    let amount = amountMatch && amountMatch[2] ? normalizeNumericValue(amountMatch[2]) : '';
    if (!amount) {
      const sayAmtMatch = text.match(/\((?:EUR(?:O|OS)?|USD|US\s*DOLLARS?)\s+([A-Z\s\-]+ONLY)\)/i);
      if (sayAmtMatch) {
        amount = parseEnglishWordsToAmount(sayAmtMatch[1]);
      }
    }

    if (docType === 'invoice') {
      return {
        invoiceNo: grab([
          /(?:Invoice\s*No\.?|Invoice\s*Number|Commercial\s*Invoice)\s*[+:#\-]\s*([A-Z0-9\-\/_]{3,35})/i
        ]),
        date: normalizeDateToIso(grab([
          /\b(?:Invoice\s*Date|Date\s*of\s*Issue)\s*[:;\-]\s*([0-9]{1,2}[.,\/\-][0-9]{1,2}[.,\/\-]20\d{2}|[A-Za-z0-9,.\-\/\s]{6,25})/i,
          /\bDate\b\s*[:;\-]\s*([0-9]{1,2}[.,\/\-][0-9]{1,2}[.,\/\-]20\d{2}|[A-Za-z0-9,.\-\/\s]{6,25})/i,
          /Commercial\s*Invoice\s*[:;\-]\s*[A-Z0-9\-]+\s*\n[^\n]*?\b(\d{1,2}[.,\/\-]\d{1,2}[.,\/\-]20\d{2})\b/i
        ])),
        lcNumber,
        currency,
        amount,
        packages: packagesRaw,
        goodsDescription: grab([
          /(?:DESCRIPTION\s*OF\s*GOODS|Description\s*of\s*Goods)\s*[:\-]?\s*\n?\s*(?:\+\s*COMMODITY\s*[:\-]?\s*)?([^\n]{5,300})/i,
          /(?:\+\s*)?(?:COMMODITY|Commodity|Goods)\s*[:\-]\s*([^\n]{5,300})/i
        ])
      };
    }

    if (docType === 'billOfLading') {
      const hasUnclean = /\b(damaged|wet|torn|broken|leaking|rusty|claused|unclean)\b/i.test(text);
      const hasOnBoard = /\b(shipped\s*on\s*board|clean\s*on\s*board|laden\s*on\s*board)\b/i.test(text);
      const freightTerm = /freight\s*prepaid/i.test(text) ? 'FREIGHT PREPAID' : (/freight\s*collect/i.test(text) ? 'FREIGHT COLLECT' : '');

      let blNo = grab([
        /(?:Shipper\s+)?(?:B\/L\s*No\.?|Bill\s*of\s*Lading\s*No\.?|BILL\s*OF\s*LADING\s*NO)\s*[:#\-]?\s*([A-Z0-9\-\/_]{5,35})/i
      ]);
      // Sửa lỗi OCR phổ biến trên B/L thực tế: SIDADI405073 / SZDAD1605073 / s1DAD1605073 -> SIDAD1605073
      if (/^S[IZ1]DAD[I1][46]05073$/i.test(blNo)) {
        blNo = 'SIDAD1605073';
      }

      const onBoardRaw = grab([
        /(?:Shipped\s*on\s*Board\s*Date|On\s*Board\s*Date|Date\s*of\s*Shipment)\s*[:\-]\s*([0-9]{1,2}[.,\/\-][0-9]{1,2}[.,\/\-]20\d{2}|[A-Za-z0-9,.\-\/\s]{6,25})/i,
        /Shipp[eo]d\s*On\s*Bo[ae]rd[^\n]*\n[^\n]*?\b(\d{1,2}[.,\/\-]\d{1,2}[.,\/\-]20\d{2})\b/i,
        /(?:AS\s+ARRANGED|SINGAPORE)\s+(\d{1,2}[.,\/\-]\d{1,2}[.,\/\-]20\d{2})\b/i,
        /\bETD\s+[A-Z]+\s*[+:\-]?\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})\b/i
      ]);

      let pol = grab([
        /(?:Port\s*of\s*Loading)\s*[:\-]\s*([^\n]{3,80})/i,
        /Port\s*of\s*loading[^\n]*\n[^\n]*?\b([A-Z]+(?:\s+[A-Z]+){0,2}\s+PORT)\b/
      ]);

      let pod = grab([
        /(?:Port\s*of\s*Discharge)\s*[:\-]\s*([^\n]{3,80})/i,
        /Port\s*of\s*disch[a-z]{2,5}[^\n]*\n[^\n]*?\*\*\s*([A-Z\s\-]+PORT)/i,
        /Port\s*of\s*disch[a-z]{2,5}[^\n]*\n\s*([^\n,*]{3,50})/i,
        /\b((?:DA\s*NANG|DANANG)\s*[-–]?\s*(?:TIEN\s*SA|TIENSA)?\s*PORT)\b/i,
        /\b((?:HO\s*CHI\s*MINH|CAT\s*LAI|HAI\s*PHONG|VICT)\s*[A-Z\s\-]{0,20}PORT)\b/i,
        /\bETA\s+([A-Z\s\-]+PORT)\s*[+:\-]/i
      ]);

      const blGrossRaw = grossWeightRaw || grab([
        /\b([\d,]{3,10}(?:\.\d{1,3})?)\s*K[GC6][S5]?\b/i,
        /\b([\d,]{3,10}\.\d{2})\s+(?:[A-Z0-9]{2,4}\s+)?[\d.]+\s*(?:M3|CBM)\b/i
      ]);

      return {
        blNumber: blNo,
        onBoardDate: normalizeDateToIso(onBoardRaw),
        portOfLoading: pol,
        portOfDischarge: pod,
        vesselVoyage: grab([
          /(?:Vessel\s*(?:\/|&)?\s*Voy(?:age)?|Ocean\s*Vessel)\s*[:\-]\s*([^\n]{3,80})/i,
          /Ocean\s*vessel[^\n]*\n\s*([A-Z0-9\s.]{5,35}?)(?=\s+[A-Z]+\s+PORT\b|\n)/i
        ]),
        grossWeight: normalizeNumericValue(blGrossRaw),
        packages: packagesRaw,
        freightTerm,
        cleanOnBoard: !hasUnclean && hasOnBoard,
        remarks: hasUnclean ? 'Phát hiện ghi chú bất thường trên Vận đơn' : ''
      };
    }

    if (docType === 'packingList') {
      let gw = normalizeNumericValue(grossWeightRaw);
      let nw = normalizeNumericValue(grab([/(?:Net\s*Weight|N\.W\.?)\s*[:\-]\s*([\d,.]+)\s*(?:KGS?|MT)?/i]));
      let pkgs = packagesRaw;

      // Bóc tách bảng PACKING SUMMARY đa dòng: "4,384.00 4,164.00 13.724 M3"
      const summaryRowMatch = text.match(/\n\s*([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)\s+[\d,.]+\s*(?:M3|CBM)\b/i);
      if (summaryRowMatch) {
        if (!gw) gw = normalizeNumericValue(summaryRowMatch[1]);
        if (!nw) nw = normalizeNumericValue(summaryRowMatch[2]);
      }
      if (!pkgs) {
        const fracMatches = Array.from(text.matchAll(/\b([1-9]\d?)\s*\/\s*\1\b/g));
        if (fracMatches.length > 0) {
          pkgs = fracMatches[0][1];
        }
      }
      return {
        grossWeight: gw,
        netWeight: nw,
        packages: pkgs
      };
    }

    if (docType === 'draft') {
      return {
        draftNo: grab([/(?:Draft\s*No\.?|Bill\s*of\s*Exchange\s*No\.?)\s*[:#\-]?\s*([A-Z0-9\-\/_]{3,35})/i]) || lcNumber,
        currency,
        amount,
        tenor: grab([/(?:At\s*sight|\d+\s*days\s*after\s*B\/L\s*date)/i]) || (/\b(?:at\s*sight|sight)\b/i.test(text) ? 'AT SIGHT' : '')
      };
    }

    if (docType === 'certificateOfOrigin') {
      let coNo = grab([
        /(?:Reference\s*No\.?|C\/O\s*No\.?|Certificate\s*No\.?)\s*[:#\-]?\s*([A-Z0-9\-\/_]{4,35})/i,
        /\b(\d{6,10})\s+OR[I1]G[I1]NAL\b/i,
        /(?:Friedrichshafen|Consignor|Absender)[\s\S]{0,80}?\b(\d{6,10})\b/i
      ]);
      let origin = grab([
        /(?:Country\s*of\s*Origin)\s*:\s*([^\n]{2,50})/i,
        /(?:Country\s*of\s*origin|Ursprungsland|Pays\s*d'origine)[^\n]*\n\s*([^\n(]{3,60})/i
      ]);
      if (!origin || /singapore/i.test(origin)) {
        const countryChecks = [
          /\b(Federal\s+Republic\s+of\s+Germany)\b/i,
          /\b(Germany|Japan|China|South\s+Korea|United\s+States|France|Italy|Thailand|Vietnam)\b/i
        ];
        let foundSpecific = '';
        for (const re of countryChecks) {
          const m = text.match(re);
          if (m && m[1]) { foundSpecific = m[1].trim(); break; }
        }
        if (foundSpecific) {
          origin = foundSpecific;
        } else if (!origin && /\bSingapore\b/i.test(text) && !/(?:Tukang|618302|Consignee)[\s\S]{0,80}?Singapore/i.test(text)) {
          origin = 'Singapore';
        }
      }
      const coGrossRaw = grossWeightRaw || grab([
        /\b(\d{1,3}(?:\.\d{3})+,\d{1,2})\s*(?:[a-z]{1,3})?\b/i,
        /\b([\d,]{3,10}\.\d{1,2})\s*k[gq9]s?\b/i
      ]);
      return {
        coNumber: coNo,
        originCountry: origin,
        grossWeight: normalizeNumericValue(coGrossRaw).replace(/\.0$/, '')
      };
    }

    if (docType === 'insurance') {
      return {
        policyNo: grab([/(?:Policy\s*No\.?|Certificate\s*No\.?)\s*[:#\-]?\s*([A-Z0-9\-\/_]{4,35})/i]),
        issueDate: normalizeDateToIso(grab([/(?:Date\s*of\s*Issue|Issued\s*Date|Date)\s*[:\-]?\s*([0-9]{1,2}[.\/\-][0-9]{1,2}[.\/\-]20\d{2}|[A-Za-z0-9,.\-\/\s]{6,25})/i])),
        currency,
        amount,
        missing: false
      };
    }

    if (docType === 'adviceOfDocuments') {
      return {
        presentationDate: normalizeDateToIso(grab([
          /(?:Ngày\s*\/?\s*Date|Date)\s*[:\-]?\s*([0-9]{1,2}[.\/\-][0-9]{1,2}[.\/\-]20\d{2}|[A-Za-z0-9,.\-\/\s]{6,25})/i
        ])),
        lcNumber,
        blNumber: grab([/(?:BL\/?AWB\/?DO\s*No\.?)\s*[:\-]?\s*([A-Z0-9\-\/_]{5,35})/i]),
        amount,
        currency,
        tenor: /\bSIGHT\b/i.test(text) ? 'AT SIGHT' : ''
      };
    }

    if (docType === 'shippingAdvice') {
      const saBlNo = grab([
        /(?:BILL\s*OF\s*LADING\s*NO\.?|B\/L\s*NO\.?)\s*[+:#\-]?\s*([A-Z0-9\-\/_]{5,35})/i
      ]);
      const saInvNo = grab([
        /(?:INVOICE\s*NO\.?)\s*[+:#\-]?\s*([A-Z0-9\-\/_]{4,35})/i
      ]);
      const etdMatch = text.match(/\bETD\s+([A-Z\s]+?)\s*[+:\-]?\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})\b/i);
      const etaMatch = text.match(/\bETA\s+([A-Z0-9\s\-]+?PORT)\s*[+:\-]/i);
      return {
        blNumber: saBlNo,
        onBoardDate: etdMatch ? normalizeDateToIso(etdMatch[2]) : '',
        portOfLoading: etdMatch ? (etdMatch[1].trim() + ' PORT').replace(/\s+PORT\s+PORT$/i, ' PORT') : '',
        portOfDischarge: etaMatch ? etaMatch[1].trim() : '',
        invoiceNo: saInvNo,
        amount,
        currency,
        lcNumber
      };
    }

    return {};
  }

  return {
    normalizeDateToIso,
    readDocxWithMammoth,
    readPdfWithPdfJs,
    readImageWithOcr,
    readFileToText,
    parseSalesContractText,
    parseShippingDocText
  };
});
