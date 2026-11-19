'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const validation = require('./validation');

function createRepository(dbPath) {
  const resolvedPath = dbPath || path.join(__dirname, '..', 'data', 'portal.sqlite');
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS shipments (
      booking_no TEXT PRIMARY KEY,
      carrier_line TEXT NOT NULL,
      vessel_name TEXT,
      voyage_no TEXT,
      port_of_loading TEXT,
      port_of_discharge TEXT,
      bl_no TEXT,
      si_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      si_version INTEGER NOT NULL DEFAULT 0,
      vgm_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      vgm_version INTEGER NOT NULL DEFAULT 0,
      bl_status TEXT NOT NULL DEFAULT 'NONE',
      si_data_json TEXT,
      vgm_data_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_no TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      actor TEXT,
      summary TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_booking ON audit_logs (booking_no, id DESC);
  `);

  function mapShipmentRow(row) {
    if (!row) return null;
    const siData = row.si_data_json ? JSON.parse(row.si_data_json) : null;
    const vgmData = row.vgm_data_json ? JSON.parse(row.vgm_data_json) : null;
    return {
      bookingNo: row.booking_no,
      carrierLine: row.carrier_line,
      vesselName: row.vessel_name || '',
      voyageNo: row.voyage_no || '',
      portOfLoading: row.port_of_loading || '',
      portOfDischarge: row.port_of_discharge || '',
      blNo: row.bl_no || '',
      siStatus: row.si_status,
      siVersion: row.si_version,
      vgmStatus: row.vgm_status,
      vgmVersion: row.vgm_version,
      blStatus: row.bl_status,
      siData,
      vgmData,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function getAuditLogs(bookingNo) {
    const stmt = db.prepare(`
      SELECT id, booking_no, doc_type, version, actor, summary, created_at
      FROM audit_logs
      WHERE booking_no = ?
      ORDER BY id DESC
    `);
    return stmt.all(bookingNo).map((r) => ({
      id: r.id,
      bookingNo: r.booking_no,
      docType: r.doc_type,
      version: r.version,
      actor: r.actor || 'SYSTEM',
      summary: r.summary,
      createdAt: r.created_at
    }));
  }

  function insertAudit(bookingNo, docType, version, actor, summary, payload) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO audit_logs (booking_no, doc_type, version, actor, summary, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(bookingNo, docType, version, actor || 'DOCUMENTATION_USER', summary, payload ? JSON.stringify(payload) : null, now);
  }

  function buildBlNo(carrierLine, bookingNo) {
    const profile = validation.CARRIER_PROFILES[carrierLine];
    const scac = profile ? profile.scac : 'SHIP';
    return bookingNo.startsWith(scac) ? bookingNo : `${scac}${bookingNo}`;
  }

  function listShipments() {
    const rows = db.prepare(`SELECT * FROM shipments ORDER BY updated_at DESC`).all();
    return rows.map((row) => {
      const mapped = mapShipmentRow(row);
      const siConts = mapped.siData?.containers || [];
      const vgmConts = mapped.vgmData?.containers || [];
      const containerCount = Math.max(siConts.length, vgmConts.length);
      const totalCargoKgm = siConts.reduce((acc, c) => acc + (Number(c.cargoGrossWeightKgm) || 0), 0);
      const totalVgmKgm = vgmConts.reduce((acc, c) => acc + (Number(c.vgmWeightKgm) || 0), 0);
      return {
        bookingNo: mapped.bookingNo,
        carrierLine: mapped.carrierLine,
        vesselName: mapped.vesselName,
        voyageNo: mapped.voyageNo,
        portOfLoading: mapped.portOfLoading,
        portOfDischarge: mapped.portOfDischarge,
        blNo: mapped.blNo,
        siStatus: mapped.siStatus,
        siVersion: mapped.siVersion,
        vgmStatus: mapped.vgmStatus,
        vgmVersion: mapped.vgmVersion,
        blStatus: mapped.blStatus,
        containerCount,
        totalCargoKgm: validation.round2(totalCargoKgm),
        totalVgmKgm: validation.round2(totalVgmKgm),
        updatedAt: mapped.updatedAt
      };
    });
  }

  function getShipment(bookingNoInput) {
    const bookingNo = validation.normalizeBookingNo(bookingNoInput);
    if (!bookingNo) return null;
    const row = db.prepare(`SELECT * FROM shipments WHERE booking_no = ?`).get(bookingNo);
    if (!row) return null;
    const shipment = mapShipmentRow(row);
    shipment.auditLogs = getAuditLogs(bookingNo);
    return shipment;
  }

  function saveSiDraft(bookingNoInput, payload) {
    const bookingNo = validation.normalizeBookingNo(bookingNoInput || payload?.bookingNo);
    if (!/^[A-Z0-9-]{5,20}$/.test(bookingNo)) {
      return {
        ok: false,
        status: 422,
        errors: [{
          code: 'INVALID_BOOKING_NO',
          field: 'bookingNo',
          message: `Booking No. "${bookingNo || '(empty)'}" is invalid. Expected 5–20 uppercase alphanumeric/hyphen characters.`,
          remediation: 'Enter a valid Booking No. before saving a draft.'
        }]
      };
    }

    const existing = getShipment(bookingNo);
    if (existing && existing.siStatus === 'SUBMITTED') {
      return {
        ok: false,
        status: 409,
        errors: [{
          code: 'SI_ALREADY_SUBMITTED',
          field: 'siStatus',
          message: 'Submitted e-SI cannot be overwritten by a Draft. Use "Submit SI Amendment" to submit a formal revision.',
          remediation: 'Edit the fields and click "Submit SI Amendment" with an amendment reason.'
        }]
      };
    }

    const carrierLine = validation.CARRIER_PROFILES[validation.normalizeUpper(payload?.carrierLine)]
      ? validation.normalizeUpper(payload.carrierLine)
      : (existing?.carrierLine || 'ONE');

    const now = new Date().toISOString();
    const draftPayload = Object.assign({}, payload, { bookingNo, carrierLine });
    const blNo = buildBlNo(carrierLine, bookingNo);

    if (!existing) {
      db.prepare(`
        INSERT INTO shipments (
          booking_no, carrier_line, vessel_name, voyage_no, port_of_loading, port_of_discharge,
          bl_no, si_status, si_version, vgm_status, vgm_version, bl_status,
          si_data_json, vgm_data_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, 'NOT_STARTED', 0, 'NONE', ?, NULL, ?, ?)
      `).run(
        bookingNo,
        carrierLine,
        validation.normalizeUpper(payload?.vesselName),
        validation.normalizeUpper(payload?.voyageNo),
        validation.normalizeUpper(payload?.portOfLoading),
        validation.normalizeUpper(payload?.portOfDischarge),
        blNo,
        JSON.stringify(draftPayload),
        now,
        now
      );
    } else {
      db.prepare(`
        UPDATE shipments
        SET carrier_line = ?,
            vessel_name = COALESCE(NULLIF(?, ''), vessel_name),
            voyage_no = COALESCE(NULLIF(?, ''), voyage_no),
            port_of_loading = COALESCE(NULLIF(?, ''), port_of_loading),
            port_of_discharge = COALESCE(NULLIF(?, ''), port_of_discharge),
            bl_no = ?,
            si_status = 'DRAFT',
            si_data_json = ?,
            updated_at = ?
        WHERE booking_no = ?
      `).run(
        carrierLine,
        validation.normalizeUpper(payload?.vesselName),
        validation.normalizeUpper(payload?.voyageNo),
        validation.normalizeUpper(payload?.portOfLoading),
        validation.normalizeUpper(payload?.portOfDischarge),
        blNo,
        JSON.stringify(draftPayload),
        now,
        bookingNo
      );
    }

    insertAudit(bookingNo, 'SI_DRAFT', existing?.siVersion || 0, 'DOCUMENTATION_USER', 'Saved e-SI working draft.', draftPayload);
    return { ok: true, status: 200, shipment: getShipment(bookingNo) };
  }

  function submitSi(bookingNoInput, payload) {
    const bookingNo = validation.normalizeBookingNo(bookingNoInput || payload?.bookingNo);
    const mergedPayload = Object.assign({}, payload, { bookingNo });
    const existing = getShipment(bookingNo);
    const existingVgm = existing && existing.vgmStatus === 'SUBMITTED' ? existing.vgmData : null;

    const result = validation.validateSiSubmission(mergedPayload, existingVgm);
    if (!result.valid) {
      return { ok: false, status: 422, errors: result.errors };
    }

    const isAmendment = existing && existing.siStatus === 'SUBMITTED';
    if (isAmendment && !result.normalized.amendmentReason) {
      return {
        ok: false,
        status: 422,
        errors: [{
          code: 'AMENDMENT_REASON_REQUIRED',
          field: 'amendmentReason',
          message: 'SI Amendment Reason is mandatory when revising a previously submitted Shipping Instruction.',
          remediation: 'Enter the reason for B/L revision (e.g., "Update seal number per stuffing report").'
        }]
      };
    }

    const norm = result.normalized;
    const now = new Date().toISOString();
    const nextVersion = existing ? existing.siVersion + 1 : 1;
    const blNo = buildBlNo(norm.carrierLine, bookingNo);
    const nextBlStatus = 'DRAFT_ISSUED';

    if (!existing) {
      db.prepare(`
        INSERT INTO shipments (
          booking_no, carrier_line, vessel_name, voyage_no, port_of_loading, port_of_discharge,
          bl_no, si_status, si_version, vgm_status, vgm_version, bl_status,
          si_data_json, vgm_data_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, 'NOT_STARTED', 0, ?, ?, NULL, ?, ?)
      `).run(
        bookingNo,
        norm.carrierLine,
        norm.vesselName,
        norm.voyageNo,
        norm.portOfLoading,
        norm.portOfDischarge,
        blNo,
        nextVersion,
        nextBlStatus,
        JSON.stringify(norm),
        now,
        now
      );
    } else {
      db.prepare(`
        UPDATE shipments
        SET carrier_line = ?,
            vessel_name = ?,
            voyage_no = ?,
            port_of_loading = ?,
            port_of_discharge = ?,
            bl_no = ?,
            si_status = 'SUBMITTED',
            si_version = ?,
            bl_status = ?,
            si_data_json = ?,
            updated_at = ?
        WHERE booking_no = ?
      `).run(
        norm.carrierLine,
        norm.vesselName,
        norm.voyageNo,
        norm.portOfLoading,
        norm.portOfDischarge,
        blNo,
        nextVersion,
        nextBlStatus,
        JSON.stringify(norm),
        now,
        bookingNo
      );
    }

    const totalCargo = validation.round2(norm.containers.reduce((acc, c) => acc + c.cargoGrossWeightKgm, 0));
    const summary = isAmendment
      ? `Submitted e-SI Amendment v${nextVersion} (${norm.containers.length} cntr, ${totalCargo} KGS). Reason: ${norm.amendmentReason}`
      : `Submitted initial e-SI v${nextVersion} (${norm.containers.length} cntr, ${totalCargo} KGS). Draft B/L generated.`;

    insertAudit(bookingNo, isAmendment ? 'SI_AMEND' : 'SI_SUBMIT', nextVersion, 'DOCUMENTATION_USER', summary, norm);
    return { ok: true, status: 200, shipment: getShipment(bookingNo) };
  }

  function submitVgm(bookingNoInput, payload) {
    const bookingNo = validation.normalizeBookingNo(bookingNoInput || payload?.bookingNo);
    const mergedPayload = Object.assign({}, payload, { bookingNo });
    const existing = getShipment(bookingNo);
    const existingSi = existing && existing.siData ? existing.siData : null;

    const result = validation.validateVgmSubmission(mergedPayload, existingSi);
    if (!result.valid) {
      return { ok: false, status: 422, errors: result.errors };
    }

    const isAmendment = existing && existing.vgmStatus === 'SUBMITTED';
    if (isAmendment && !result.normalized.amendmentReason) {
      return {
        ok: false,
        status: 422,
        errors: [{
          code: 'AMENDMENT_REASON_REQUIRED',
          field: 'amendmentReason',
          message: 'VGM Amendment Reason is mandatory when revising a previously declared SOLAS VGM.',
          remediation: 'Enter the reason for VGM revision (e.g., "Terminal weighbridge re-weighing update").'
        }]
      };
    }

    const norm = result.normalized;
    const now = new Date().toISOString();
    const nextVersion = existing ? existing.vgmVersion + 1 : 1;
    const blNo = buildBlNo(norm.carrierLine, bookingNo);
    const nextBlStatus = existing && existing.blStatus === 'FINAL_CONFIRMED' ? 'DRAFT_ISSUED' : (existing?.blStatus || 'NONE');

    if (!existing) {
      db.prepare(`
        INSERT INTO shipments (
          booking_no, carrier_line, vessel_name, voyage_no, port_of_loading, port_of_discharge,
          bl_no, si_status, si_version, vgm_status, vgm_version, bl_status,
          si_data_json, vgm_data_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '', '', ?, 'NOT_STARTED', 0, 'SUBMITTED', ?, 'NONE', NULL, ?, ?, ?)
      `).run(
        bookingNo,
        norm.carrierLine,
        norm.vesselName,
        norm.voyageNo,
        blNo,
        nextVersion,
        JSON.stringify(norm),
        now,
        now
      );
    } else {
      db.prepare(`
        UPDATE shipments
        SET carrier_line = COALESCE(NULLIF(carrier_line, ''), ?),
            vessel_name = COALESCE(NULLIF(vessel_name, ''), ?),
            voyage_no = COALESCE(NULLIF(voyage_no, ''), ?),
            vgm_status = 'SUBMITTED',
            vgm_version = ?,
            bl_status = ?,
            vgm_data_json = ?,
            updated_at = ?
        WHERE booking_no = ?
      `).run(
        norm.carrierLine,
        norm.vesselName,
        norm.voyageNo,
        nextVersion,
        nextBlStatus,
        JSON.stringify(norm),
        now,
        bookingNo
      );
    }

    const totalVgm = validation.round2(norm.containers.reduce((acc, c) => acc + c.vgmWeightKgm, 0));
    const summary = isAmendment
      ? `Submitted SOLAS VGM Amendment v${nextVersion} by ${norm.authorizedPerson} (${norm.containers.length} cntr, Total VGM: ${totalVgm} KGS). Reason: ${norm.amendmentReason}`
      : `Submitted SOLAS VGM v${nextVersion} by ${norm.authorizedPerson} (${norm.containers.length} cntr, Total VGM: ${totalVgm} KGS).`;

    insertAudit(bookingNo, isAmendment ? 'VGM_AMEND' : 'VGM_SUBMIT', nextVersion, norm.authorizedPerson, summary, norm);
    return { ok: true, status: 200, shipment: getShipment(bookingNo) };
  }

  function approveFinalBl(bookingNoInput, actorInput) {
    const bookingNo = validation.normalizeBookingNo(bookingNoInput);
    const existing = getShipment(bookingNo);
    const check = validation.validateBlApproval(existing);
    if (!check.valid) {
      return { ok: false, status: 422, errors: check.errors };
    }

    const actor = validation.normalizeUpper(actorInput) || 'SHIPPER_APPROVER';
    const now = new Date().toISOString();
    db.prepare(`UPDATE shipments SET bl_status = 'FINAL_CONFIRMED', updated_at = ? WHERE booking_no = ?`).run(now, bookingNo);
    insertAudit(
      bookingNo,
      'BL_FINAL_APPROVE',
      existing.siVersion,
      actor,
      `Final B/L ${existing.blNo} confirmed after SOLAS VGM & e-SI reconciliation.`,
      null
    );
    return { ok: true, status: 200, shipment: getShipment(bookingNo) };
  }

  function deleteShipment(bookingNoInput) {
    const bookingNo = validation.normalizeBookingNo(bookingNoInput);
    const existing = getShipment(bookingNo);
    if (!existing) {
      return { ok: false, status: 404 };
    }
    db.prepare(`DELETE FROM audit_logs WHERE booking_no = ?`).run(bookingNo);
    db.prepare(`DELETE FROM shipments WHERE booking_no = ?`).run(bookingNo);
    return { ok: true, status: 200 };
  }

  function close() {
    db.close();
  }

  return {
    db,
    listShipments,
    getShipment,
    saveSiDraft,
    submitSi,
    submitVgm,
    approveFinalBl,
    deleteShipment,
    close
  };
}

module.exports = { createRepository };
