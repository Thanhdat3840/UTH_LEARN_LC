'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../src/validation');
const { createRepository } = require('../src/db');
const { createServer } = require('../src/server');

function buildValidSi(overrides) {
  return Object.assign({
    bookingNo: 'BKG20260001',
    carrierLine: 'ONE',
    blType: 'ORIGINAL',
    noOfOriginals: 3,
    freightTerms: 'PREPAID',
    placeOfIssue: 'HO CHI MINH CITY, VIETNAM',
    vesselName: 'ONE COMPETENCE',
    voyageNo: '092E',
    placeOfReceipt: 'CAT LAI PORT, HCMC',
    portOfLoading: 'VNSGN',
    portOfDischarge: 'USLAX',
    placeOfDelivery: 'LOS ANGELES, CA',
    shipper: 'ABC FURNITURE EXPORT CO., LTD\n123 NGUYEN VAN LINH, DIST 7\nHO CHI MINH CITY, VIETNAM\nTAX ID: 0301234567',
    consignee: 'PACIFIC HOME IMPORTS LLC\n450 ALAMEDA STREET, SUITE 200\nLOS ANGELES, CA 90013, USA\nEIN: 95-4411220',
    notifyParty: 'SAME AS CONSIGNEE',
    hsCode: '940360',
    marksAndNumbers: 'ABC/LAX\nPO# 2026-991\nMADE IN VIETNAM',
    goodsDescription: 'WOODEN DINING TABLES AND CHAIRS\nKNOCKED DOWN IN EXPORT CARTONS\nHS CODE: 940360',
    specialClauses: '14 DAYS FREE TIME AT POD',
    containers: [
      {
        containerNo: 'CSQU3054383',
        sealNo: 'ONEY991234',
        sizeType: '40HC',
        packageCount: 640,
        packageType: 'CARTONS',
        cargoGrossWeightKgm: 18500,
        measurementCbm: 58.4
      }
    ]
  }, overrides || {});
}

function buildValidVgm(overrides) {
  return Object.assign({
    bookingNo: 'BKG20260001',
    carrierLine: 'ONE',
    vesselName: 'ONE COMPETENCE',
    voyageNo: '092E',
    authorizedPerson: 'NGUYEN VAN A',
    declarantCompany: 'ABC FURNITURE EXPORT CO., LTD',
    weighbridgeRef: 'WB-CL-2026-101',
    weighingDateTime: '2026-11-14T10:30',
    solasDeclarationAccepted: true,
    containers: [
      {
        containerNo: 'CSQU3054383',
        sizeType: '40HC',
        method: 'METHOD_2',
        cargoWeightKgm: 18200,
        dunnageWeightKgm: 300,
        tareWeightKgm: 3940,
        maxGrossWeightKgm: 32500,
        vgmWeightKgm: 22440
      }
    ]
  }, overrides || {});
}

test('ISO 6346: validates known container and computes Modulo-11 including remainder 10 -> 0', () => {
  const okRes = validation.validateContainerNumber('CSQU3054383');
  assert.equal(okRes.valid, true);
  assert.equal(okRes.expectedCheckDigit, 3);

  // Find a 10-char prefix whose Modulo-11 remainder is 10 and verify check digit becomes 0
  let prefixRem10 = null;
  for (let n = 100000; n < 100200; n++) {
    const candidate = `MSCU${n}`;
    const c = validation.calculateIso6346CheckDigit(candidate);
    if (c.valid && c.remainder === 10) {
      prefixRem10 = c;
      break;
    }
  }
  assert.ok(prefixRem10, 'Should find a prefix with remainder 10');
  assert.equal(prefixRem10.checkDigit, 0);
  assert.equal(validation.validateContainerNumber(prefixRem10.fullContainerNo).valid, true);

  // Bad check digit
  const badCd = validation.validateContainerNumber('CSQU3054389');
  assert.equal(badCd.valid, false);
  assert.equal(badCd.expectedCheckDigit, 3);

  // Invalid category char
  const badCat = validation.validateContainerNumber('CSQA3054383');
  assert.equal(badCat.valid, false);
  assert.match(badCat.error, /category identifier must be U, J, or Z/i);
});

test('SOLAS VGM validation enforces Method 2 math, CSC overweight hard stop, ALL CAPS signatory, and checkbox', () => {
  const valid = validation.validateVgmSubmission(buildValidVgm(), null);
  assert.equal(valid.valid, true);

  const method2Mismatch = validation.validateVgmSubmission(buildValidVgm({
    containers: [{
      containerNo: 'CSQU3054383',
      sizeType: '40HC',
      method: 'METHOD_2',
      cargoWeightKgm: 18000,
      dunnageWeightKgm: 300,
      tareWeightKgm: 3940,
      maxGrossWeightKgm: 32500,
      vgmWeightKgm: 22440
    }]
  }), null);
  assert.equal(method2Mismatch.valid, false);
  assert.ok(method2Mismatch.errors.some((e) => e.code === 'METHOD2_SUM_MISMATCH'));

  const overweight = validation.validateVgmSubmission(buildValidVgm({
    containers: [{
      containerNo: 'CSQU3054383',
      sizeType: '40HC',
      method: 'METHOD_1',
      tareWeightKgm: 3940,
      maxGrossWeightKgm: 32500,
      vgmWeightKgm: 33000
    }]
  }), null);
  assert.equal(overweight.valid, false);
  assert.ok(overweight.errors.some((e) => e.code === 'SOLAS_OVERWEIGHT_CSC'));

  const badSignatory = validation.validateVgmSubmission(buildValidVgm({
    authorizedPerson: 'Nguyen Van A',
    solasDeclarationAccepted: false
  }), null);
  assert.equal(badSignatory.valid, false);
  assert.ok(badSignatory.errors.some((e) => e.code === 'VGM_SIGNATORY_FORMAT'));
  assert.ok(badSignatory.errors.some((e) => e.code === 'SOLAS_DECLARATION_UNCHECKED'));
});

test('e-SI validation enforces UN/EDIFACT party box bounds, negotiability rules, seal, and cargo rules', () => {
  const okRes = validation.validateSiSubmission(buildValidSi(), null);
  assert.equal(okRes.valid, true);

  const badEdiAndGoods = validation.validateSiSubmission(buildValidSi({
    shipper: 'LINE1\nLINE2\nLINE3\nLINE4\nLINE5\nLINE6_OVERFLOW',
    consignee: 'TO ORDER OF BANK OF AMERICA\n1234567890123456789012345678901234567890',
    notifyParty: 'SAME AS CONSIGNEE',
    blType: 'SEAWAYBILL',
    noOfOriginals: 0,
    portOfDischarge: 'VNSGN',
    goodsDescription: 'GENERAL CARGO',
    containers: [{
      containerNo: 'CSQU3054383',
      sealNo: 'TBA',
      sizeType: '40HC',
      packageCount: 100,
      packageType: 'CARTONS',
      cargoGrossWeightKgm: 18500,
      measurementCbm: 99.0
    }]
  }), null);

  assert.equal(badEdiAndGoods.valid, false);
  const codes = new Set(badEdiAndGoods.errors.map((e) => e.code));
  assert.ok(codes.has('EDI_PARTY_MAX_LINES'));
  assert.ok(codes.has('EDI_PARTY_LINE_LENGTH'));
  assert.ok(codes.has('NEGOTIABLE_SEAWAYBILL_CONFLICT'));
  assert.ok(codes.has('TO_ORDER_NOTIFY_INVALID'));
  assert.ok(codes.has('POL_EQUALS_POD'));
  assert.ok(codes.has('VAGUE_GOODS_DESCRIPTION'));
  assert.ok(codes.has('INVALID_SEAL_NO'));
  assert.ok(codes.has('CBM_EXCEEDS_CAPACITY'));
});

test('SQLite Repository & HTTP API: enforces SI-VGM reconciliation, No-VGM-No-Final-BL, and Amendment lifecycle', async () => {
  const repo = createRepository(':memory:');
  const { server } = createServer(repo);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Submit valid SI
    const siRes = await fetch(`${baseUrl}/api/shipments/BKG20260001/si/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidSi())
    });
    assert.equal(siRes.status, 200);
    const siJson = await siRes.json();
    assert.equal(siJson.shipment.siStatus, 'SUBMITTED');
    assert.equal(siJson.shipment.blStatus, 'DRAFT_ISSUED');
    assert.equal(siJson.shipment.siVersion, 1);

    // 2. Try approving Final B/L before VGM -> MUST fail with 422 NO_VGM_NO_FINAL_BL
    const blBlockRes = await fetch(`${baseUrl}/api/shipments/BKG20260001/bl/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'SHIPPER' })
    });
    assert.equal(blBlockRes.status, 422);
    const blBlockJson = await blBlockRes.json();
    assert.ok(blBlockJson.errors.some((e) => e.code === 'NO_VGM_NO_FINAL_BL'));

    // 3. Submit VGM with mismatched cargo weight -> MUST fail with 422 SI_VGM_WEIGHT_MISMATCH
    const badVgmRes = await fetch(`${baseUrl}/api/shipments/BKG20260001/vgm/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidVgm({
        containers: [{
          containerNo: 'CSQU3054383',
          sizeType: '40HC',
          method: 'METHOD_1',
          tareWeightKgm: 3940,
          maxGrossWeightKgm: 32500,
          vgmWeightKgm: 23000
        }]
      }))
    });
    assert.equal(badVgmRes.status, 422);
    const badVgmJson = await badVgmRes.json();
    assert.ok(badVgmJson.errors.some((e) => e.code === 'SI_VGM_WEIGHT_MISMATCH'));

    // 4. Submit matching VGM -> 200 OK
    const goodVgmRes = await fetch(`${baseUrl}/api/shipments/BKG20260001/vgm/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidVgm())
    });
    assert.equal(goodVgmRes.status, 200);
    const goodVgmJson = await goodVgmRes.json();
    assert.equal(goodVgmJson.shipment.vgmStatus, 'SUBMITTED');
    assert.equal(goodVgmJson.shipment.vgmVersion, 1);

    // 5. Approve Final B/L -> 200 OK
    const blPassRes = await fetch(`${baseUrl}/api/shipments/BKG20260001/bl/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'NGUYEN VAN A' })
    });
    assert.equal(blPassRes.status, 200);
    const blPassJson = await blPassRes.json();
    assert.equal(blPassJson.shipment.blStatus, 'FINAL_CONFIRMED');

    // 6. Amend SI without reason -> 422 AMENDMENT_REASON_REQUIRED
    const amendFailRes = await fetch(`${baseUrl}/api/shipments/BKG20260001/si/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidSi({ specialClauses: '21 DAYS FREE TIME' }))
    });
    assert.equal(amendFailRes.status, 422);

    // 7. Amend SI with reason -> v2, reverts blStatus back to DRAFT_ISSUED
    const amendOkRes = await fetch(`${baseUrl}/api/shipments/BKG20260001/si/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildValidSi({
        specialClauses: '21 DAYS FREE TIME',
        amendmentReason: 'Update detention free time per carrier approval'
      }))
    });
    assert.equal(amendOkRes.status, 200);
    const amendOkJson = await amendOkRes.json();
    assert.equal(amendOkJson.shipment.siVersion, 2);
    assert.equal(amendOkJson.shipment.blStatus, 'DRAFT_ISSUED');
    assert.ok(amendOkJson.shipment.auditLogs.length >= 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    repo.close();
  }
});
