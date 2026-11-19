'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const validation = require('./validation');
const { createRepository } = require('./db');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VALIDATION_FILE = path.join(__dirname, 'validation.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw));
      } catch (_err) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function createServer(repo) {
  const repository = repo || createRepository();

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = urlObj.pathname;
      const method = req.method.toUpperCase();

      if (pathname === '/api/health' && method === 'GET') {
        sendJson(res, 200, {
          status: 'UP',
          service: 'Ocean Carrier e-Commerce Portal Simulator (e-SI & SOLAS VGM)',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (pathname === '/api/specs' && method === 'GET') {
        sendJson(res, 200, {
          equipmentSpecs: validation.EQUIPMENT_SPECS,
          carrierProfiles: validation.CARRIER_PROFILES,
          blTypes: validation.BL_TYPES,
          freightTerms: validation.FREIGHT_TERMS,
          packageTypes: validation.PACKAGE_TYPES
        });
        return;
      }

      if (pathname === '/api/tools/iso6346-check' && method === 'POST') {
        const body = await readJsonBody(req);
        if (body.prefix10 && !body.containerNo) {
          const calc = validation.calculateIso6346CheckDigit(body.prefix10);
          sendJson(res, calc.valid ? 200 : 422, calc);
          return;
        }
        const check = validation.validateContainerNumber(body.containerNo);
        sendJson(res, 200, check);
        return;
      }

      if (pathname === '/api/shipments' && method === 'GET') {
        const shipments = repository.listShipments();
        sendJson(res, 200, { shipments });
        return;
      }

      const shipmentMatch = pathname.match(/^\/api\/shipments\/([^/]+)$/);
      if (shipmentMatch) {
        const bookingNo = decodeURIComponent(shipmentMatch[1]);
        if (method === 'GET') {
          const shipment = repository.getShipment(bookingNo);
          if (!shipment) {
            sendJson(res, 404, {
              error: `Booking "${validation.normalizeBookingNo(bookingNo)}" has not been declared on this portal yet.`
            });
            return;
          }
          sendJson(res, 200, { shipment });
          return;
        }
        if (method === 'DELETE') {
          const deleted = repository.deleteShipment(bookingNo);
          if (!deleted.ok) {
            sendJson(res, 404, { error: 'Shipment not found.' });
            return;
          }
          sendJson(res, 200, { ok: true, deletedBookingNo: validation.normalizeBookingNo(bookingNo) });
          return;
        }
      }

      const actionMatch = pathname.match(/^\/api\/shipments\/([^/]+)\/(si\/draft|si\/submit|vgm\/submit|bl\/approve)$/);
      if (actionMatch && method === 'POST') {
        const bookingNo = decodeURIComponent(actionMatch[1]);
        const action = actionMatch[2];
        const body = await readJsonBody(req);

        let result;
        if (action === 'si/draft') {
          result = repository.saveSiDraft(bookingNo, body);
        } else if (action === 'si/submit') {
          result = repository.submitSi(bookingNo, body);
        } else if (action === 'vgm/submit') {
          result = repository.submitVgm(bookingNo, body);
        } else if (action === 'bl/approve') {
          result = repository.approveFinalBl(bookingNo, body.actor);
        }

        if (!result.ok) {
          sendJson(res, result.status || 422, { ok: false, errors: result.errors });
          return;
        }
        sendJson(res, 200, { ok: true, shipment: result.shipment });
        return;
      }

      // Serve shared browser/node validation engine
      if (pathname === '/src/validation.js' && method === 'GET') {
        sendFile(res, VALIDATION_FILE);
        return;
      }

      // Serve static assets
      if (method === 'GET' && !pathname.startsWith('/api/')) {
        const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const safePath = path.normalize(path.join(PUBLIC_DIR, relPath));
        if (!safePath.startsWith(PUBLIC_DIR)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
          sendFile(res, safePath);
          return;
        }
        // Fallback to SPA entry
        sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
        return;
      }

      sendJson(res, 404, { error: 'Endpoint not found.' });
    } catch (err) {
      if (err && err.message === 'INVALID_JSON') {
        sendJson(res, 400, {
          ok: false,
          errors: [{
            code: 'INVALID_JSON',
            field: 'body',
            message: 'Request body must be valid JSON.',
            remediation: 'Verify JSON payload syntax.'
          }]
        });
        return;
      }
      if (err && err.message === 'PAYLOAD_TOO_LARGE') {
        sendJson(res, 413, { ok: false, error: 'Payload too large.' });
        return;
      }
      console.error('Unhandled server error:', err);
      sendJson(res, 500, { ok: false, error: 'Internal server error.' });
    }
  });

  return { server, repository };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const { server } = createServer();
  server.listen(port, host, () => {
    console.log(`Ocean Carrier e-Commerce Portal Simulator listening at http://${host}:${port}`);
  });
}

module.exports = { createServer };
